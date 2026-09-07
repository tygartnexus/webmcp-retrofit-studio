/**
 * Visible-text extraction shared by headings, labels, buttons, legends, and
 * row labels. Hidden means the hidden attribute, aria-hidden, inline
 * display:none or visibility:hidden, common hiding classes, and script,
 * style, template, textarea, and select content. Stylesheets are not
 * evaluated.
 */

export const ROW_LABEL_BUDGET = 60;
const NON_VISIBLE_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TEXTAREA", "SELECT", "OPTION"]);
/** Common stylesheet-driven hiding; inline styles are checked separately. Stylesheets themselves are not evaluated. */
const HIDDEN_CLASS_PATTERN = /(^|\s)(sr-only|visually-hidden|visuallyhidden|hidden|d-none|screen-reader-text|is-hidden)(\s|$)/i;

export function isHiddenElement(element: Element): boolean {
  if (NON_VISIBLE_TAGS.has(element.tagName)) return true;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  if (HIDDEN_CLASS_PATTERN.test(element.getAttribute("class") ?? "")) return true;
  const style = (element.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
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
