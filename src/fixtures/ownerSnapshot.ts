import { sha256Hex } from "../discovery/scanOwnedFixture";
import type { HtmlSnapshot } from "./genericFixtures";

/**
 * Turns owner-supplied HTML into a snapshot the generic scanner accepts. The
 * markup is never inserted into the live document: the title is read from an
 * inert DOMParser copy, and the id is derived from the content hash so the
 * same paste always produces the same snapshot.
 */

export const OWNER_HTML_MAX_CHARS = 2_000_000;

/** Validation failures of the pasted markup; safe to show the owner verbatim. */
export class OwnerSnapshotError extends Error {
  override readonly name = "OwnerSnapshotError";
}
export const OWNER_SOURCE_PREFIX = "owner-";

export interface OwnerSnapshotOptions {
  /** Owner-provided label used when the markup has no title. */
  fallbackTitle?: string;
}

function readTitle(html: string): string | null {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const title = parsed.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim();
  if (title) return title;
  const heading = parsed.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim();
  return heading || null;
}

export async function createOwnerSnapshot(
  html: string,
  options: OwnerSnapshotOptions = {},
): Promise<HtmlSnapshot> {
  const trimmed = html.trim();
  if (trimmed.length === 0) throw new OwnerSnapshotError("Pasted HTML is empty");
  if (trimmed.length > OWNER_HTML_MAX_CHARS) {
    throw new OwnerSnapshotError(`Pasted HTML is too large; the limit is ${OWNER_HTML_MAX_CHARS.toLocaleString()} characters`);
  }
  if (!/<[a-z!][^>]*>/i.test(trimmed)) throw new OwnerSnapshotError("Pasted text does not look like HTML");
  const hash = await sha256Hex(trimmed);
  const title = readTitle(trimmed) ?? options.fallbackTitle?.trim() ?? "Pasted page";
  return Object.freeze({
    id: `${OWNER_SOURCE_PREFIX}${hash.slice(0, 12)}`,
    revision: hash.slice(0, 8),
    sourceKind: "owner-supplied-html",
    authorization: "owner-authorized",
    title,
    html: trimmed,
  });
}
