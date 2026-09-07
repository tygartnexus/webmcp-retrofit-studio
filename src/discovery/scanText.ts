/**
 * Visible-text extraction shared by headings, labels, legends, and row
 * labels, and the accessible-name content used for buttons. Hidden means the hidden attribute, aria-hidden, inline
 * display:none or visibility:hidden, common hiding classes, and script,
 * style, template, textarea, and select content. Stylesheets are not
 * evaluated.
 */

export const ROW_LABEL_BUDGET = 60;
const NON_VISIBLE_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TEXTAREA", "SELECT", "OPTION"]);
/** Common stylesheet-driven hiding; inline styles are checked separately. Stylesheets themselves are not evaluated. */
const HIDDEN_CLASS_PATTERN = /(^|\s)(sr-only|visually-hidden|visuallyhidden|hidden|d-none|screen-reader-text|is-hidden)(\s|$)/i;

/** Excluded from both visible text and accessible names: hidden markup and control content. */
function isExcludedContent(element: Element): boolean {
  if (NON_VISIBLE_TAGS.has(element.tagName)) return true;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  const style = (element.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
}

export function isHiddenElement(element: Element): boolean {
  return isExcludedContent(element) || HIDDEN_CLASS_PATTERN.test(element.getAttribute("class") ?? "");
}

/**
 * Name from content as assistive technology reads it: hidden markup is
 * skipped, an image contributes its alt in place, and screen-reader-only
 * text counts because it is rendered for that audience. An element
 * referenced by aria-labelledby contributes even when hidden.
 */
export function accessibleContent(node: Node, referenced = false): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (NON_VISIBLE_TAGS.has(element.tagName) || (!referenced && isExcludedContent(element))) return "";
  if (element.tagName === "IMG") return ` ${element.getAttribute("alt") ?? ""} `;
  return [...element.childNodes]
    .map((child) => accessibleContent(child, referenced))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text a person can see: skips hidden elements and control values entirely. */
export function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE || isHiddenElement(node as Element)) return "";
  return [...node.childNodes].map(visibleText).join("").replace(/\s+/g, " ").trim();
}

export function clipLabel(value: string): string {
  return value.length <= ROW_LABEL_BUDGET ? value : `${value.slice(0, ROW_LABEL_BUDGET - 1)}…`;
}

/** Collapsed visible text of an element; hidden and control content never counts. */
export function text(node: Element | null): string {
  return node ? visibleText(node) : "";
}
