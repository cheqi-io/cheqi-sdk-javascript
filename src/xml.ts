import { sha256Hex } from "./utils.js";

function stripFormattingWhitespace(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

export function canonicalizeXml(xml: string): string {
  return stripFormattingWhitespace(xml);
}

export function canonicalizeAndHashXml(xml: string): string {
  return sha256Hex(canonicalizeXml(xml));
}
