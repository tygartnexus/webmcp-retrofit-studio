import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import { sha256Hex } from "./scanOwnedFixture";
import { attributeSelector, groupSelector, selectorFor, structuralSelector, uniqueId } from "./scanSelectors";
import { formControls, isDisabledControl, ownedControls } from "./formOwner";
import { classifyForm, destructiveName } from "./scanClassify";
import { buttonNames, choiceNames, choiceOptions, clipTo, LABEL_BUDGET, labelFor } from "./scanNames";
import { observeTable } from "./scanTable";
import { clipLabel, text, visibleText } from "./scanText";
import {
  ACTION_FIELD_PATTERN,
  isGenericAction,
  NAVIGATION_PATTERN,
  PAYMENT_NAME_PATTERN,
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
  /** Option names withheld from the parameter because they finalize or need credentials; a person can still pick them on the page. */
  withheld?: readonly string[];
  /** A same-name checkbox group: the value is an array of option keys. */
  multiple?: true;
  /** Legend of the enclosing fieldset, used to label a checkbox group. */
  groupLabel?: string;
  excluded?: FieldExclusion;
}

export interface ButtonObservation {
  label: string;
  /** Every name the button carries, unclipped; risk is judged against all of them. */
  riskLabels: readonly string[];
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
  /** The name or field that made this a credential or finalize action. */
  riskEvidence?: string;
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
  const label = labelFor(control, form);
  // An excluded control keeps its label so the owner can see which field decided the exclusion.
  if (excluded) return { ...field, ...(label ? { label } : {}), excluded };
  if (inputType === "radio") return observeRadio(control, field);
  if (inputType === "checkbox") return observeCheckbox(control, form, field);
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

function observeButtons(form: Element, document: Document): ButtonObservation[] {
  return formControls(form, document).filter((control) => control.matches(BUTTON_SELECTOR)).map((button) => {
    const type = (button.getAttribute("type") ?? "submit").toLowerCase();
    // Only a submitting control can redirect the submission; formaction on a plain button is inert.
    const formAction = isSubmitType(type) ? button.getAttribute("formaction")?.trim() : undefined;
    const formMethod = isSubmitType(type) ? button.getAttribute("formmethod")?.toLowerCase() : undefined;
    return {
      ...buttonNames(button, type),
      type,
      selector: selectorFor(button, document),
      ...(formAction ? { formAction } : {}),
      ...(formMethod === "get" || formMethod === "post" ? { formMethod } : {}),
    };
  });
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
  choices: readonly string[],
): CapabilityObservation {
  const effectiveMethod = button.formMethod ?? method;
  const { kind, riskClass, evidence } = classifyForm(effectiveMethod, button.label, form, fields, [...button.riskLabels, ...choices]);
  return {
    id: `action:${button.selector}`,
    kind,
    selector: button.selector,
    heading: base.heading,
    ...(base.rowLabel ? { rowLabel: base.rowLabel } : {}),
    ...(button.formAction ? { action: button.formAction } : {}),
    ...(evidence ? { riskEvidence: evidence } : {}),
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

interface PrimaryAction {
  submit?: ButtonObservation;
  actionLabel: string;
  riskLabels: readonly string[];
  /** The form's default button is disabled, so Enter submits nothing. */
  implicitBlocked: boolean;
}

function submitTypeOf(control: Element): string {
  return (control.getAttribute("type") ?? "submit").toLowerCase();
}

/**
 * The form's default button is its first submit-type control, disabled or not. A
 * disabled default button blocks implicit submission yet still names the action, so a
 * disabled "Delete account" is listed as excluded rather than replaced by a phantom
 * "Submit"; a plain button never stands in for the primary action.
 */
function primaryAction(form: Element, buttons: readonly ButtonObservation[], document: Document): PrimaryAction {
  const defaultButton = ownedControls(form, document).find(
    (control) => control.matches(BUTTON_SELECTOR) && isSubmitType(submitTypeOf(control)),
  );
  if (defaultButton && isDisabledControl(defaultButton)) {
    const names = buttonNames(defaultButton, submitTypeOf(defaultButton));
    return { actionLabel: names.label, riskLabels: names.riskLabels, implicitBlocked: true };
  }
  const submit = buttons.find((button) => isSubmitType(button.type));
  return { submit, actionLabel: submit?.label ?? "Submit", riskLabels: submit?.riskLabels ?? ["Submit"], implicitBlocked: false };
}

const CHOICE_TYPES = new Set(["select", "radio", "checkbox"]);

interface WithheldChoices {
  fields: FieldObservation[];
  /** The option that makes a select or radio group an action menu: every option of it is destructive. */
  menu?: string;
}

/** Destructive option keys and names per control name, so a parameter can leave them out. */
function destructiveChoices(controls: readonly Element[], form: Element): Map<string, { values: string[]; names: string[] }> {
  const found = new Map<string, { values: string[]; names: string[] }>();
  for (const control of controls) {
    const name = control.getAttribute("name") ?? control.getAttribute("id") ?? "";
    for (const option of choiceOptions(control, form)) {
      const hit = destructiveName(option.names);
      if (!hit) continue;
      const entry = found.get(name) ?? { values: [], names: [] };
      found.set(name, { values: [...entry.values, option.value], names: [...entry.names, hit] });
    }
  }
  return found;
}

/**
 * A destructive option under a specific button is not the form's action, but an agent must never be
 * able to pick it: the option is withheld from the parameter and named in the proposal. A select or
 * radio group left with no option is an action menu, and the form is judged on it; a checkbox group
 * left with none is simply not a parameter.
 */
function withholdDestructiveChoices(fields: readonly FieldObservation[], controls: readonly Element[], form: Element): WithheldChoices {
  const found = destructiveChoices(controls, form);
  const emptied = fields.find((field) => {
    const entry = found.get(field.name);
    return entry !== undefined && field.inputType !== "checkbox" && (field.options ?? []).every((value) => entry.values.includes(value));
  });
  const kept = fields.flatMap((field) => {
    const entry = found.get(field.name);
    if (!entry) return [field];
    // A lone checkbox is a boolean with no options; a destructive one is simply not a parameter.
    if (!field.options) return field.inputType === "checkbox" ? [] : [field];
    const options = field.options.filter((value) => !entry.values.includes(value));
    if (options.length === 0) return field.inputType === "checkbox" ? [] : [field];
    return [{ ...field, options, withheld: [...new Set(entry.names)] }];
  });
  const menu = emptied ? found.get(emptied.name)?.names[0] : undefined;
  return { fields: kept, ...(menu ? { menu } : {}) };
}

/**
 * A choice control is the action, whatever the button says, when it is the form's only
 * parameter or when its own name or label calls it the action or operation.
 */
function choiceIsTheAction(fields: readonly FieldObservation[], controls: readonly Element[]): boolean {
  const live = fields.filter((field) => !field.excluded);
  const choices = live.filter((field) => CHOICE_TYPES.has(field.inputType));
  if (live.length === 1 && choices.length === 1) return true;
  const spokenName = (value: string) => value.replace(/[_-]+/g, " ");
  const groups = controls.flatMap((control) => [...control.querySelectorAll("optgroup")].map((group) => group.getAttribute("label") ?? ""));
  return (
    choices.some((field) => ACTION_FIELD_PATTERN.test(spokenName(`${field.name} ${field.label ?? ""} ${field.groupLabel ?? ""}`))) ||
    groups.some((label) => ACTION_FIELD_PATTERN.test(label))
  );
}

function observeForm(form: Element, document: Document): FormObservation {
  const selector = selectorFor(form, document);
  const rowLabel = rowLabelFor(form);
  const method = (form.getAttribute("method") ?? "get").toLowerCase() === "post" ? "post" : "get";
  const heading = nearestHeading(form, document);
  const buttons = observeButtons(form, document);
  const { submit, actionLabel, riskLabels, implicitBlocked } = primaryAction(form, buttons, document);
  const primaryMethod = submit?.formMethod ?? method;
  const controls = formControls(form, document);
  const { fields, menu } = withholdDestructiveChoices(observeFields(controls, form, selector, document), controls, form);
  const choices = choiceNames(controls, form);
  // Judged on every name a button carries, so an aria-label override on a visibly generic button changes nothing;
  // a choice control whose every option is destructive is the action whatever the button says.
  const judged = (names: readonly string[], effectiveMethod: "get" | "post") => [
    ...(names.some(isGenericAction) || (effectiveMethod === "post" && choiceIsTheAction(fields, controls)) ? choices : []),
    ...(menu ? [menu] : []),
  ];
  const { kind, riskClass, evidence } = classifyForm(primaryMethod, actionLabel, form, fields, [...riskLabels, ...judged(riskLabels, primaryMethod)]);
  // An excluded form is still listed without a submission path, so the owner sees why nothing was proposed.
  const primaryIsExcluded = riskClass === "credential" || riskClass === "finalize";
  const implicit = !implicitBlocked && implicitSubmitters(controls).length === 1;
  const hasPrimary = submit !== undefined || implicit || primaryIsExcluded;
  const base = { heading, rowLabel };
  const plain = buttons.filter((candidate) => candidate.type === "button");
  const buttonExtras = [
    ...plain
      .filter((candidate) => !isNavigation(candidate))
      .map((button) => buttonCapability(button, base, "post", form, fields, judged(button.riskLabels, "post"))),
    ...buttons
      .filter((candidate) => isSubmitType(candidate.type) && candidate !== submit)
      .map((button) => buttonCapability(button, base, method, form, fields, judged(button.riskLabels, button.formMethod ?? method))),
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
    ...(evidence ? { riskEvidence: evidence } : {}),
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
    .map((table) => observeTable(table, document, nearestHeading(table, document)))
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
