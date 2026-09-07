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
  /** The name or field that decided a credential or finalize class, so the owner can see why. */
  evidence?: string;
}

/**
 * Credential and finalize outrank search, and search outranks write. Risk is
 * judged against every name the action carries (accessible name, aria-label,
 * content, rendered text), so an ARIA override cannot make a visible
 * "Delete account" look like a write; a name that is only a neutral word
 * ("Continue", "Next step") carries no risk signal of its own.
 */
/** The first name that would exclude an action: a credential or finalize match that is not a neutral phrase. */
export function destructiveName(names: readonly string[]): string | undefined {
  return names.find(
    (name) => !NEUTRAL_ACTION_PATTERN.test(name.trim()) && (CREDENTIAL_ACTION_PATTERN.test(name) || FINALIZE_PATTERN.test(name)),
  );
}

function fieldName(field: FieldObservation | undefined): string | undefined {
  return field ? `${field.label ?? field.name} field` : undefined;
}

export function classifyForm(
  method: "get" | "post",
  actionLabel: string,
  form: Element,
  fields: readonly FieldObservation[],
  riskLabels: readonly string[] = [actionLabel],
): Classification {
  const credentialField = fields.find((field) => field.excluded === "credential");
  const paymentField = fields.find((field) => field.excluded === "payment-credential");
  const roleSearch = form.getAttribute("role") === "search";
  const hasSearchInput = fields.some((field) => field.inputType === "search");
  const labels = [actionLabel, ...fields.map((field) => field.label ?? "")].join(" ");
  const neutral = NEUTRAL_ACTION_PATTERN.test(actionLabel.trim());
  const risky = riskLabels.filter((label) => !NEUTRAL_ACTION_PATTERN.test(label.trim()));
  const credentialHit = risky.find((label) => CREDENTIAL_ACTION_PATTERN.test(label));
  if (credentialField || credentialHit) {
    return { kind: "form", riskClass: "credential", evidence: credentialHit ?? fieldName(credentialField) };
  }
  const finalizeHit = risky.find((label) => FINALIZE_PATTERN.test(label));
  if (paymentField || finalizeHit) {
    return { kind: "form", riskClass: "finalize", evidence: finalizeHit ?? fieldName(paymentField) };
  }
  const readSignal =
    neutral || roleSearch || hasSearchInput || SEARCH_PATTERN.test(labels) || READ_ACTION_PATTERN.test(actionLabel.trim());
  if (method === "get" && readSignal) return { kind: "search", riskClass: "read" };
  // A GET form with no read signal is still an action; stage it rather than assume it is safe.
  return { kind: "form", riskClass: "write" };
}
