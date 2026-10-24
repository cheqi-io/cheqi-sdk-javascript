import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";
import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from "node:crypto";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("./fixtures/v2-crypto.json", import.meta.url), "utf8"));

function legacyDecrypt(encrypted) {
  const key = privateDecrypt({ key: createPrivateKey({ key: Buffer.from(fixture.privateKeyB64, "base64"),
    format: "der", type: "pkcs8" }), oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING },
  Buffer.from(encrypted.encryptedAesKey, "base64"));
  assert.equal(key.length, 32);
  const bytes = Buffer.from(encrypted.encryptedContent, "base64");
  assert.ok(bytes.length >= 12 + 16);
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
}

test("installed package works in Node and Chromium, with a small issuer bundle", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cheqi-consumer-"));
  let browser;
  try {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--json", "--cache", temp,
      "--pack-destination", temp],
      { cwd: root, encoding: "utf8" }));
    const packageDir = join(temp, "node_modules", "@cheqi", "sdk");
    await mkdir(packageDir, { recursive: true });
    execFileSync("tar", ["-xzf", join(temp, pack[0].filename), "-C", packageDir,
      "--strip-components=1"]);
    await cp(new URL("../node_modules/@xmldom/xmldom", import.meta.url),
      join(temp, "node_modules", "@xmldom", "xmldom"), { recursive: true });
    await copyFile(new URL("../test-fixtures/node-backend/index.mjs", import.meta.url), join(temp, "backend.mjs"));
    await copyFile(new URL("../test-fixtures/node-backend/types.mts", import.meta.url), join(temp, "types.mts"));
    assert.match(execFileSync("node", [join(temp, "backend.mjs")], { encoding: "utf8" }), /passed/);
    execFileSync(join(new URL("../node_modules/.bin/tsc", import.meta.url).pathname),
      ["--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022",
        "--strict", "--skipLibCheck", "--noEmit", join(temp, "types.mts")]);

    const fixtureDir = join(temp, "test-fixtures", "browser");
    await mkdir(fixtureDir, { recursive: true });
    await Promise.all(["index.ts", "browser-test.ts"].map((file) =>
      copyFile(new URL(`../test-fixtures/browser/${file}`, import.meta.url), join(fixtureDir, file))));
    execFileSync(join(new URL("../node_modules/.bin/tsc", import.meta.url).pathname),
      ["--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "--strict",
        "--skipLibCheck", "--noEmit", ...["index.ts", "browser-test.ts"]
          .map((file) => join(fixtureDir, file))]);
    const issuerBundle = join(temp, "issuer.js");
    const issuerBuild = await build({ entryPoints: [join(fixtureDir, "index.ts")], outfile: issuerBundle,
      bundle: true, platform: "browser", format: "esm", minify: true, metafile: true });
    const issuerCode = await readFile(issuerBundle);
    const gzipBytes = gzipSync(issuerCode).length;
    assert.ok(gzipBytes < 25_000, `issuer bundle is ${gzipBytes} gzip bytes`);
    assert.ok(Object.keys(issuerBuild.metafile.inputs).every((path) => !path.startsWith("node:")));
    assert.doesNotMatch(issuerCode.toString(), /\bBuffer\b|\brequire\s*\(|node:crypto|node:fs|node:path|process\.env/);

    const browserBundle = join(temp, "browser.js");
    await build({ entryPoints: [join(fixtureDir, "browser-test.ts")], outfile: browserBundle,
      bundle: true, platform: "browser", format: "esm", minify: true });
    const script = await readFile(browserBundle, "utf8");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => {
      if (new URL(route.request().url()).pathname === "/browser.js") {
        return route.fulfill({ status: 200, contentType: "text/javascript", body: script });
      }
      return route.fulfill({ status: 200, contentType: "text/html",
        body: '<html><script type="module">window.runFixture = import("/browser.js")</script></html>' });
    });
    await page.goto("https://fixture.test/");
    const result = await page.evaluate(async (fixture) => {
      const { runBrowserTests } = await window.runFixture;
      return runBrowserTests(fixture);
    }, fixture);
    assert.equal(result.issuer.result.cheqiReceiptId, "browser-receipt");
    assert.deepEqual(JSON.parse(JSON.stringify(result.decrypted)), result.envelope);
    assert.deepEqual(result.issuer.requests.map((request) => request.path),
      ["/recipient/resolve", "/receipt/encrypted"]);
    assert.ok(result.issuer.requests.every((request) => request.authorization === "Bearer short-lived-oauth-token"));
    assert.equal(result.issuer.requests[1].body.deviceDeliveries.length, 1);
    assert.equal(result.legacyPlaintext, fixture.plaintext);
    for (const encrypted of [result.spki, result.pkcs1]) {
      assert.equal(legacyDecrypt(encrypted), fixture.plaintext);
      assert.equal(Buffer.from(encrypted.encryptedContent, "base64").length, Buffer.byteLength(fixture.plaintext) + 12 + 16);
    }
    assert.equal(result.hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const injected = result.injectedIssuer;
    assert.equal(injected.result.cheqiReceiptId, "browser-receipt");
    assert.deepEqual(injected.requests.map((request) => request.path), ["/recipient/resolve", "/receipt/encrypted"]);
    assert.equal(injected.requests[0].body.cardDetails.paymentAccountReference, "PAR-SYNTHETIC-TEST");
    assert.deepEqual(JSON.parse(legacyDecrypt(injected.requests[1].body.deviceDeliveries[0])),
      JSON.parse(JSON.stringify(injected.payload)));
    const fallback = result.fallback;
    assert.deepEqual(fallback.requests.map((request) => request.path), ["/recipient/resolve", "/receipt/download"]);
    const upload = fallback.requests[1].body;
    assert.deepEqual(Object.keys(upload).sort(), ["ciphertext", "downloadId", "templateHash"]);
    assert.ok(fallback.result.downloadUrl.endsWith(`#${result.downloadKey}`));
    assert.ok(!JSON.stringify(fallback.requests).includes(result.downloadKey));
    assert.ok(!JSON.stringify([...injected.requests, ...fallback.requests]).includes(injected.payload.documentNumber));
    assert.equal(JSON.parse(result.download.documents.RECEIPT_PAYLOAD.content).documentNumber, fallback.payload.documentNumber);
    assert.match(result.download.receiptUuid, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
    assert.equal(result.tamperErrorCode, "DECRYPTION_ERROR");
    assert.equal(result.missingCrypto.name, "CryptoUnavailableError");
    assert.equal(result.missingCrypto.capability, "crypto.subtle");
    assert.match(result.missingCrypto.message, /crypto option/);
    console.log(`Issuer bundle: ${issuerCode.length} bytes raw, ${gzipBytes} bytes gzip`);
  } finally {
    await browser?.close();
    await rm(temp, { recursive: true, force: true });
  }
});
