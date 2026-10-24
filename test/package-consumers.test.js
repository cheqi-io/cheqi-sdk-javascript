import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";
import { verifyPosCryptoReport } from "../scripts/verify-pos-crypto-report.mjs";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("./fixtures/v2-crypto.json", import.meta.url), "utf8"));

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

    const fixtureDir = join(temp, "test-fixtures", "shopify-extension");
    await mkdir(fixtureDir, { recursive: true });
    await mkdir(join(temp, "test", "fixtures"), { recursive: true });
    await Promise.all(["index.ts", "browser-test.ts", "device-check.ts"].map((file) =>
      copyFile(new URL(`../test-fixtures/shopify-extension/${file}`, import.meta.url), join(fixtureDir, file))));
    await copyFile(new URL("./fixtures/v2-crypto.json", import.meta.url), join(temp, "test", "fixtures", "v2-crypto.json"));
    execFileSync(join(new URL("../node_modules/.bin/tsc", import.meta.url).pathname),
      ["--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "--strict",
        "--skipLibCheck", "--resolveJsonModule", "--noEmit", ...["index.ts", "browser-test.ts", "device-check.ts"]
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
    const result = await page.evaluate(async ({ publicKey, privateKey }) => {
      const { runBrowserTests } = await window.runFixture;
      return runBrowserTests(publicKey, privateKey);
    }, { publicKey: fixture.publicKeyB64, privateKey: fixture.privateKeyB64 });
    assert.equal(result.issuer.result.cheqiReceiptId, "browser-receipt");
    assert.deepEqual(JSON.parse(JSON.stringify(result.decrypted)), result.envelope);
    assert.deepEqual(result.issuer.requests.map((request) => request.path),
      ["/recipient/resolve", "/receipt/encrypted"]);
    assert.ok(result.issuer.requests.every((request) => request.authorization === "Bearer short-lived-oauth-token"));
    assert.equal(result.issuer.requests[1].body.deviceDeliveries.length, 1);
    assert.equal(result.diagnostics.runtime, "non-pos");
    assert.equal(result.diagnostics.posVersion, null);
    assert.equal(result.diagnostics.passed, true, JSON.stringify(result.diagnostics.checks));
    assert.equal(result.missingCrypto.name, "CryptoUnavailableError");
    assert.equal(result.missingCrypto.capability, "crypto.subtle");
    assert.match(result.missingCrypto.message, /crypto option/);
    verifyPosCryptoReport(result.diagnostics, { allowNonPos: true });
    assert.throws(() => verifyPosCryptoReport(result.diagnostics), /not generated inside Shopify POS/);
    const corrupted = structuredClone(result.diagnostics);
    corrupted.artifacts.SPKI.encryptedContent = corrupted.artifacts.SPKI.encryptedContent.slice(0, -8) + "AAAAAAAA";
    assert.throws(() => verifyPosCryptoReport(corrupted, { allowNonPos: true }));
    console.log(`Issuer bundle: ${issuerCode.length} bytes raw, ${gzipBytes} bytes gzip`);
  } finally {
    await browser?.close();
    await rm(temp, { recursive: true, force: true });
  }
});
