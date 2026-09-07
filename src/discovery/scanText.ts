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
const DISPLAY_NONE_CLASS_PATTERN = /(^|\s)(hidden|d-none|is-hidden)(\s|$)/;
/** Classes that clip an element off screen while assistive technology still reads it. */
const SCREEN_READER_CLASS_PATTERN = /(^|\s)(sr-only|visually-hidden|visuallyhidden|screen-reader-text)(\s|$)/;
/** Zero-width characters render as nothing and must not survive into names. */
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
/** Elements that start on their own line, so their edges separate words. */
const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DETAILS", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION",
  "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LEGEND", "LI", "MAIN", "NAV", "OL",
  "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);
const BLOCK_DISPLAYS = new Set(["block", "flex", "grid", "table", "list-item"]);

/**
 * Who the text is for: sighted readers, assistive technology, everyone the
 * page renders it to (either of those), or an element referenced by
 * aria-labelledby, which contributes even when hidden.
 */
type Audience = "sighted" | "assistive" | "rendered" | "referenced";

/** Inline declarations by property, so "display:none" inside another property's name or value does not count. */
function inlineDeclarations(element: Element): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const declaration of (element.getAttribute("style") ?? "").toLowerCase().split(";")) {
    const separator = declaration.indexOf(":");
    if (separator > 0) {
      const value = declaration.slice(separator + 1).replace(/!\s*important\s*$/, "").trim();
      declarations.set(declaration.slice(0, separator).trim(), value);
    }
  }
  return declarations;
}

function isHiddenByStyle(element: Element): boolean {
  const style = inlineDeclarations(element);
  const visibility = style.get("visibility");
  return style.get("display") === "none" || visibility === "hidden" || visibility === "collapse";
}

/** Rendered to nobody: hidden markup and control content. */
function isUnrendered(element: Element): boolean {
  if (NON_VISIBLE_TAGS.has(element.tagName) || element.hasAttribute("hidden")) return true;
  if (DISPLAY_NONE_CLASS_PATTERN.test(element.getAttribute("class") ?? "")) return true;
  return isHiddenByStyle(element);
}

/** Excluded from both visible text and accessible names. */
function isExcludedContent(element: Element): boolean {
  return isUnrendered(element) || element.getAttribute("aria-hidden") === "true";
}

export function isHiddenElement(element: Element): boolean {
  return isExcludedContent(element) || SCREEN_READER_CLASS_PATTERN.test(element.getAttribute("class") ?? "");
}

function isBlock(element: Element): boolean {
  return BLOCK_TAGS.has(element.tagName) || BLOCK_DISPLAYS.has(inlineDeclarations(element).get("display") ?? "");
}

function isExcludedFor(element: Element, audience: Audience): boolean {
  switch (audience) {
    case "referenced":
      return NON_VISIBLE_TAGS.has(element.tagName);
    case "rendered":
      return isUnrendered(element);
    case "assistive":
      return isExcludedContent(element);
    default:
      return isHiddenElement(element);
  }
}

/**
 * Raw text with rendering-shaped whitespace; callers collapse it. A root the
 * caller asks about by name is read even when it is hidden itself: a hidden
 * default submit button still fires on Enter, so its name still matters.
 */
function rawText(node: Node, audience: Audience, isRoot = false): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (!isRoot && isExcludedFor(element, audience)) return "";
  if (element.tagName === "IMG") return audience === "sighted" ? "" : ` ${element.getAttribute("alt") ?? ""} `;
  const inner = [...element.childNodes].map((child) => rawText(child, audience)).join("");
  const own = isRoot || audience === "sighted" ? "" : collapseText(element.getAttribute("aria-label") ?? "");
  // A descendant's aria-label replaces its content for assistive technology (an icon font's "Delete account");
  // the rendered audience keeps both, since sight gets the glyph and assistive technology gets the name.
  if (own) return audience === "rendered" ? ` ${own} ${inner} ` : ` ${own} `;
  return isBlock(element) ? ` ${inner} ` : inner;
}

/** Whitespace collapsed and zero-width characters dropped; attributes and content alike go through this. */
export function collapseText(value: string): string {
  return value.replace(ZERO_WIDTH_PATTERN, "").replace(/\s+/g, " ").trim();
}

/** Text a person can see: skips hidden elements and control values entirely. */
export function visibleText(node: Node): string {
  return collapseText(rawText(node, "sighted"));
}

/**
 * Name from content as assistive technology reads it: hidden markup is
 * skipped, an image contributes its alt and a labelled descendant its
 * aria-label in place, and screen-reader-only text counts because it is
 * rendered for that audience. An element
 * referenced by aria-labelledby contributes even when hidden.
 */
export function accessibleContent(node: Node, referenced = false): string {
  return collapseText(rawText(node, referenced ? "referenced" : "assistive", true));
}

/** Everything the page renders to anyone: aria-hidden and screen-reader-only text both count. */
export function renderedText(node: Node): string {
  return collapseText(rawText(node, "rendered", true));
}

export function clipLabel(value: string): string {
  return value.length <= ROW_LABEL_BUDGET ? value : `${value.slice(0, ROW_LABEL_BUDGET - 1)}…`;
}

/** Collapsed visible text of an element; hidden and control content never counts. */
export function text(node: Element | null): string {
  return node ? visibleText(node) : "";
}
