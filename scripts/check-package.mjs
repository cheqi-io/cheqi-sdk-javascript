import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRootUrl = new URL("../", import.meta.url);
const root = fileURLToPath(packageRootUrl);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const requiredFiles = [
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "docs/runtimes.md",
  "docs/migration-v3.md",
  "docs/pos-verification.md",
  packageJson.main,
  packageJson.types,
  packageJson.exports["./download"].default,
  ...Object.values(packageJson.exports).flatMap((entry) => [entry.import ?? entry.default, entry.types])
];

await Promise.all(requiredFiles.map(async (path) => {
  try {
    await access(new URL(path, packageRootUrl));
  } catch {
    throw new Error(`Required package file is missing: ${path} (package root: ${root})`);
  }
}));

if (!packageJson.files.includes("LICENSE")) {
  throw new Error("package.json files must include LICENSE");
}

console.log("Package artifact manifest is complete");

const cache = await mkdtemp(join(tmpdir(), "cheqi-pack-cache-"));
try {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--cache", cache],
    { cwd: root, encoding: "utf8" });
  const [artifact] = JSON.parse(output);
  if (!artifact?.files?.some((file) => file.path === "dist/issuer.js")) {
    throw new Error("Issuer entry point is missing from npm package");
  }
  if (artifact.files.some((file) => /^(?:test|test-fixtures|scripts)\//.test(file.path))) {
    throw new Error("Development diagnostics and test keys must not be published in the SDK");
  }
  console.log(`npm package verified: ${artifact.filename}`);
} finally {
  await rm(cache, { recursive: true, force: true });
}
