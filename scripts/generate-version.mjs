import { readFile, writeFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await writeFile(new URL("../src/version.ts", import.meta.url),
  `// Generated from package.json by scripts/generate-version.mjs.\nexport const SDK_VERSION = ${JSON.stringify(version)};\n`);
