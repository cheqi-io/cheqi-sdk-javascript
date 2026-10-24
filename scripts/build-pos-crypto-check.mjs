import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// A module to import into a CLI-scaffolded test extension, not an extension/app scaffold.
const outfile = process.argv[2] ?? "test-fixtures/shopify-extension/dist/crypto-check.js";
await build({ absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: ["test-fixtures/shopify-extension/device-check.ts"], outfile,
  bundle: true, platform: "browser", format: "esm", minify: true });
await build({ absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: ["test-fixtures/shopify-extension/device-check.ts"], outfile: outfile.replace(/\.js$/, "") + ".console.js",
  bundle: true, platform: "browser", format: "iife", globalName: "CheqiCryptoCheck", minify: true });
console.log(`POS crypto check module: ${outfile}`);
