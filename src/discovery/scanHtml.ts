import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import { sha256Hex } from "./scanOwnedFixture";
import { attributeSelector, groupSelector, selectorFor, structuralSelector, uniqueId } from "./scanSelectors";
import { formControls, isDisabledControl, ownedControls } from "./formOwner";
import { classifyForm } from "./scanClassify";
import { observeTable } from "./scanTable";
import { accessibleContent, clipLabel, collapseText, renderedText, text, visibleText } from "./scanText";
import {
  CONSENT_PATTERN,
  GENERIC_ACTION_PATTERN,
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

/** The label element for a control: one pointing at its id (the form's first), else one wrapping it. */
function labelElementFor(control: Element, form: Element): Element | null {
  const id = control.getAttribute("id");
  const byFor = id
    ? (form.querySelector(`label[for="${CSS.escape(id)}"]`) ?? control.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`))
    : null;
  return byFor ?? control.closest("label");
}

function labelFor(control: Element, form: Element): string | undefined {
  const label = labelElementFor(control, form);
  if (label) return text(label);
  return collapseText(control.getAttribute("aria-label") ?? "") || undefined;
}

/** A choice control's accessible name: aria-labelledby, aria-label, then its label element as assistive technology reads it. */
function choiceName(control: Element, form: Element): string {
  const label = labelElementFor(control, form);
  return referencedName(control) || collapseText(control.getAttribute("aria-label") ?? "") || (label ? accessibleContent(label) : "");
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

/** Action labels are clipped so a decorative or generated label cannot balloon names, titles, or staged changes. */
const LABEL_BUDGET = 120;

function clipTo(value: string, budget: number): string {
  return value.length <= budget ? value : `${value.slice(0, budget - 1)}…`;
}

/** The text of the elements an id-list attribute names, hidden or not, in the order named. */
function referencedName(button: Element, attribute = "aria-labelledby"): string | undefined {
  const name = (button.getAttribute(attribute) ?? "")
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

interface ButtonNames {
  label: string;
  riskLabels: string[];
}

/**
 * A button is labelable: a label element pointing at it, or wrapping it, names it before its own content.
 * Only a label whose control really is this button counts: a for= that resolves to another element with
 * the same id, or a wrapping label whose first labelable descendant is an earlier input, labels that one.
 */
function nativeLabel(button: Element): string | undefined {
  const id = button.getAttribute("id");
  const byFor =
    id && button.ownerDocument.getElementById(id) === button
      ? button.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)
      : null;
  if (byFor) return accessibleContent(byFor) || undefined;
  const wrapping = button.closest("label");
  if (!wrapping || (wrapping as HTMLLabelElement).control !== button) return undefined;
  // The label's own text names the button; the button's content is not part of its name.
  const around = [...wrapping.childNodes].filter((node) => node !== button && !node.contains(button));
  return collapseText(around.map((node) => accessibleContent(node)).join(" ")) || undefined;
}

/**
 * The label follows accessible-name order: aria-labelledby, then aria-label,
 * then a label element, then content as assistive technology reads it (text
 * with image alt and descendant aria-labels in place, or an input's value or
 * alt), then title, then a generic word. The
 * risk labels are every name the button carries, title included and its
 * rendered text with aria-hidden spans, so an ARIA override cannot hide a
 * finalizing verb from classification.
 */
function buttonNames(button: Element, type: string): ButtonNames {
  // Attributes are cleaned like content, so a zero-width character cannot split a verb.
  const attribute = (name: string) => collapseText(button.getAttribute(name) ?? "") || undefined;
  const ariaLabel = attribute("aria-label");
  const title = attribute("title");
  const fallback = type === "button" ? "Button" : "Submit";
  const isInput = button.tagName === "INPUT";
  const content = isInput ? attribute(type === "image" ? "alt" : "value") : accessibleContent(button);
  const referenced = referencedName(button);
  const native = nativeLabel(button);
  const label = clipTo(referenced || ariaLabel || native || content || title || fallback, LABEL_BUDGET);
  const rendered = isInput ? "" : renderedText(button);
  // Every name is judged unclipped, the aria-labelledby text, the label element, and the title included: a verb
  // past the label budget still counts, and an icon with a title-only verb is classified too. Only the displayed
  // label is clipped.
  // A description never names the button, but a destructive verb hidden in one is still judged.
  const described = referencedName(button, "aria-describedby");
  const names = [label, referenced, ariaLabel, native, content, title, rendered, described].filter(
    (name): name is string => Boolean(name),
  );
  return { label, riskLabels: [...new Set(names)] };
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

/** A value attribute read as words, so "delete_account" is judged like "delete account". */
function spoken(value: string | null): string {
  return collapseText((value ?? "").replace(/[_-]+/g, " "));
}

/**
 * Option names and values of a form's choice controls. A select or radio group
 * used as an action menu can carry a destructive choice, so every option is
 * judged like a button name when the button itself is generic ("Go"); a form
 * with such a choice is excluded whole. Under a specific button ("Send
 * message") the choices are plain data and are not judged.
 */
function choiceNames(controls: readonly Element[], form: Element): string[] {
  return controls
    .flatMap((control) => {
      if (control.tagName === "SELECT") {
        const groups = [...control.querySelectorAll("optgroup")].map((group) => group.getAttribute("label") ?? "");
        const options = [...control.querySelectorAll("option")].flatMap((option) => [
          option.getAttribute("label") ?? "",
          option.getAttribute("aria-label") ?? "",
          accessibleContent(option),
          spoken(option.getAttribute("value")),
        ]);
        return [...groups, ...options];
      }
      const type = (control.getAttribute("type") ?? "").toLowerCase();
      if (control.tagName === "INPUT" && (type === "radio" || type === "checkbox")) {
        return [choiceName(control, form), spoken(control.getAttribute("value"))];
      }
      return [];
    })
    // "I confirm I am over 18" is consent, not an action; the confirm family is not judged on a choice.
    .map((name) => collapseText(name.replace(CONSENT_PATTERN, "")))
    .filter(Boolean);
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

function observeForm(form: Element, document: Document): FormObservation {
  const selector = selectorFor(form, document);
  const rowLabel = rowLabelFor(form);
  const method = (form.getAttribute("method") ?? "get").toLowerCase() === "post" ? "post" : "get";
  const heading = nearestHeading(form, document);
  const buttons = observeButtons(form, document);
  const { submit, actionLabel, riskLabels, implicitBlocked } = primaryAction(form, buttons, document);
  const primaryMethod = submit?.formMethod ?? method;
  const controls = formControls(form, document);
  const fields = observeFields(controls, form, selector, document);
  const choices = choiceNames(controls, form);
  const judged = (label: string) => (GENERIC_ACTION_PATTERN.test(label.trim()) ? choices : []);
  const { kind, riskClass, evidence } = classifyForm(primaryMethod, actionLabel, form, fields, [...riskLabels, ...judged(actionLabel)]);
  // An excluded form is still listed without a submission path, so the owner sees why nothing was proposed.
  const primaryIsExcluded = riskClass === "credential" || riskClass === "finalize";
  const implicit = !implicitBlocked && implicitSubmitters(controls).length === 1;
  const hasPrimary = submit !== undefined || implicit || primaryIsExcluded;
  const base = { heading, rowLabel };
  const plain = buttons.filter((candidate) => candidate.type === "button");
  const buttonExtras = [
    ...plain
      .filter((candidate) => !isNavigation(candidate))
      .map((button) => buttonCapability(button, base, "post", form, fields, judged(button.label))),
    ...buttons
      .filter((candidate) => isSubmitType(candidate.type) && candidate !== submit)
      .map((button) => buttonCapability(button, base, method, form, fields, judged(button.label))),
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
