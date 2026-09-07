/**
 * Form ownership, decided the HTML way: a form attribute names the owner (a
 * target that is missing or not a form leaves the control with no owner),
 * otherwise the nearest enclosing form. The scanner, the deterministic
 * checks, and the studio runtime all resolve ownership through this one
 * rule, and the exported embed mirrors it, so a control counts for exactly
 * one form and a button outside its form still acts on that form.
 */

const CONTROL_SELECTOR = "input, select, textarea, button";

export function formOwner(control: Element): Element | null {
  const reference = control.getAttribute("form");
  if (reference !== null) {
    const target = control.ownerDocument.getElementById(reference);
    return target?.tagName === "FORM" ? target : null;
  }
  return control.closest("form");
}

/**
 * A disabled control is neither submitted nor activatable. A disabled
 * fieldset disables its descendants except those inside its first legend.
 */
export function isDisabledControl(control: Element): boolean {
  if (control.hasAttribute("disabled")) return true;
  let fieldset = control.parentElement?.closest("fieldset[disabled]") ?? null;
  while (fieldset) {
    const legend = [...fieldset.children].find((child) => child.tagName === "LEGEND");
    if (!legend?.contains(control)) return true;
    fieldset = fieldset.parentElement?.closest("fieldset[disabled]") ?? null;
  }
  return false;
}

/**
 * Enabled controls a form owns, in document order. Image buttons are
 * included even though form.elements omits them; disabled controls are
 * left out entirely, so they are never parameters, actions, or blockers.
 */
export function formControls(form: Element, document: Document): Element[] {
  return [...document.querySelectorAll(CONTROL_SELECTOR)].filter(
    (control) => formOwner(control) === form && !isDisabledControl(control),
  );
}
