import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../src/models/generated/", import.meta.url));
for (const file of readdirSync(directory).filter(name => name.endsWith(".ts"))) {
  let source = readFileSync(`${directory}/${file}`, "utf8");
  if (source.includes("import { withRedactedInspection }")) continue;
  const candidates = ["client_secret", "access_token", "refresh_token", "id_token", "code_verifier"];
  if (file === "AuthorizationCodeExchangeRequest.ts") candidates.push("code");
  const fields = candidates.filter(name => new RegExp(`^    ${name}\\??:`, "m").test(source));
  if (!fields.length) continue;
  source = 'import { withRedactedInspection } from "../../utils/redacted-inspection.js";\n' + source;
  source = source.replace(/(export function \w+FromJSONTyped[\s\S]*?)return \{([\s\S]*?)\n    \};/,
    (_, prefix, properties) => `${prefix}return withRedactedInspection({${properties}\n    }, ${JSON.stringify(fields)});`);
  writeFileSync(`${directory}/${file}`, source);
}
