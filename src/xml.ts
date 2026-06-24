import { DOMParser } from "@xmldom/xmldom";
import { sha256Hex } from "./utils.js";

/**
 * XML Exclusive Canonicalization (C14N) 1.0 — W3C `xml-exc-c14n#`, comments omitted.
 *
 * Produces byte-for-byte deterministic output matching:
 *  - iOS: libxml2 `xmlC14NDocDumpMemory` with `XML_C14N_EXCLUSIVE_1_0`
 *  - Java backend: Apache Santuario `Canonicalizer.ALGO_ID_C14N_EXCL_OMIT_COMMENTS`
 *  - Cheqi Java SDK: `XMLCanonicalService` (javax.xml.crypto.dsig EXCLUSIVE)
 *
 * Mirrors the Java SDK behaviour of stripping whitespace-only text nodes before
 * canonicalizing so formatting differences do not affect the resulting hash.
 */

const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

// Minimal structural typing over the @xmldom/xmldom node surface we rely on.
interface XmlAttr {
  readonly nodeName: string;
  readonly localName: string | null;
  readonly prefix: string | null;
  readonly namespaceURI: string | null;
  readonly value: string;
}
interface XmlNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly localName: string | null;
  readonly prefix: string | null;
  readonly namespaceURI: string | null;
  readonly nodeValue: string | null;
  readonly attributes: { length: number; item(i: number): XmlAttr } | null;
  readonly childNodes: { length: number; item(i: number): XmlNode } | null;
  readonly documentElement?: XmlNode;
  readonly target?: string;
  readonly data?: string;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const DOCUMENT_NODE = 9;

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#xD;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

function isWhitespaceOnly(value: string): boolean {
  return value.trim() === "";
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function serializeElement(el: XmlNode, ancestorNamespaces: Map<string, string>, out: string[]): void {
  // Copy of the namespace declarations visible to children (output-ancestor context).
  const rendered = new Map(ancestorNamespaces);

  // Collect "visibly utilized" namespaces (element prefix + prefixed attributes).
  const utilized = new Map<string, string>();
  utilized.set(el.prefix ?? "", el.namespaceURI ?? "");

  const regularAttrs: XmlAttr[] = [];
  if (el.attributes) {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes.item(i);
      // Skip namespace declaration attributes — these are reconstructed from namespaceURI.
      if (attr.nodeName === "xmlns" || attr.prefix === "xmlns" || attr.namespaceURI === XMLNS_NS) {
        continue;
      }
      regularAttrs.push(attr);
      if (attr.prefix) {
        utilized.set(attr.prefix, attr.namespaceURI ?? "");
      }
    }
  }

  // Decide which namespace declarations must be emitted on this element.
  const nsToRender: Array<[string, string]> = [];
  for (const [prefix, value] of utilized) {
    if (prefix === "") {
      if (value !== "") {
        if (rendered.get("") !== value) {
          nsToRender.push(["", value]);
          rendered.set("", value);
        }
      } else {
        // Element is in no namespace — only emit xmlns="" to undeclare an inherited default.
        const current = rendered.get("");
        if (current !== undefined && current !== "") {
          nsToRender.push(["", ""]);
          rendered.set("", "");
        }
      }
    } else if (rendered.get(prefix) !== value) {
      nsToRender.push([prefix, value]);
      rendered.set(prefix, value);
    }
  }

  // Namespace declarations sorted by prefix (default namespace first).
  nsToRender.sort((a, b) => compare(a[0], b[0]));

  // Attributes sorted by namespace URI (empty first) then local name.
  regularAttrs.sort((a, b) => {
    const uriCmp = compare(a.namespaceURI ?? "", b.namespaceURI ?? "");
    if (uriCmp !== 0) {
      return uriCmp;
    }
    return compare(a.localName ?? a.nodeName, b.localName ?? b.nodeName);
  });

  const qname = el.nodeName;
  out.push("<", qname);
  for (const [prefix, value] of nsToRender) {
    out.push(prefix === "" ? ` xmlns="${escapeAttr(value)}"` : ` xmlns:${prefix}="${escapeAttr(value)}"`);
  }
  for (const attr of regularAttrs) {
    out.push(` ${attr.nodeName}="${escapeAttr(attr.value ?? "")}"`);
  }
  out.push(">");

  serializeChildren(el, rendered, out);

  out.push("</", qname, ">");
}

function serializeChildren(node: XmlNode, rendered: Map<string, string>, out: string[]): void {
  const children = node.childNodes;
  if (!children) {
    return;
  }
  for (let i = 0; i < children.length; i++) {
    serializeNode(children.item(i), rendered, out);
  }
}

function serializeNode(node: XmlNode, rendered: Map<string, string>, out: string[]): void {
  switch (node.nodeType) {
    case ELEMENT_NODE:
      serializeElement(node, rendered, out);
      break;
    case TEXT_NODE:
    case CDATA_SECTION_NODE: {
      const text = node.nodeValue ?? "";
      // Mirror the Java SDK: whitespace-only (formatting) text nodes are dropped.
      if (!isWhitespaceOnly(text)) {
        out.push(escapeText(text));
      }
      break;
    }
    case PROCESSING_INSTRUCTION_NODE: {
      const data = node.data ?? "";
      out.push(data ? `<?${node.target} ${data}?>` : `<?${node.target}?>`);
      break;
    }
    // Comments are omitted (exc-c14n#, OMIT_COMMENTS).
    default:
      break;
  }
}

/**
 * Canonicalizes an XML string using Exclusive XML Canonicalization 1.0 (comments omitted).
 *
 * @throws if `xml` is null/empty or cannot be parsed.
 */
export function canonicalizeXml(xml: string): string {
  if (xml == null || xml.trim() === "") {
    throw new Error("XML string cannot be null or empty");
  }

  const doc = new DOMParser().parseFromString(xml, "text/xml") as unknown as XmlNode;
  const root =
    doc.nodeType === DOCUMENT_NODE ? doc.documentElement ?? null : doc;
  if (!root) {
    throw new Error("XML Exclusive C14N canonicalization failed: no document element");
  }

  const out: string[] = [];
  serializeNode(root, new Map<string, string>(), out);
  return out.join("");
}

/** Canonicalize XML and return its SHA-256 hash as a lowercase hex string. */
export function canonicalizeAndHashXml(xml: string): string {
  return sha256Hex(canonicalizeXml(xml));
}
