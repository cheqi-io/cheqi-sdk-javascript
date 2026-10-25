/** Binary helpers shared by Node, browsers, and worker runtimes. */
export const utf8ToBytes = (value: string): Uint8Array => new TextEncoder().encode(value);
export const bytesToUtf8 = (value: Uint8Array): string => new TextDecoder().decode(value);

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, "").replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Copy a byte view into an owned ArrayBuffer accepted by Web Crypto providers. */
export function bytesToArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.length);
  copy.set(value);
  return copy.buffer;
}
