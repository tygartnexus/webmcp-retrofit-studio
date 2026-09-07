import { DESCRIPTION_BUDGET, PARAMETER_DESCRIPTION_BUDGET, WRITE_NAME_WORDS } from "../validation/lintToolContracts";
import { canonicalJson, sha256Hex } from "./scanOwnedFixture";
import type {
  CapabilityObservation,
  FieldObservation,
  GenericScanResult,
  RiskClass,
} from "./scanHtml";
import { deepFreeze } from "../lib/deepFreeze";

/**
 * Turns scanner observations into reviewable tool proposals. Read and write
 * capabilities become tools; finalizing and credential capabilities are kept
 * off the tool surface and listed as exclusions with the reason, so the owner
 * sees them and the presence gate covers finalization on the visible page.
 */

export interface PropertySchema {
  type: "string" | "number" | "integer" | "boolean" | "array";
  description: string;
  enum?: readonly string[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  /** Multi-select groups: an array of option keys, each used at most once. */
  items?: { type: "string"; enum: readonly string[] };
  uniqueItems?: true;
}

export interface ProposedToolSchema {
  type: "object";
  properties: Record<string, PropertySchema>;
  required?: readonly string[];
  additionalProperties: false;
}

export interface ProposedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ProposedToolSchema;
  annotations: { readOnlyHint: boolean; untrustedContentHint: true };
  riskClass: Extract<RiskClass, "read" | "write">;
  capabilityId: string;
  evidenceIds: readonly string[];
  outputColumns?: readonly string[];
}

export interface ExcludedCapability {
  capabilityId: string;
  riskClass: Extract<RiskClass, "finalize" | "credential">;
  actionLabel: string;
  reason: string;
}

export interface GenericProposal {
  scanHash: string;
  proposalHash: string;
  versionHash: string;
  tools: readonly ProposedTool[];
  excluded: readonly ExcludedCapability[];
  humanConfirmationBoundary: "outside-tool-surface";
}

const INFERENCE_VERSION = "generic-inference-v2";
const NAME_BUDGET = 30;
const TITLE_BUDGET = 120;
/** A title keeps at least this much of its base before a suffix is clipped along with it. */
const MIN_TITLE_BASE = 8;
/** A button-derived search names its button in the title; the button label itself is clipped first. */
const VIA_BUTTON_BUDGET = 60;
/** Room for `_NNN` so a suffixed name still fits the budget. */
const SUFFIX_HEADROOM = 4;
const MAX_NAME_SUFFIX = 999;
const LEADING_VERBS = /^(search|find|filter|browse|look ?up|read|view|show|list)\s+/i;
/** A label that is nothing but a search verb names no object. */
const BARE_SEARCH_VERB = /^(search|find|filter|browse|look ?up|go|suchen|rechercher|buscar|cerca|pesquisar|zoeken|検索|搜索)$/i;
const FINALIZE_REASON =
  "Finalizing actions stay on the visible interface behind the human presence ceremony; no tool can perform them.";
const CREDENTIAL_REASON = "Credential entry never becomes a tool; the person signs in on the visible interface.";


export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

/** FNV-1a, 32-bit, six hex characters: a deterministic stem for labels that slugify to nothing. */
function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 6);
}

/** Read-only names must not carry write words, whatever the page heading said. */
function readSafe(slug: string): string {
  return slug.split("_").filter((word) => word && !WRITE_NAME_WORDS.includes(word)).join("_");
}

/** A name stem from a label: its slug, or a hashed stem when the label has no Latin letters. */
function stemFor(prefix: string, label: string, fallbackPrefix: string, readOnly = false): string {
  const slug = readOnly ? readSafe(slugify(label)) : slugify(label);
  return slug ? `${prefix}${slug}` : `${fallbackPrefix}${shortHash(label)}`;
}

function budgetName(name: string, budget: number = NAME_BUDGET): string {
  if (name.length <= budget) return name;
  const cut = name.slice(0, budget);
  const boundary = cut.lastIndexOf("_");
  return boundary > 4 ? cut.slice(0, boundary) : cut;
}

/**
 * Names must be unique within a proposal and within the 30-character budget.
 * Collisions get a numeric suffix on a shortened stem so the suffix always
 * fits; the search is bounded, and running out is an explicit error rather
 * than a hang.
 */
