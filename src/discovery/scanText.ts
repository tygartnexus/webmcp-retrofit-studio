/**
 * Text extraction shared by headings, labels, legends, and row labels
 * (visible text) and by button names (accessible content). Text joins the
 * way it renders: inline edges keep their whitespace, block elements and
 * line breaks separate words, and the result collapses to single spaces.
 * Hidden means the hidden attribute, aria-hidden, inline display:none or
 * visibility:hidden, display-none classes, and script, style, template,
 * textarea, and select content. Screen-reader-only classes hide text from
 * sight but not from an accessible name. Stylesheets are not evaluated.
 */

export const ROW_LABEL_BUDGET = 60;
const NON_VISIBLE_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TEXTAREA", "SELECT", "OPTION"]);
/** Classes that remove an element from rendering; inline styles are checked separately. */
const DISPLAY_NONE_CLASS_PATTERN = /(^|\s)(hidden|d-none|is-hidden)(\s|$)/i;
/** Classes that clip an element off screen while assistive technology still reads it. */
const SCREEN_READER_CLASS_PATTERN = /(^|\s)(sr-only|visually-hidden|visuallyhidden|screen-reader-text)(\s|$)/i;
/** Elements that start on their own line, so their edges separate words. */
const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DETAILS", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION",
  "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LEGEND", "LI", "MAIN", "NAV", "OL",
  "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);
const BLOCK_STYLE_PATTERN = /display:(block|flex|grid|table|list-item)/;

type Audience = "sighted" | "assistive" | "referenced";

function inlineStyle(element: Element): string {
  return (element.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
}

/** Excluded from both visible text and accessible names: hidden markup and control content. */
function isExcludedContent(element: Element): boolean {
  if (NON_VISIBLE_TAGS.has(element.tagName)) return true;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  if (DISPLAY_NONE_CLASS_PATTERN.test(element.getAttribute("class") ?? "")) return true;
  const style = inlineStyle(element);
  return style.includes("display:none") || style.includes("visibility:hidden");
}

export function isHiddenElement(element: Element): boolean {
  return isExcludedContent(element) || SCREEN_READER_CLASS_PATTERN.test(element.getAttribute("class") ?? "");
}

function isBlock(element: Element): boolean {
  return BLOCK_TAGS.has(element.tagName) || BLOCK_STYLE_PATTERN.test(inlineStyle(element));
}

function isExcludedFor(element: Element, audience: Audience): boolean {
  if (audience === "referenced") return NON_VISIBLE_TAGS.has(element.tagName);
  return audience === "sighted" ? isHiddenElement(element) : isExcludedContent(element);
}

/** Raw text with rendering-shaped whitespace; callers collapse it. */
function rawText(node: Node, audience: Audience): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (isExcludedFor(element, audience)) return "";
  if (element.tagName === "IMG") return audience === "sighted" ? "" : ` ${element.getAttribute("alt") ?? ""} `;
  const inner = [...element.childNodes].map((child) => rawText(child, audience)).join("");
  return isBlock(element) ? ` ${inner} ` : inner;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Text a person can see: skips hidden elements and control values entirely. */
export function visibleText(node: Node): string {
  return collapse(rawText(node, "sighted"));
}

/**
 * Name from content as assistive technology reads it: hidden markup is
 * skipped, an image contributes its alt in place, and screen-reader-only
 * text counts because it is rendered for that audience. An element
 * referenced by aria-labelledby contributes even when hidden.
 */
export function accessibleContent(node: Node, referenced = false): string {
  return collapse(rawText(node, referenced ? "referenced" : "assistive"));
}

export function clipLabel(value: string): string {
  return value.length <= ROW_LABEL_BUDGET ? value : `${value.slice(0, ROW_LABEL_BUDGET - 1)}…`;
}

/** Collapsed visible text of an element; hidden and control content never counts. */
export function text(node: Element | null): string {
  return node ? visibleText(node) : "";
}
