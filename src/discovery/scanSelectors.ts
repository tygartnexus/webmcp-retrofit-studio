/**
 * Selectors that resolve to exactly the element they stand for: a unique id,
 * else a structural path; attribute and group selectors are CSS-escaped.
 */

const ID_PATTERN = /^[A-Za-z][\w-]*$/;

/** The element's id, only when it is well formed and unique in the document. */
export function uniqueId(element: Element, document: Document): string | null {
  const id = element.getAttribute("id");
  if (!id || !ID_PATTERN.test(id)) return null;
  return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1 ? id : null;
}

/**
 * A structural path from the nearest uniquely identified ancestor (or body),
 * one nth-of-type step per level, so it resolves to exactly this element.
 * Unlike a document-wide index, nth-of-type is sibling-scoped, which is why
 * the path must include every level.
 */
export function structuralSelector(element: Element, document: Document): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && current !== document.documentElement) {
    const id = uniqueId(current, document);
    if (id) {
      steps.unshift(`#${id}`);
      return steps.join(" > ");
    }
    const parent: Element | null = current.parentElement;
    const tag = CSS.escape(current.tagName.toLowerCase());
    const sameTag = parent ? [...parent.children].filter((child) => child.tagName === current!.tagName) : [current];
    steps.unshift(sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})`);
    current = parent;
  }
  steps.unshift("body");
  return steps.join(" > ");
}

export function selectorFor(element: Element, document: Document): string {
  const id = uniqueId(element, document);
  return id ? `#${id}` : structuralSelector(element, document);
}

export function attributeSelector(scope: string, attribute: string, value: string): string {
  return `${scope} [${attribute}="${CSS.escape(value)}"]`;
}

/** Radio and checkbox groups are addressed by type and name, never catching a same-name text control. */
export function groupSelector(scope: string, inputType: string, name: string): string {
  return `${scope} input[type="${inputType}"][name="${CSS.escape(name)}"]`;
}