function uniqueName(candidate: string, taken: Set<string>): string {
  let name = budgetName(candidate) || "tool";
  if (/^[0-9]/.test(name)) name = `t_${name}`;
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const stem = budgetName(name, NAME_BUDGET - SUFFIX_HEADROOM) || "tool";
  for (let suffix = 2; suffix <= MAX_NAME_SUFFIX; suffix += 1) {
    const unique = `${stem}_${suffix}`;
    if (!taken.has(unique)) {
      taken.add(unique);
      return unique;
    }
  }
  throw new Error(`Could not derive a unique tool name from "${candidate}" within ${MAX_NAME_SUFFIX} attempts.`);
}

function truncate(value: string, budget: number): string {
  if (value.length <= budget) return value;
  if (budget <= 0) return "";
  return budget === 1 ? "…" : `${value.slice(0, budget - 1).trimEnd()}…`;
}

function objectNoun(capability: CapabilityObservation): string {
  const searchField = capability.fields.find((field) => field.inputType === "search" || /search/i.test(field.label ?? ""));
  // A search derived from a submit button is named after that button, so it never shadows the form's own search.
  const sources = capability.id.startsWith("action:")
    ? [capability.actionLabel, searchField?.label, capability.heading]
    : [searchField?.label, capability.heading];
  for (const source of sources) {
    const noun = (source ?? "").replace(LEADING_VERBS, "").trim();
    if (noun && !BARE_SEARCH_VERB.test(noun)) return noun;
  }
  return "items";
}

/** HTML matches a pattern attribute against the whole value; the schema says so explicitly. */
function anchorPattern(pattern: string): string {
  return pattern.startsWith("^") && pattern.endsWith("$") ? pattern : `^(?:${pattern})$`;
}

