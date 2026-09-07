import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import { sha256Hex } from "./scanOwnedFixture";
import { attributeSelector, groupSelector, selectorFor, structuralSelector, uniqueId } from "./scanSelectors";
import { formControls } from "./formOwner";
import { accessibleContent, clipLabel, text, visibleText } from "./scanText";
import {
  CREDENTIAL_ACTION_PATTERN,
  FINALIZE_PATTERN,
  NAVIGATION_PATTERN,
  NEUTRAL_ACTION_PATTERN,
  NEXT_PATTERN,
  PAYMENT_NAME_PATTERN,
  PREVIOUS_PATTERN,
  READ_ACTION_PATTERN,
  SEARCH_PATTERN,
} from "./scanVocabulary";
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
  /** A same-name checkbox group: the value is an array of option keys. */
  multiple?: true;
  /** Legend of the enclosing fieldset, used to label a checkbox group. */
  groupLabel?: string;
  excluded?: FieldExclusion;
}

export interface ButtonObservation {
  label: string;
  type: string;
  selector: string;
  /** A submit button's own target, when it overrides the form's. */
  formAction?: string;
  formMethod?: "get" | "post";
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
  /** Visible text identifying the row or repeated block this form belongs to. */
  rowLabel?: string;
  /** A button-level formaction that overrides the form's action. */
  action?: string;
}

