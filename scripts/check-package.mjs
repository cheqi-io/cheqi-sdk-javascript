import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageRootUrl = new URL("../", import.meta.url);
const root = fileURLToPath(packageRootUrl);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const requiredFiles = [
  "LICENSE",
  "README.md",
  packageJson.main,
  packageJson.types,
  packageJson.exports["./download"].default,
  packageJson.exports["./download"].types
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
