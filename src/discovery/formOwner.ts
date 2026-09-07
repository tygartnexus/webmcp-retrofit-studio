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

/** Controls a form owns, in document order. Image buttons are included even though form.elements omits them. */
export function formControls(form: Element, document: Document): Element[] {
  return [...document.querySelectorAll(CONTROL_SELECTOR)].filter((control) => formOwner(control) === form);
}