export interface ScanSafety {
  parsedInertly: true;
  externalRequests: 0;
  executedScripts: 0;
  scriptsIgnored: number;
  credentialFieldsExcluded: number;
  hiddenFieldsExcluded: number;
  fileFieldsExcluded: number;
  navigationButtonsSkipped: number;
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

function nearestHeading(element: Element, document: Document): string {
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  let best = "";
  for (const heading of headings) {
    const position = heading.compareDocumentPosition(element);
    const label = text(heading);
    if (label && position & Node.DOCUMENT_POSITION_FOLLOWING) best = label;
  }
  return best || text(document.querySelector("title")) || "Page";
}

function labelFor(control: Element, form: Element): string | undefined {
  const id = control.getAttribute("id");
  if (id) {
    const label = form.querySelector(`label[for="${CSS.escape(id)}"]`) ?? control.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
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

/**
 * A control's selector must resolve to exactly the controls it stands for: a
 * unique id, else a name attribute shared only by its group (radio or
 * checkbox), else a structural path. A nameless control never gets a name
 * selector built from its id.
 */
function controlSelector(control: Element, form: Element, formSelector: string, inputType: string, document: Document): string {
  const id = uniqueId(control, document);
  if (id) return `#${id}`;
  if (control.closest("form") !== form) return structuralSelector(control, document);
  const nameAttribute = control.getAttribute("name");
  if (nameAttribute) {
    const sharing = control.closest("form")?.querySelectorAll(attributeSelector("", "name", nameAttribute).trim()).length ?? 1;
    const grouped = inputType === "radio" || inputType === "checkbox";
    if (grouped) return groupSelector(formSelector, inputType, nameAttribute);
    if (sharing === 1) return attributeSelector(formSelector, "name", nameAttribute);
  }
  return structuralSelector(control, document);
}

function observeField(control: Element, form: Element, formSelector: string, document: Document): FieldObservation | null {
  const defaultType = control.tagName === "SELECT" ? "select" : control.tagName === "TEXTAREA" ? "textarea" : "text";
  const inputType = (control.getAttribute("type") ?? defaultType).toLowerCase();
  if (inputType === "submit" || inputType === "button" || inputType === "reset" || inputType === "image") return null;
  const given = control.getAttribute("name") ?? control.getAttribute("id") ?? "";
  const excluded = exclusionFor(control, inputType, given);
  // A nameless control can never be a parameter, but an excluded one still counts and still classifies its form.
  if (!given && !excluded) return null;
  const name = given || `unnamed_${inputType}`;
  const field: FieldObservation = {
    id: `${formSelector}:field:${name}`,
    name,
    selector: controlSelector(control, form, formSelector, inputType, document),
    inputType,
    kind: fieldKind(control, inputType),
    required: control.hasAttribute("required"),
  };
  if (excluded) return { ...field, excluded };
  if (inputType === "radio") return observeRadio(control, field);
  if (inputType === "checkbox") return observeCheckbox(control, form, field);
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

/**
 * A radio is one option of a group. Its static value attribute is the option
 * key (never user data), and the fieldset legend names the group.
 */
function observeRadio(control: Element, field: FieldObservation): FieldObservation {
  const legend = text(control.closest("fieldset")?.querySelector("legend") ?? null);
  const value = control.getAttribute("value") ?? "";
  return {
    ...field,
    kind: "enum",
    ...(legend ? { label: legend } : {}),
    options: value ? [value] : [],
  };
}

/**
 * Two fields in one form can end up with the same name: nameless inputs that
 * share a duplicated id, or repeated text inputs with one name. The second
 * and later ones get a numeric suffix so schema keys and field ids stay
 * distinct; their selectors already point at their own control.
 */
function dedupeFieldNames(fields: readonly FieldObservation[], formSelector: string): FieldObservation[] {
  const seen = new Map<string, number>();
  return fields.map((field) => {
    const count = (seen.get(field.name) ?? 0) + 1;
    seen.set(field.name, count);
    if (count === 1) return field;
    const name = `${field.name}_${count}`;
    return { ...field, name, id: `${formSelector}:field:${name}` };
  });
}

/** A checkbox keeps its static value key so a same-name group can collapse into an enum array. */
function observeCheckbox(control: Element, form: Element, field: FieldObservation): FieldObservation {
  const label = labelFor(control, form);
  const legend = text(control.closest("fieldset")?.querySelector("legend") ?? null);
  // A checkbox without a value attribute submits "on", which is therefore its option key.
  const value = control.getAttribute("value") ?? "on";
  return { ...field, ...(label ? { label } : {}), ...(legend ? { groupLabel: legend } : {}), options: [value] };
}

/**
 * Two or more same-name checkboxes form a multi-select group: one enum field
 * whose value is an array of option keys, labelled by the fieldset legend.
 * A lone checkbox stays a boolean.
 */
function collapseCheckboxGroups(fields: readonly FieldObservation[], formSelector: string): FieldObservation[] {
  const counts = new Map<string, number>();
  for (const field of fields) {
    if (field.inputType === "checkbox") counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
  }
  const groups = new Map<string, FieldObservation>();
  const collapsed: FieldObservation[] = [];
  for (const field of fields) {
    if (field.inputType !== "checkbox") {
      collapsed.push(field);
      continue;
    }
    if ((counts.get(field.name) ?? 0) < 2) {
      const { options: _single, groupLabel: _legend, ...lone } = field;
      collapsed.push(lone);
      continue;
    }
    const existing = groups.get(field.name);
    if (!existing) {
      // The group is labelled by its legend; an individual option's label would mislead.
      const { label: _own, groupLabel, ...rest } = field;
      const group: FieldObservation = {
        ...rest,
        ...(groupLabel ? { label: groupLabel } : {}),
        kind: "enum",
        multiple: true,
        selector: groupSelector(formSelector, "checkbox", field.name),
      };
      groups.set(field.name, group);
      collapsed.push(group);
      continue;
    }
    const merged: FieldObservation = {
      ...existing,
      required: existing.required || field.required,
      options: [...new Set([...(existing.options ?? []), ...(field.options ?? [])])],
    };
    groups.set(field.name, merged);
    collapsed[collapsed.indexOf(existing)] = merged;
  }
  return collapsed;
}

/** Same-name radios collapse into one enum field; required if any option is. */
function collapseRadioGroups(
  fields: readonly FieldObservation[],
  formSelector: string,
): FieldObservation[] {
  const groups = new Map<string, FieldObservation>();
  const collapsed: FieldObservation[] = [];
  for (const field of fields) {
    if (field.inputType !== "radio") {
      collapsed.push(field);
      continue;
    }
    const existing = groups.get(field.name);
    if (!existing) {
      const group = { ...field, selector: groupSelector(formSelector, "radio", field.name) };
      groups.set(field.name, group);
      collapsed.push(group);
      continue;
    }
    const merged: FieldObservation = {
      ...existing,
      required: existing.required || field.required,
      options: [...new Set([...(existing.options ?? []), ...(field.options ?? [])])],
    };
    groups.set(field.name, merged);
    collapsed[collapsed.indexOf(existing)] = merged;
  }
  return collapsed;
}

const BUTTON_SELECTOR = "button, input[type=submit], input[type=image], input[type=button]";

/** Input types that submit a button-less form on Enter when they are its only such field (HTML implicit submission). */
const IMPLICIT_SUBMIT_TYPES = new Set([
  "text", "search", "url", "tel", "email", "password", "date", "month", "week", "time", "datetime-local", "number",
]);

/** A submit button or an image button submits the form; a plain button does not. */
function isSubmitType(type: string): boolean {
  return type === "submit" || type === "image";
}

/** Action labels are clipped so a decorative or generated label cannot balloon names, titles, or staged changes. */
const LABEL_BUDGET = 120;

function clipTo(value: string, budget: number): string {
  return value.length <= budget ? value : `${value.slice(0, budget - 1)}…`;
}

/** The text of the elements an aria-labelledby names, hidden or not, in the order named. */
function referencedName(button: Element): string | undefined {
  const name = (button.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => button.ownerDocument.getElementById(id))
    .filter((element): element is HTMLElement => element !== null)
    .map((element) => accessibleContent(element, true))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return name || undefined;
}

/**
 * Accessible-name order: aria-labelledby, then aria-label, then content as
 * assistive technology reads it (text with image alt in place, or an input's
 * value or alt), then title, then a generic word when nothing names the control.
 */
function buttonLabel(button: Element, type: string): string {
  const ariaLabel = button.getAttribute("aria-label")?.trim();
  const title = button.getAttribute("title")?.trim();
  const fallback = type === "button" ? "Button" : "Submit";
  const content =
    button.tagName !== "INPUT"
      ? accessibleContent(button)
      : type === "image"
        ? button.getAttribute("alt")?.trim()
        : button.getAttribute("value")?.trim();
  return clipTo(referencedName(button) || ariaLabel || content || title || fallback, LABEL_BUDGET);
}

function observeButtons(form: Element, document: Document): ButtonObservation[] {
  return formControls(form, document).filter((control) => control.matches(BUTTON_SELECTOR)).map((button) => {
    const type = (button.getAttribute("type") ?? "submit").toLowerCase();
    // Only a submitting control can redirect the submission; formaction on a plain button is inert.
    const formAction = isSubmitType(type) ? button.getAttribute("formaction")?.trim() : undefined;
    const formMethod = isSubmitType(type) ? button.getAttribute("formmethod")?.toLowerCase() : undefined;
    return {
      label: buttonLabel(button, type),
      type,
      selector: selectorFor(button, document),
      ...(formAction ? { formAction } : {}),
      ...(formMethod === "get" || formMethod === "post" ? { formMethod } : {}),
    };
  });
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
  const neutral = NEUTRAL_ACTION_PATTERN.test(actionLabel.trim());
  if (hasCredential || (!neutral && CREDENTIAL_ACTION_PATTERN.test(actionLabel))) {
    return { kind: "form", riskClass: "credential" };
  }
  if (hasPayment || (!neutral && FINALIZE_PATTERN.test(actionLabel))) return { kind: "form", riskClass: "finalize" };
  const readSignal =
    neutral || roleSearch || hasSearchInput || SEARCH_PATTERN.test(labels) || READ_ACTION_PATTERN.test(actionLabel.trim());
  if (method === "get" && readSignal) return { kind: "search", riskClass: "read" };
  // A GET form with no read signal is still an action; stage it rather than assume it is safe.
  return { kind: "form", riskClass: "write" };
}

/**
 * A compound legacy form can carry several capabilities: the submit action,
 * embedded search inputs, and non-submit buttons that stage or review. Each
 * becomes its own observation so review and risk classification stay per
 * action rather than per form.
 */
/**
 * Visible text that identifies the row or repeated block a form sits in: the
 * first non-form cell of its table row, or the heading of a repeated sibling
 * container. Never a hidden value.
 */

function rowLabelFor(form: Element): string | undefined {
  const row = form.closest("tr");
  if (row) {
    const label = [...row.children].filter((cell) => !cell.contains(form)).map(visibleText).find(Boolean);
    return label ? clipLabel(label) : undefined;
  }
  const container = form.parentElement;
  const grandparent = container?.parentElement;
  if (!container || !grandparent) return undefined;
  const repeated = [...grandparent.children].filter(
    (sibling) => sibling.tagName === container.tagName && sibling.querySelector("form"),
  );
  if (repeated.length < 2) return undefined;
  const heading = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, strong")].find(
    (candidate) => !form.contains(candidate),
  );
  const fromHeading = heading ? visibleText(heading) : "";
  if (fromHeading) return clipLabel(fromHeading);
  const firstText = [...container.children].filter((child) => child !== form && !child.contains(form)).map(visibleText).find(Boolean);
  return firstText ? clipLabel(firstText) : undefined;
}

function buttonCapability(
  button: ButtonObservation,
  base: Pick<CapabilityObservation, "heading" | "rowLabel">,
  method: "get" | "post",
  form: Element,
  fields: readonly FieldObservation[],
): CapabilityObservation {
  const effectiveMethod = button.formMethod ?? method;
  const { kind, riskClass } = classifyForm(effectiveMethod, button.label, form, fields);
  return {
    id: `action:${button.selector}`,
    kind,
    selector: button.selector,
    heading: base.heading,
    ...(base.rowLabel ? { rowLabel: base.rowLabel } : {}),
    ...(button.formAction ? { action: button.formAction } : {}),
    method: effectiveMethod,
    actionLabel: button.label,
    riskClass,
    fields: effectiveMethod === "get" ? fields : fields.filter((field) => field.inputType !== "search"),
    buttons: [button],
  };
}

interface FormObservation {
  capabilities: CapabilityObservation[];
  fields: FieldObservation[];
  navigationSkipped: number;
}

function observeFields(controls: readonly Element[], form: Element, selector: string, document: Document): FieldObservation[] {
  return dedupeFieldNames(
    collapseCheckboxGroups(
      collapseRadioGroups(
        controls
          .filter((control) => control.matches("input, select, textarea"))
          .map((control) => observeField(control, form, selector, document))
          .filter((field): field is FieldObservation => field !== null),
        selector,
      ),
      selector,
    ),
    selector,
  );
}

/**
 * Without a submitting control a form only submits implicitly, and only with a single
 * Enter-submitting input, nameless ones included. Disabled controls are already absent
 * from a form's controls, so they neither block nor enable that path.
 */
function implicitSubmitters(controls: readonly Element[]): Element[] {
  return controls.filter(
    (control) =>
      control.tagName === "INPUT" && IMPLICIT_SUBMIT_TYPES.has((control.getAttribute("type") ?? "text").toLowerCase()),
  );
}

/** The read tool a search field gets when no button already offers one. */
function fieldSearch(searchFields: readonly FieldObservation[], selector: string, heading: string): CapabilityObservation {
  return {
    id: `search:${selector}`,
    kind: "search",
    selector: searchFields[0].selector,
    heading,
    method: "get",
    actionLabel: clipTo(searchFields[0].label ?? "Search", LABEL_BUDGET),
    riskClass: "read",
    fields: searchFields,
    buttons: [],
  };
}

function observeForm(form: Element, document: Document): FormObservation {
  const selector = selectorFor(form, document);
  const rowLabel = rowLabelFor(form);
  const method = (form.getAttribute("method") ?? "get").toLowerCase() === "post" ? "post" : "get";
  const heading = nearestHeading(form, document);
  const buttons = observeButtons(form, document);
  // The primary action is the first submitting control; a plain button never stands in for it.
  const submit = buttons.find((button) => isSubmitType(button.type));
  const actionLabel = submit?.label ?? "Submit";
  const primaryMethod = submit?.formMethod ?? method;
  const controls = formControls(form, document);
  const fields = observeFields(controls, form, selector, document);
  const { kind, riskClass } = classifyForm(primaryMethod, actionLabel, form, fields);
  // An excluded form is still listed without a submission path, so the owner sees why nothing was proposed.
  const primaryIsExcluded = riskClass === "credential" || riskClass === "finalize";
  const hasPrimary = submit !== undefined || implicitSubmitters(controls).length === 1 || primaryIsExcluded;
  const base = { heading, rowLabel };
  const plain = buttons.filter((candidate) => candidate.type === "button");
  const buttonExtras = [
    ...plain.filter((candidate) => !isNavigation(candidate)).map((button) => buttonCapability(button, base, "post", form, fields)),
    ...buttons
      .filter((candidate) => isSubmitType(candidate.type) && candidate !== submit)
      .map((button) => buttonCapability(button, base, method, form, fields)),
  ];
  // A search field gets its own read tool unless a GET submit button already offers one; either way the write does not carry it.
  const searchFields = fields.filter((field) => field.inputType === "search" && !field.excluded);
  const buttonSearch = buttonExtras.some((extra) => extra.kind === "search");
  const emitSearch = hasPrimary && kind !== "search" && !primaryIsExcluded && searchFields.length > 0 && !buttonSearch;
  const searchOwnedElsewhere = kind !== "search" && (emitSearch || buttonSearch);
  const primary: CapabilityObservation = {
    id: `${kind}:${selector}`,
    kind,
    selector,
    heading,
    ...(rowLabel ? { rowLabel } : {}),
    ...(submit?.formAction ? { action: submit.formAction } : {}),
    method: primaryMethod,
    actionLabel,
    riskClass,
    fields: searchOwnedElsewhere ? fields.filter((field) => field.inputType !== "search") : fields,
    buttons,
  };
  const extras = [...(emitSearch ? [fieldSearch(searchFields, selector, heading)] : []), ...buttonExtras];
  return {
    capabilities: hasPrimary ? [primary, ...extras] : extras,
    fields,
    navigationSkipped: plain.filter(isNavigation).length,
  };
}

function isNavigation(button: ButtonObservation): boolean {
  return NAVIGATION_PATTERN.test(button.label.trim());
}

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

function observeTable(table: Element, document: Document): CapabilityObservation | null {
  const headers = headerCells(table);
  if (headers.length === 0) return null;
  const selector = selectorFor(table, document);
  const rowCount = ownedRows(table).filter((row) => ownedCells(row, "td").length > 0).length;
  const { previous, next } = paginationFor(table);
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

/** Selectors are unique per element, so ids collide only in pathological markup; suffix them anyway. */
function withUniqueIds(capabilities: readonly CapabilityObservation[]): CapabilityObservation[] {
  const seen = new Map<string, number>();
  return capabilities.map((capability) => {
    const count = (seen.get(capability.id) ?? 0) + 1;
    seen.set(capability.id, count);
    return count === 1 ? capability : { ...capability, id: `${capability.id}#${count}` };
  });
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
  const observedForms = [...document.querySelectorAll("form")].map((form) => observeForm(form, document));
  // Counted from the controls each form owns, so a navigation button associated by a form attribute counts too.
  const navigationButtonsSkipped = observedForms.reduce((sum, observed) => sum + observed.navigationSkipped, 0);
  const forms = observedForms.flatMap((observed) => observed.capabilities);
  const tables = [...document.querySelectorAll("table")]
    .map((table) => observeTable(table, document))
    .filter((table): table is CapabilityObservation => table !== null);
  const capabilities = withUniqueIds([...forms, ...tables]);
  // Every observed control counts once, whether or not its form produced a capability.
  const allFields = observedForms.flatMap((observed) => observed.fields);

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
      fileFieldsExcluded: allFields.filter((field) => field.excluded === "file").length,
      navigationButtonsSkipped,
      retainedRawValues: false as const,
    },
  });
}
