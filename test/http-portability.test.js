import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheqiSDK, CheqiApiError, Environment, NoopLogger } from "../dist/index.js";
import { SDK_VERSION } from "../dist/version.js";
import { decodeKey } from "../dist/utils.js";

const options = { apiEndpoint: Environment.TEST, apiKey: "key", maxRetries: 0, logger: new NoopLogger() };

test("built SDK version and User-Agent match package.json", async () => {
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(SDK_VERSION, version);
  let userAgent;
  const sdk = new CheqiSDK({ ...options, fetch: async (_input, init) => {
    userAgent = init.headers["User-Agent"]; return Response.json([]);
  } });
  await sdk.companyService.listReceiptDestinations();
  assert.equal(userAgent, `CheqiSDK-TypeScript/${version}`);
});

test("release version bumps regenerate the embedded version without manual source edits", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cheqi-version-"));
  try {
    await mkdir(join(temp, "scripts"));
    await mkdir(join(temp, "src"));
    await copyFile(new URL("../scripts/generate-version.mjs", import.meta.url), join(temp, "scripts", "generate-version.mjs"));
    await writeFile(join(temp, "package.json"), JSON.stringify({ name: "version-fixture", version: "3.0.0" }));
    execFileSync(process.execPath, [join(temp, "scripts", "generate-version.mjs")]);
    execFileSync("npm", ["version", "3.0.1", "--no-git-tag-version", "--ignore-scripts", "--cache", join(temp, "cache")], { cwd: temp });
    execFileSync(process.execPath, [join(temp, "scripts", "generate-version.mjs")]);
    const generated = await readFile(join(temp, "src", "version.ts"), "utf8");
    const built = await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
    assert.equal(built.SDK_VERSION, "3.0.1");
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("timeouts work without AbortSignal.timeout, cover response bodies, and release completed timers", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
  t.after(() => Object.defineProperty(AbortSignal, "timeout", descriptor));
  const timeout = (error) => error instanceof CheqiApiError && error.errorCode === "TIMEOUT_ERROR";
  for (const bodyHangs of [false, true]) {
    let signal;
    const sdk = new CheqiSDK({ ...options, timeoutSeconds: 0.01, fetch: async (_input, init) => {
      signal = init.signal;
      const pending = () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      return bodyHangs ? { status: 200, headers: { get: () => null }, text: pending } : pending();
    } });
    await assert.rejects(() => sdk.companyService.listReceiptDestinations(), timeout);
    assert.equal(signal.aborted, true);
  }
  let completedSignal;
  const sdk = new CheqiSDK({ ...options, timeoutSeconds: 0.01, fetch: async (_input, init) => {
    completedSignal = init.signal; return Response.json([]);
  } });
  await sdk.companyService.listReceiptDestinations();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(completedSignal.aborted, false);
});

test("token provider failures and empty tokens are authentication errors without network retries", async () => {
  const cause = new Error("token issuer unavailable");
  for (const provider of [async () => { throw cause; }, async () => " "]) {
    let attempts = 0;
    let providerCalls = 0;
    const sdk = new CheqiSDK({ ...options, maxRetries: 2,
      accessTokenProvider: async () => { providerCalls++; return provider(); },
      fetch: async () => { attempts++; return Response.json([]); } });
    await assert.rejects(() => sdk.companyService.listReceiptDestinations(), (error) =>
      error instanceof CheqiApiError && error.errorCode === "AUTHENTICATION_FAILED" && /accessTokenProvider/.test(error.message));
    assert.equal(providerCalls, 1);
    assert.equal(attempts, 0);
  }
});

test("a retryable 401 resolves the token provider again once within the retry budget", async () => {
  const authorizations = [];
  let providerCalls = 0;
  const sdk = new CheqiSDK({ ...options, maxRetries: 2,
    accessTokenProvider: async () => ++providerCalls === 1 ? "expired" : "fresh",
    fetch: async (_input, init) => {
      authorizations.push(init.headers.Authorization);
      return authorizations.length === 1 ? new Response("{}", { status: 401 }) : Response.json([]);
    } });
  await sdk.companyService.listReceiptDestinations();
  assert.deepEqual(authorizations, ["Bearer expired", "Bearer fresh"]);
  assert.equal(providerCalls, 2);

  let unauthorizedCalls = 0;
  const rejected = new CheqiSDK({ ...options, maxRetries: 3, accessTokenProvider: async () => "still-expired",
    fetch: async () => { unauthorizedCalls++; return new Response("{}", { status: 401 }); } });
  await assert.rejects(() => rejected.companyService.listReceiptDestinations(), (error) => error.httpStatusCode === 401);
  assert.equal(unauthorizedCalls, 2, "401 refresh must not loop indefinitely");
});

test("401 refresh honors maxRetries=0, explicit credentials, and non-idempotent submissions", async () => {
  for (const mode of ["no-retries", "explicit-token", "submission"]) {
    let calls = 0;
    let providerCalls = 0;
    const sdk = new CheqiSDK({ ...options, maxRetries: mode === "no-retries" ? 0 : 2,
      accessTokenProvider: async () => { providerCalls++; return "provider-token"; },
      fetch: async () => { calls++; return new Response("{}", { status: 401 }); } });
    const request = mode === "submission"
      ? () => sdk.apiClient.submitEncryptedReceipt({ matchId: "match", deviceDeliveries: [
        { deviceRecipientId: "device", encryptedContent: "ciphertext", encryptedAesKey: "wrapped-key" }] })
      : () => sdk.companyService.listReceiptDestinations(mode === "explicit-token" ? { accessToken: "explicit" } : undefined);
    await assert.rejects(request, (error) => error.httpStatusCode === 401);
    assert.equal(calls, 1);
    assert.equal(providerCalls, mode === "explicit-token" ? 0 : 1);
  }
});

test("transport retries resolve fresh provider credentials on every attempt", async () => {
  const authorizations = [];
  const signals = [];
  let providerCalls = 0;
  const sdk = new CheqiSDK({ ...options, maxRetries: 1, accessTokenProvider: async () => `token-${++providerCalls}`,
    fetch: async (_input, init) => {
      authorizations.push(init.headers.Authorization);
      signals.push(init.signal);
      return authorizations.length === 1 ? new Response("{}", { status: 503, headers: { "Retry-After": "0" } }) : Response.json([]);
    } });
  await sdk.companyService.listReceiptDestinations();
  assert.deepEqual(authorizations, ["Bearer token-1", "Bearer token-2"]);
  assert.equal(signals[0].aborted, true, "release the discarded response when retrying");
  assert.equal(signals[1].aborted, false, "successful attempts release timers without aborting");
});

test("key decoding retains standard and URL-safe Base64 compatibility", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/v2-crypto.json", import.meta.url), "utf8"));
  assert.deepEqual(decodeKey(fixture.publicKeyB64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")),
    decodeKey(fixture.publicKeyB64));
  assert.throws(() => decodeKey("not!base64"));
});
