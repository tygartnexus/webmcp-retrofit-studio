import type { CapabilityObservation, TableObservation } from "./scanHtml";
import { selectorFor } from "./scanSelectors";
import { text } from "./scanText";
import { NEXT_PATTERN, PREVIOUS_PATTERN } from "./scanVocabulary";

/**
 * Table observation: a table owns only its own rows and cells, a tfoot row
 * is a footer rather than data, and a pager is attributed to the table it
 * sits beside, never to one it sits inside.
 */

/** Rows and cells that belong to this table, not to a table nested inside one of its cells. */
/** Data rows the table owns; a tfoot row is a footer (often a pager), not data. */
function ownedRows(table: Element): Element[] {
  return [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table && row.parentElement?.tagName !== "TFOOT",
  );
}

function ownedCells(row: Element, selector: string): Element[] {
  const table = row.closest("table");
  return [...row.querySelectorAll(selector)].filter((cell) => cell.closest("table") === table);
}

/** thead cells, else the first row made only of th cells. */
function headerCells(table: Element): string[] {
  const fromHead = [...table.querySelectorAll("thead th")]
    .filter((cell) => cell.closest("table") === table)
    .map(text)
    .filter(Boolean);
  if (fromHead.length > 0) return fromHead;
  const headerRow = ownedRows(table).find(
    (row) => row.children.length > 0 && [...row.children].every((cell) => cell.tagName === "TH"),
  );
  return headerRow ? [...headerRow.children].map(text).filter(Boolean) : [];
}

/**
 * Pagination controls belong to the table's own neighbourhood: its container
 * when it is the only table there, otherwise the siblings between it and the
 * next table. A link counts only with rel="prev"/"next" or previous/next
 * wording; never "the first link".
 */
function paginationScope(table: Element): Element[] {
  const parent = table.parentElement;
  if (!parent) return [];
  const lone = [...parent.querySelectorAll("table")].every((other) => other === table || table.contains(other));
  const isRoot = parent === parent.ownerDocument.body || parent === parent.ownerDocument.documentElement;
  if (lone && !isRoot) return [parent];
  const scope: Element[] = [];
  // Only a lone table claims the siblings before it; between two tables a pager belongs to the one above it.
  const holdsTable = (element: Element) => element.tagName === "TABLE" || element.querySelector("table") !== null;
  let before = lone ? table.previousElementSibling : null;
  while (before && !holdsTable(before)) {
    scope.push(before);
    before = before.previousElementSibling;
  }
  let after = table.nextElementSibling;
  while (after && !holdsTable(after)) {
    scope.push(after);
    after = after.nextElementSibling;
  }
  return scope;
}

function paginationFor(table: Element): TableObservation["pagination"] {
  const ownFooterLinks = [...table.querySelectorAll("tfoot a, tfoot button, caption a, caption button")].filter(
    (link) => link.closest("table") === table,
  );
  const links = [
    ...ownFooterLinks,
    ...paginationScope(table).flatMap((element) => [
      ...(element.matches("a, button") ? [element] : []),
      ...element.querySelectorAll("a, button"),
    ]),
  ].filter((link) => {
      const owner = link.closest("table");
      if (!owner) return true;
      const footer = link.closest("tfoot, caption");
      if (owner === table && footer && table.contains(footer)) return true;
      return owner !== table && !table.contains(owner);
    });
  const wording = (link: Element, pattern: RegExp) =>
    pattern.test(text(link).trim()) || pattern.test((link.getAttribute("aria-label") ?? "").trim());
  return {
    previous: links.some((link) => link.getAttribute("rel") === "prev" || wording(link, PREVIOUS_PATTERN)),
    next: links.some((link) => link.getAttribute("rel") === "next" || wording(link, NEXT_PATTERN)),
  };
}

export function observeTable(table: Element, document: Document, heading: string): CapabilityObservation | null {
  const headers = headerCells(table);
  if (headers.length === 0) return null;
  const selector = selectorFor(table, document);
  const rowCount = ownedRows(table).filter((row) => ownedCells(row, "td").length > 0).length;
  const { previous, next } = paginationFor(table);
  return {
    id: `table:${selector}`,
    kind: "table",
    selector,
    heading,
    method: "get",
    actionLabel: "Read rows",
    riskClass: "read",
    fields: [],
    buttons: [],
    table: { headers, rowCount, pagination: { previous, next } },
  };
}