function propertyFor(field: FieldObservation): PropertySchema {
  const description = truncate(field.label ?? field.placeholder ?? field.name, PARAMETER_DESCRIPTION_BUDGET);
  const base: PropertySchema = { type: "string", description };
  if (field.multiple) {
    return { type: "array", description, items: { type: "string", enum: field.options ?? [] }, uniqueItems: true };
  }
  switch (field.kind) {
    case "number":
      return {
        ...base,
        type: "number",
        ...(field.min !== undefined ? { minimum: field.min } : {}),
        ...(field.max !== undefined ? { maximum: field.max } : {}),
      };
    case "boolean":
      return { ...base, type: "boolean" };
    case "enum":
      return { ...base, ...(field.options && field.options.length > 0 ? { enum: field.options } : {}) };
    case "email":
      return { ...base, format: "email" };
    case "url":
      return { ...base, format: "uri" };
    case "date":
      return { ...base, pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
    case "time":
      return { ...base, pattern: "^\\d{2}:\\d{2}$" };
    default:
      return {
        ...base,
        ...(field.pattern ? { pattern: anchorPattern(field.pattern) } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
      };
  }
}

function schemaFromFields(fields: readonly FieldObservation[]): ProposedToolSchema {
  const usable = fields.filter((field) => !field.excluded);
  const properties = Object.fromEntries(usable.map((field) => [field.name, propertyFor(field)]));
  const required = usable.filter((field) => field.required).map((field) => field.name);
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function tableSchema(): ProposedToolSchema {
  return {
    type: "object",
    properties: {
      page: { type: "integer", description: "Page number, starting at 1.", minimum: 1 },
      limit: { type: "integer", description: "Rows per page, at most 100.", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  };
}

/** A title whose distinguishing suffix survives the budget; a suffix that leaves no room is clipped with the base. */
function titled(base: string, suffix: string): string {
  const room = TITLE_BUDGET - suffix.length;
  return room >= MIN_TITLE_BASE ? `${truncate(base, room)}${suffix}` : truncate(`${base}${suffix}`, TITLE_BUDGET);
}

function proposeTool(capability: CapabilityObservation, taken: Set<string>, tableStems: Map<string, number>): ProposedTool {
  const evidenceIds = [capability.id, ...capability.fields.filter((f) => !f.excluded).map((f) => f.id)];
  if (capability.kind === "table" && capability.table) {
    const noun = capability.heading;
    const stem = stemFor("read_", noun, "read_", true);
    const name = uniqueName(stem, taken);
    // Several tables under one heading: the second and later carry an ordinal in the title.
    const seen = (tableStems.get(stem) ?? 0) + 1;
    tableStems.set(stem, seen);
    const ordinal = seen > 1 ? ` (${seen})` : "";
    return {
      name,
      title: titled(`Read ${noun}`, ordinal),
      description: truncate(`Read rows from the ${noun} table with paging. This tool does not modify state.`, DESCRIPTION_BUDGET),
      inputSchema: tableSchema(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      riskClass: "read",
      capabilityId: capability.id,
      evidenceIds,
      outputColumns: capability.table.headers,
    };
  }
  if (capability.kind === "search") {
    const noun = objectNoun(capability);
    const fromButton = capability.id.startsWith("action:");
    const label = capability.actionLabel.trim().toLowerCase();
    // The button names the search; the suffix only helps when the title does not already say the label.
    const redundant = [noun, `Search ${noun}`].some((candidate) => candidate.toLowerCase() === label);
    const viaButton = fromButton && !redundant ? ` (${truncate(capability.actionLabel, VIA_BUTTON_BUDGET)})` : "";
    return {
      name: uniqueName(stemFor("search_", noun, "search_", true), taken),
      title: titled(`Search ${noun}`, viaButton),
      description: truncate(
        `Search ${noun} using the ${capability.heading} form${fromButton ? ` through its "${capability.actionLabel}" button` : ""}. This tool does not modify state.`,
        DESCRIPTION_BUDGET,
      ),
      inputSchema: schemaFromFields(capability.fields),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      riskClass: "read",
      capabilityId: capability.id,
      evidenceIds,
    };
  }
  const action = capability.actionLabel || "Submit";
  const row = capability.rowLabel;
  return {
    name: uniqueName(stemFor("", row ? `${action} ${row}` : action, "write_"), taken),
    title: row ? titled(action, `: ${row}`) : truncate(action, TITLE_BUDGET),
    description: truncate(
      row
        ? `Submit the "${action}" form for the "${row}" row on ${capability.heading}. This changes state and is staged for human review before anything final.`
        : `Submit the "${action}" form on ${capability.heading}. This changes state and is staged for human review before anything final.`,
      DESCRIPTION_BUDGET,
    ),
    inputSchema: schemaFromFields(capability.fields),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    riskClass: "write",
    capabilityId: capability.id,
    evidenceIds,
  };
}

/**
 * Two actions with the same label (two "Preview" buttons, two GET submits
 * named alike) keep distinct names through uniqueName; their titles get the
 * same ordinal, so an agent reading titles can tell them apart too.
 */
function withDistinctTitles(tools: readonly ProposedTool[]): ProposedTool[] {
  const used = new Set<string>();
  return tools.map((tool) => {
    // An ordinal title can already exist (a table ordinal, or a literal "Preview (2)" label), so keep counting
    // from the title's base rather than stacking a second ordinal on the first.
    const base = tool.title.replace(/ \(\d+\)$/, "");
    let title = tool.title;
    for (let ordinal = 2; used.has(title); ordinal += 1) title = titled(base, ` (${ordinal})`);
    used.add(title);
    return title === tool.title ? tool : { ...tool, title };
  });
}

export async function inferGenericCapabilities(scan: GenericScanResult): Promise<GenericProposal> {
  const taken = new Set<string>();
  const tableStems = new Map<string, number>();
  const proposed: ProposedTool[] = [];
  const excluded: ExcludedCapability[] = [];
  for (const capability of scan.capabilities) {
    if (capability.riskClass === "finalize" || capability.riskClass === "credential") {
      excluded.push({
        capabilityId: capability.id,
        riskClass: capability.riskClass,
        actionLabel: capability.actionLabel,
        reason: capability.riskClass === "finalize" ? FINALIZE_REASON : CREDENTIAL_REASON,
      });
      continue;
    }
    proposed.push(proposeTool(capability, taken, tableStems));
  }
  const tools = withDistinctTitles(proposed);
  const humanConfirmationBoundary = "outside-tool-surface" as const;
  const versionHash = await sha256Hex(
    canonicalJson({ inferenceVersion: INFERENCE_VERSION, tools, excluded, humanConfirmationBoundary }),
  );
  const proposalHash = await sha256Hex(
    canonicalJson({ scanHash: scan.scanHash, versionHash, tools, excluded, humanConfirmationBoundary }),
  );
  return deepFreeze({
    scanHash: scan.scanHash,
    proposalHash,
    versionHash,
    tools,
    excluded,
    humanConfirmationBoundary,
  });
}
