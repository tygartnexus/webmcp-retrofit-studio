import type { CapabilityKind, FieldObservation, RiskClass } from "./scanHtml";
import {
  CREDENTIAL_ACTION_PATTERN,
  FINALIZE_PATTERN,
  NEUTRAL_ACTION_PATTERN,
  READ_ACTION_PATTERN,
  SEARCH_PATTERN,
} from "./scanVocabulary";

export interface Classification {
  kind: CapabilityKind;
  riskClass: RiskClass;
}

/**
 * Credential and finalize outrank search, and search outranks write. Risk is
 * judged against every name the action carries (accessible name, aria-label,
 * content, rendered text), so an ARIA override cannot make a visible
 * "Delete account" look like a write; a name that is only a neutral word
 * ("Continue", "Next step") carries no risk signal of its own.
 */
export function classifyForm(
  method: "get" | "post",
  actionLabel: string,
  form: Element,
  fields: readonly FieldObservation[],
  riskLabels: readonly string[] = [actionLabel],
): Classification {
  const hasCredential = fields.some((field) => field.excluded === "credential");
  const hasPayment = fields.some((field) => field.excluded === "payment-credential");
  const roleSearch = form.getAttribute("role") === "search";
  const hasSearchInput = fields.some((field) => field.inputType === "search");
  const labels = [actionLabel, ...fields.map((field) => field.label ?? "")].join(" ");
  const neutral = NEUTRAL_ACTION_PATTERN.test(actionLabel.trim());
  const risky = riskLabels.filter((label) => !NEUTRAL_ACTION_PATTERN.test(label.trim()));
  if (hasCredential || risky.some((label) => CREDENTIAL_ACTION_PATTERN.test(label))) {
    return { kind: "form", riskClass: "credential" };
  }
  if (hasPayment || risky.some((label) => FINALIZE_PATTERN.test(label))) return { kind: "form", riskClass: "finalize" };
  const readSignal =
    neutral || roleSearch || hasSearchInput || SEARCH_PATTERN.test(labels) || READ_ACTION_PATTERN.test(actionLabel.trim());
  if (method === "get" && readSignal) return { kind: "search", riskClass: "read" };
  // A GET form with no read signal is still an action; stage it rather than assume it is safe.
  return { kind: "form", riskClass: "write" };
}
