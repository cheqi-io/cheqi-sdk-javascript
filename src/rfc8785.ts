function serializeString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("NaN and Infinity are not valid JSON values");
  }
  if (Object.is(value, -0) || value === 0) {
    return "0";
  }
  return String(value);
}

function serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return serializeNumber(value);
  }
  if (typeof value === "string") {
    return serializeString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${serializeString(key)}:${serialize(record[key])}`).join(",")}}`;
  }
  throw new TypeError(`Cannot canonicalize type: ${typeof value}`);
}

export function canonicalizeJson(value: string | object): string {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return serialize(parsed);
}
