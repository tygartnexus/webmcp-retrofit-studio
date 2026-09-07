import { accessibleContent, collapseText, renderedText, text, visibleText } from "./scanText";
import { destructiveName } from "./scanClassify";
import { CONFIRM_FAMILY_PATTERN, CONSENT_STATEMENT_PATTERN } from "./scanVocabulary";

/**
 * Names for controls: field labels, button names in accessible-name order,
 * and the option names of choice controls. Risk classification reads the
 * unclipped names; only displayed labels are clipped.
 */

/** The label element for a control: one pointing at its id (the form's first), else one wrapping it. */
function labelElementFor(control: Element, form: Element): Element | null {
  const id = control.getAttribute("id");
  const byFor = id
    ? (form.querySelector(`label[for="${CSS.escape(id)}"]`) ?? control.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`))
    : null;
  return byFor ?? control.closest("label");
}

export function labelFor(control: Element, form: Element): string | undefined {
  const label = labelElementFor(control, form);
  if (label) return text(label);
  return collapseText(control.getAttribute("aria-label") ?? "") || undefined;
}

/** A choice control's accessible name: aria-labelledby, aria-label, then its label element as assistive technology reads it. */
function choiceName(control: Element, form: Element): string {
  const label = labelElementFor(control, form);
  return referencedName(control) || collapseText(control.getAttribute("aria-label") ?? "") || (label ? accessibleContent(label) : "");
}

/** Action labels are clipped so a decorative or generated label cannot balloon names, titles, or staged changes. */
export const LABEL_BUDGET = 120;

export function clipTo(value: string, budget: number): string {
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

export interface ButtonNames {
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
export function buttonNames(button: Element, type: string): ButtonNames {
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
  // What a sighted person reads is a name too: "Save" beside a screen-reader-only "profile" is still generic.
  const sighted = isInput ? "" : visibleText(button);
  // Every name is judged unclipped, the aria-labelledby text, the label element, and the title included: a verb
  // past the label budget still counts, and an icon with a title-only verb is classified too. Only the displayed
  // label is clipped.
  // A description never names the button, but a destructive verb hidden in one is still judged.
  const described = referencedName(button, "aria-describedby");
  const names = [label, referenced, ariaLabel, native, content, title, rendered, sighted, described].filter(
    (name): name is string => Boolean(name),
  );
  return { label, riskLabels: [...new Set(names)] };
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
export interface ChoiceOption {
  /** The option key as it would be submitted: the value attribute, an option's text without one, or "on" for a bare checkbox. */
  value: string;
  /** Every name the option carries, consent wording removed. */
  names: readonly string[];
  /** The page selects or checks this option by default. */
  preselected: boolean;
}

/**
 * The key a select option submits: its value attribute, else its text with ASCII whitespace
 * stripped and collapsed, exactly as the browser computes the value (zero-width and no-break
 * characters stay, so the key still matches the option when applied).
 */
export function optionKey(option: Element): string {
  if (option.hasAttribute("value")) return option.getAttribute("value") ?? "";
  return (option.textContent ?? "").replace(/[\t\n\f\r ]+/g, " ").trim();
}

/** A disabled option, or one inside a disabled optgroup, is never submitted, so it is never offered. */
export function isOfferedOption(option: Element): boolean {
  return !option.hasAttribute("disabled") && !option.closest("optgroup")?.hasAttribute("disabled");
}

/**
 * "I confirm I am over 18" is consent, not an action, and is not judged; but a first-person
 * statement that still carries a destructive verb once the confirm family is set aside
 * ("I want to delete my account") is judged on that residual.
 */
function judgedNames(names: readonly string[]): string[] {
  return names.map(collapseText).flatMap((name) => {
    if (!name) return [];
    if (!CONSENT_STATEMENT_PATTERN.test(name)) return [name];
    // The residual drops the pronoun too, so the evidence reads "want to delete my account", not "I and delete".
    const residual = collapseText(
      collapseText(name.replace(CONFIRM_FAMILY_PATTERN, "").replace(CONSENT_STATEMENT_PATTERN, "")).replace(/^and\s+/i, ""),
    );
    return destructiveName([residual]) ? [residual] : [];
  });
}

/** The options of one choice control (a select, radio, or checkbox), each with every name it carries. */
export function choiceOptions(control: Element, form: Element): ChoiceOption[] {
  if (control.tagName === "SELECT") {
    const options = [...control.querySelectorAll("option")];
    // With no selected attribute a single select shows its first option; a multiple select shows none.
    const defaultIndex = options.some((option) => option.hasAttribute("selected")) || control.hasAttribute("multiple") ? -1 : 0;
    return options.map((option, index) => ({
      value: optionKey(option),
      preselected: option.hasAttribute("selected") || index === defaultIndex,
      names: judgedNames([
        option.getAttribute("label") ?? "",
        option.getAttribute("aria-label") ?? "",
        accessibleContent(option),
        spoken(option.getAttribute("value")),
        option.closest("optgroup")?.getAttribute("label") ?? "",
      ]),
    }));
  }
  const type = (control.getAttribute("type") ?? "").toLowerCase();
  if (control.tagName === "INPUT" && (type === "radio" || type === "checkbox")) {
    const value = control.getAttribute("value") ?? (type === "checkbox" ? "on" : "");
    return [{ value, preselected: control.hasAttribute("checked"), names: judgedNames([choiceName(control, form), spoken(value)]) }];
  }
  return [];
}

/** Every option name of a form's choice controls, for judging the form whole when a choice is its action. */
export function choiceNames(controls: readonly Element[], form: Element): string[] {
  return controls.flatMap((control) => choiceOptions(control, form).flatMap((option) => option.names));
}
