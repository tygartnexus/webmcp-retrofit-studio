import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import { sha256Hex } from "./scanOwnedFixture";
import { deepFreeze } from "../lib/deepFreeze";

/**
 * Generic inert scanner. Parses owner-supplied HTML with DOMParser, which
 * never executes scripts or fetches subresources, and records the structure
 * an agent could act on: forms, their fields, buttons, and tables. It keeps
 * attributes (names, labels, types, constraints, option values) and never
 * keeps field values, hidden inputs, or credential fields.
 */

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "email"
  | "tel"
  | "url"
  | "date"
  | "time"
  | "file";

export type FieldExclusion = "hidden" | "credential" | "payment-credential" | "file";

export interface FieldObservation {
  id: string;
  name: string;
  selector: string;
  inputType: string;
  kind: FieldKind;
  required: boolean;
  label?: string;
  placeholder?: string;
  pattern?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: readonly string[];
  excluded?: FieldExclusion;
}

export interface ButtonObservation {
  label: string;
  type: string;
  selector: string;
}

export interface TableObservation {
  headers: readonly string[];
  rowCount: number;
  pagination: { previous: boolean; next: boolean };
}

export type CapabilityKind = "form" | "search" | "table";
export type RiskClass = "read" | "write" | "finalize" | "credential";

export interface CapabilityObservation {
  id: string;
  kind: CapabilityKind;
  selector: string;
  heading: string;
  method: "get" | "post";
  actionLabel: string;
  riskClass: RiskClass;
  fields: readonly FieldObservation[];
  buttons: readonly ButtonObservation[];
  table?: TableObservation;
}

export interface ScanSafety {
  parsedInertly: true;
  externalRequests: 0;
  executedScripts: 0;
  scriptsIgnored: number;
  credentialFieldsExcluded: number;
  hiddenFieldsExcluded: number;
  retainedRawValues: false;
}

export interface GenericScanResult {
  snapshotId: string;
  revision: string;
  sourceKind: HtmlSnapshot["sourceKind"];
  authorization: "owner-authorized";
  title: string;
  scanHash: string;
  capabilities: readonly CapabilityObservation[];
  safety: ScanSafety;
}

const MAX_HTML_CHARS = 2_000_000;
const FINALIZE_PATTERN =
  /\b(place order|pay|purchase|checkout|confirm|finali[sz]e|delete|remove|cancel|destroy|purge|submit order|book now)\b/i;
const SEARCH_PATTERN = /\b(search|find|filter|look ?up|browse)\b/i;
const CREDENTIAL_ACTION_PATTERN = /\b(log ?in|sign ?in|authenticate|password)\b/i;
const PAYMENT_NAME_PATTERN = /(card|cvv|cvc|expir|iban|routing|account ?number)/i;


function text(node: Element | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function selectorFor(element: Element, fallback: string): string {
  const id = element.getAttribute("id");
  return id && /^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : fallback;
}

function nearestHeading(element: Element, document: Document): string {
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  let best = "";
  for (const heading of headings) {
    const position = heading.compareDocumentPosition(element);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) best = text(heading);
  }
  return best || text(document.querySelector("title")) || "Page";
}

function labelFor(control: Element, form: Element): string | undefined {
  const id = control.getAttribute("id");
  if (id) {
    const label = form.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return text(label);
  }
  const wrapping = control.closest("label");
  if (wrapping) return text(wrapping);
  const aria = control.getAttribute("aria-label");
  return aria ? aria.trim() : undefined;
}

function fieldKind(control: Element, inputType: string): FieldKind {
  if (control.tagName === "SELECT") return "enum";
  if (control.tagName === "TEXTAREA") return "string";
  switch (inputType) {
    case "number":
    case "range":
      return "number";
    case "checkbox":
      return "boolean";
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "url":
      return "url";
    case "date":
    case "datetime-local":
      return "date";
    case "time":
      return "time";
    case "file":
      return "file";
    default:
      return "string";
  }
}

