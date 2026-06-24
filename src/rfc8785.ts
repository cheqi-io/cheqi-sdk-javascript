/**
 * RFC 8785-style JSON canonicalization, byte-compatible with the Cheqi Java SDK
 * `RFC8785Canonicalizer`:
 *  - object keys sorted lexicographically (UTF-16 code-unit order),
 *  - strings escaped exactly as Java/`JSON.stringify` (control chars < 0x20 as
 *    `\u00xx`; ` `/` ` left unescaped),
 *  - numbers rendered like Jackson: integral tokens as integers, decimal tokens
 *    via `BigDecimal.toPlainString()` (no scientific notation, original scale
 *    preserved).
 *
 * When the input is a JSON **string**, original number tokens are preserved so
 * the output matches the backend byte-for-byte (e.g. `12.10` stays `12.10`).
 * When the input is an already-parsed object, numbers are JS `number`s and the
 * original textual scale cannot be recovered (e.g. `12.10` becomes `12.1`).
 */

/** Wrapper preserving the exact source text of a JSON number token. */
class JsonNumberToken {
  constructor(readonly raw: string) {}
}

function serializeString(value: string): string {
  // JSON.stringify escapes the same set Java's canonicalizeString does and
  // leaves U+2028/U+2029 unescaped — matching the Java SDK.
  return JSON.stringify(value);
}

/** Render a JSON number token like Jackson: integral as-is, decimal via BigDecimal.toPlainString(). */
function formatNumberToken(token: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) {
    return serializeJsNumber(Number(token));
  }

  const sign = match[1];
  const intPart = match[2];
  const fracPart = match[3] ?? "";
  const exp = match[4] ? Number.parseInt(match[4], 10) : 0;

  // Integral token (no fraction, no exponent) → integer representation.
  if (fracPart === "" && exp === 0) {
    return BigInt(sign + intPart).toString();
  }

  // Decimal token → BigDecimal.toPlainString().
  const scale = fracPart.length - exp;
  let magnitude = (intPart + fracPart).replace(/^0+/, "");
  if (magnitude === "") {
    magnitude = "0";
  }

  let result: string;
  if (scale === 0) {
    result = magnitude;
  } else if (scale < 0) {
    result = magnitude + "0".repeat(-scale);
  } else if (magnitude.length > scale) {
    const pointPos = magnitude.length - scale;
    result = `${magnitude.slice(0, pointPos)}.${magnitude.slice(pointPos)}`;
  } else {
    result = `0.${"0".repeat(scale - magnitude.length)}${magnitude}`;
  }

  // Drop the sign for zero (BigDecimal has no negative zero).
  return sign === "-" && /[1-9]/.test(result) ? `-${result}` : result;
}

/** Format an already-parsed JS number without scientific notation. */
function serializeJsNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("NaN and Infinity are not valid JSON values");
  }
  if (value === 0) {
    return "0";
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e21) {
    return value.toString();
  }
  const text = value.toString();
  if (!/[eE]/.test(text)) {
    return text;
  }
  // Expand scientific notation produced by Number.toString() into plain form.
  return formatNumberToken(text);
}

function serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value instanceof JsonNumberToken) {
    return formatNumberToken(value.raw);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return serializeJsNumber(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
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

// ── Tokenizing JSON parser that preserves number source text ──────────────────

function parseJsonPreservingNumbers(text: string): unknown {
  let i = 0;

  function error(message: string): never {
    throw new SyntaxError(`Invalid JSON at position ${i}: ${message}`);
  }

  function skipWhitespace(): void {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
        i += 1;
      } else {
        break;
      }
    }
  }

  function parseValue(): unknown {
    skipWhitespace();
    const ch = text[i];
    if (ch === "{") {
      return parseObject();
    }
    if (ch === "[") {
      return parseArray();
    }
    if (ch === '"') {
      return parseString();
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      return parseNumber();
    }
    if (text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    error(`unexpected token '${ch ?? "EOF"}'`);
  }

  function parseObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    i += 1; // {
    skipWhitespace();
    if (text[i] === "}") {
      i += 1;
      return obj;
    }
    for (;;) {
      skipWhitespace();
      if (text[i] !== '"') {
        error("expected string key");
      }
      const key = parseString();
      skipWhitespace();
      if (text[i] !== ":") {
        error("expected ':'");
      }
      i += 1;
      obj[key] = parseValue();
      skipWhitespace();
      const ch = text[i];
      if (ch === ",") {
        i += 1;
        continue;
      }
      if (ch === "}") {
        i += 1;
        return obj;
      }
      error("expected ',' or '}'");
    }
  }

  function parseArray(): unknown[] {
    const arr: unknown[] = [];
    i += 1; // [
    skipWhitespace();
    if (text[i] === "]") {
      i += 1;
      return arr;
    }
    for (;;) {
      arr.push(parseValue());
      skipWhitespace();
      const ch = text[i];
      if (ch === ",") {
        i += 1;
        continue;
      }
      if (ch === "]") {
        i += 1;
        return arr;
      }
      error("expected ',' or ']'");
    }
  }

  function parseString(): string {
    const start = i;
    i += 1; // opening quote
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        i += 1;
        return JSON.parse(text.slice(start, i)) as string;
      }
      i += 1;
    }
    error("unterminated string");
  }

  function parseNumber(): JsonNumberToken {
    const start = i;
    if (text[i] === "-") {
      i += 1;
    }
    while (i < text.length && text[i] >= "0" && text[i] <= "9") {
      i += 1;
    }
    if (text[i] === ".") {
      i += 1;
      while (i < text.length && text[i] >= "0" && text[i] <= "9") {
        i += 1;
      }
    }
    if (text[i] === "e" || text[i] === "E") {
      i += 1;
      if (text[i] === "+" || text[i] === "-") {
        i += 1;
      }
      while (i < text.length && text[i] >= "0" && text[i] <= "9") {
        i += 1;
      }
    }
    return new JsonNumberToken(text.slice(start, i));
  }

  const result = parseValue();
  skipWhitespace();
  if (i < text.length) {
    error("trailing content");
  }
  return result;
}

export function canonicalizeJson(value: string | object): string {
  if (typeof value === "string") {
    if (value.trim() === "") {
      throw new Error("JSON string cannot be null or empty");
    }
    return serialize(parseJsonPreservingNumbers(value));
  }
  return serialize(value);
}
