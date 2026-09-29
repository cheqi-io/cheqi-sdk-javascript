import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/** YAML mapping order and formatting do not change the OpenAPI contract. */
export function specsMatch(local, remote) {
  return isDeepStrictEqual(parse(local), parse(remote));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2];
  if (!url) throw new Error("An OpenAPI URL is required");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenAPI fetch failed: HTTP ${response.status}`);
  const local = await readFile(new URL("../openapi.yaml", import.meta.url), "utf8");
  if (!specsMatch(local, await response.text())) {
    console.error(`ERROR: Local openapi.yaml contract differs from ${url}`);
    console.error("Run 'make fetch-spec && make generate' to update.");
    process.exitCode = 1;
  } else {
    console.log(`openapi.yaml matches ${url}`);
  }
}