function exclusionFor(control: Element, inputType: string, name: string): FieldExclusion | undefined {
  if (inputType === "hidden") return "hidden";
  if (inputType === "password") return "credential";
  const autocomplete = control.getAttribute("autocomplete") ?? "";
  if (/^cc-/.test(autocomplete) || PAYMENT_NAME_PATTERN.test(name)) return "payment-credential";
  if (inputType === "file") return "file";
  return undefined;
}

function numberAttribute(control: Element, attribute: string): number | undefined {
  const raw = control.getAttribute(attribute);
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function observeField(control: Element, form: Element, formSelector: string): FieldObservation | null {
  const name = control.getAttribute("name") ?? control.getAttribute("id") ?? "";
  if (!name) return null;
  const inputType = (control.getAttribute("type") ?? (control.tagName === "SELECT" ? "select" : "text")).toLowerCase();
  if (inputType === "submit" || inputType === "button" || inputType === "reset" || inputType === "image") return null;
  const excluded = exclusionFor(control, inputType, name);
  const field: FieldObservation = {
    id: `${formSelector}:field:${name}`,
    name,
    selector: selectorFor(control, `${formSelector} [name="${name}"]`),
    inputType,
    kind: fieldKind(control, inputType),
    required: control.hasAttribute("required"),
  };
  if (excluded) return { ...field, excluded };
  const label = labelFor(control, form);
  const placeholder = control.getAttribute("placeholder")?.trim();
  const pattern = control.getAttribute("pattern")?.trim();
  const min = numberAttribute(control, "min");
  const max = numberAttribute(control, "max");
  const maxLength = numberAttribute(control, "maxlength");
  const options =
    control.tagName === "SELECT"
      ? [...control.querySelectorAll("option")]
          .map((option) => option.getAttribute("value") ?? "")
          .filter((value) => value !== "")
      : undefined;
  return {
    ...field,
    ...(label ? { label } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(pattern ? { pattern } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(options ? { options } : {}),
  };
}

function observeButtons(form: Element, formSelector: string): ButtonObservation[] {
  return [...form.querySelectorAll("button, input[type=submit]")].map((button, index) => ({
    label: button.tagName === "INPUT" ? (button.getAttribute("value") ?? "Submit") : text(button),
    type: (button.getAttribute("type") ?? "submit").toLowerCase(),
    selector: selectorFor(button, `${formSelector} button:nth-of-type(${index + 1})`),
  }));
}

function classifyForm(
  method: "get" | "post",
  actionLabel: string,
  form: Element,
  fields: readonly FieldObservation[],
): { kind: CapabilityKind; riskClass: RiskClass } {
  const hasCredential = fields.some((field) => field.excluded === "credential");
  const hasPayment = fields.some((field) => field.excluded === "payment-credential");
  const roleSearch = form.getAttribute("role") === "search";
  const hasSearchInput = fields.some((field) => field.inputType === "search");
  const labels = [actionLabel, ...fields.map((field) => field.label ?? "")].join(" ");
  if (hasCredential || CREDENTIAL_ACTION_PATTERN.test(actionLabel)) return { kind: "form", riskClass: "credential" };
  if (hasPayment || FINALIZE_PATTERN.test(actionLabel)) return { kind: "form", riskClass: "finalize" };
  if (method === "get" && (roleSearch || hasSearchInput || SEARCH_PATTERN.test(labels))) {
    return { kind: "search", riskClass: "read" };
  }
  if (method === "get") return { kind: "search", riskClass: "read" };
  return { kind: "form", riskClass: "write" };
}

/**
 * A compound legacy form can carry several capabilities: the submit action,
 * embedded search inputs, and non-submit buttons that stage or review. Each
 * becomes its own observation so review and risk classification stay per
 * action rather than per form.
 */
function observeForm(form: Element, index: number, document: Document): CapabilityObservation[] {
  const selector = selectorFor(form, `form:nth-of-type(${index + 1})`);
  const method = (form.getAttribute("method") ?? "get").toLowerCase() === "post" ? "post" : "get";
  const heading = nearestHeading(form, document);
  const buttons = observeButtons(form, selector);
  const submit = buttons.find((button) => button.type === "submit") ?? buttons[0];
  const actionLabel = submit?.label ?? "Submit";
  const fields = [...form.querySelectorAll("input, select, textarea")]
    .map((control) => observeField(control, form, selector))
    .filter((field): field is FieldObservation => field !== null);
  const { kind, riskClass } = classifyForm(method, actionLabel, form, fields);
  const primary: CapabilityObservation = {
    id: `${kind}:${selector}`,
    kind,
    selector,
    heading,
    method,
    actionLabel,
    riskClass,
    fields,
    buttons,
  };
  const extras: CapabilityObservation[] = [];
  const searchFields = fields.filter((field) => field.inputType === "search" && !field.excluded);
  if (kind !== "search" && searchFields.length > 0) {
    extras.push({
      id: `search:${selector}`,
      kind: "search",
      selector: searchFields[0].selector,
      heading,
      method: "get",
      actionLabel: searchFields[0].label ?? "Search",
      riskClass: "read",
      fields: searchFields,
      buttons: [],
    });
  }
  for (const button of buttons.filter((candidate) => candidate.type === "button")) {
    const { riskClass: buttonRisk } = classifyForm("post", button.label, form, fields);
    extras.push({
      id: `action:${button.selector}`,
      kind: "form",
      selector: button.selector,
      heading,
      method: "post",
      actionLabel: button.label,
      riskClass: buttonRisk,
      fields: fields.filter((field) => field.inputType !== "search"),
      buttons: [button],
    });
  }
  return [primary, ...extras];
}

function observeTable(table: Element, index: number, document: Document): CapabilityObservation | null {
  const headers = [...table.querySelectorAll("thead th")].map((th) => text(th)).filter(Boolean);
  if (headers.length === 0) return null;
  const selector = selectorFor(table, `table:nth-of-type(${index + 1})`);
  const rowCount = table.querySelectorAll("tbody tr").length;
  const previous = document.querySelector('a[rel="prev"], [aria-label*="pagination" i] a:first-of-type') !== null;
  const next = document.querySelector('a[rel="next"]') !== null;
  return {
    id: `table:${selector}`,
    kind: "table",
    selector,
    heading: nearestHeading(table, document),
    method: "get",
    actionLabel: "Read rows",
    riskClass: "read",
    fields: [],
    buttons: [],
    table: { headers, rowCount, pagination: { previous, next } },
  };
}

export async function scanHtml(snapshot: HtmlSnapshot): Promise<GenericScanResult> {
  const html = snapshot.html;
  if (typeof html !== "string" || html.trim().length === 0) {
    throw new Error("The snapshot html is empty");
  }
  if (html.length > MAX_HTML_CHARS) {
    throw new Error(`The snapshot html is too large (${html.length} characters; limit ${MAX_HTML_CHARS})`);
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const scriptsIgnored = document.querySelectorAll("script").length;
  const forms = [...document.querySelectorAll("form")].flatMap((form, index) => observeForm(form, index, document));
  const tables = [...document.querySelectorAll("table")]
    .map((table, index) => observeTable(table, index, document))
    .filter((table): table is CapabilityObservation => table !== null);
  const capabilities = [...forms, ...tables];
  const allFields = capabilities.flatMap((capability) => capability.fields);

  return deepFreeze({
    snapshotId: snapshot.id,
    revision: snapshot.revision,
    sourceKind: snapshot.sourceKind,
    authorization: snapshot.authorization,
    title: snapshot.title,
    scanHash: await sha256Hex(html),
    capabilities,
    safety: {
      parsedInertly: true as const,
      externalRequests: 0 as const,
      executedScripts: 0 as const,
      scriptsIgnored,
      credentialFieldsExcluded: allFields.filter(
        (field) => field.excluded === "credential" || field.excluded === "payment-credential",
      ).length,
      hiddenFieldsExcluded: allFields.filter((field) => field.excluded === "hidden").length,
      retainedRawValues: false as const,
    },
  });
}
