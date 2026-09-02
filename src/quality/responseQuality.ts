/**
 * The stable response contract used by every review mode.
 *
 * Keep the section keys centralized so UI renderers, prompt builders, and
 * validators cannot silently disagree about which truth-bearing fields exist.
 */
export const QUALITY_SECTION_KEYS = [
  "facts",
  "evidence",
  "assumptions",
  "unknowns",
  "confidence",
  "risks",
  "counterarguments",
  "recommendation",
  "changeConditions",
] as const;

export type QualitySectionKey = (typeof QUALITY_SECTION_KEYS)[number];

/** Defensive limits for untrusted model or network JSON. */
export const MAX_QUALITY_TEXT_LENGTH = 2_000;
export const MAX_QUALITY_LIST_ITEMS = 20;

export const RESPONSE_MODES = [
  {
    id: "standard",
    label: "Standard Answer",
    shortLabel: "Standard",
    description: "A concise answer that still exposes its evidence boundary.",
  },
  {
    id: "accuracy",
    label: "Accuracy Mode",
    shortLabel: "Accuracy",
    description: "An evidence-led answer with every quality section visible.",
  },
  {
    id: "red-team",
    label: "Red Team Mode",
    shortLabel: "Red Team",
    description: "A hostile review that leads with failure modes and weak claims.",
  },
  {
    id: "ceo",
    label: "CEO Review Mode",
    shortLabel: "CEO",
    description: "An executive decision view focused on options and tradeoffs.",
  },
  {
    id: "technical",
    label: "Technical Review Mode",
    shortLabel: "Technical",
    description: "An architecture and operations view grounded in verified behavior.",
  },
  {
    id: "legal-risk",
    label: "Legal Risk Review Mode",
    shortLabel: "Legal Risk",
    description: "A non-attorney issue-spotting view with explicit source limits.",
  },
] as const;

export type ResponseMode = (typeof RESPONSE_MODES)[number];
export type ResponseModeId = ResponseMode["id"];

export function isResponseModeId(value: string): value is ResponseModeId {
  return RESPONSE_MODES.some((mode) => mode.id === value);
}

export interface ConfidenceAssessment {
  /** A bounded probability-like assessment from 0 through 1. */
  score: number;
  /** Why this score is justified by the available evidence and unknowns. */
  rationale: string;
}

export interface RecommendationAssessment {
  text: string;
  tradeoffs: string[];
}

export interface ResponseQualityEnvelope {
  facts: string[];
  evidence: string[];
  assumptions: string[];
  unknowns: string[];
  confidence: ConfidenceAssessment;
  risks: string[];
  counterarguments: string[];
  recommendation: RecommendationAssessment;
  changeConditions: string[];
}

export interface QualityValidationResult {
  valid: boolean;
  errors: string[];
}

const ARRAY_SECTION_LABELS = {
  facts: "Facts",
  evidence: "Evidence",
  assumptions: "Assumptions",
  unknowns: "Unknowns",
  risks: "Risks",
  counterarguments: "Counterarguments",
  changeConditions: "What would change the recommendation",
} as const satisfies Record<
  Exclude<QualitySectionKey, "confidence" | "recommendation">,
  string
>;

const PLACEHOLDER_PATTERN =
  /\b(?:todo|tbd|fixme)\b|\{\{[^}]+\}\}|\[\[(?:[^\]]+)\]\]|<(?:insert|replace|fill|example)[^>]*>/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSubstantiveString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateText(
  value: unknown,
  label: string,
  errors: string[],
): value is string {
  if (!isSubstantiveString(value)) {
    errors.push(`${label} is required.`);
    return false;
  }

  if (value.length > MAX_QUALITY_TEXT_LENGTH) {
    errors.push(
      `${label} must contain at most ${MAX_QUALITY_TEXT_LENGTH} characters.`,
    );
    return false;
  }

  if (PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${label} contains an unresolved placeholder.`);
    return false;
  }

  return true;
}

function validateExactDataProperties(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
  errors: string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      errors.push(`${label} contains unsupported field "${String(key)}".`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      errors.push(`${label}.${key} must be an own data property.`);
    }
  }

  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${label}.${key} is missing.`);
    }
  }
}

function readOwnDataProperty(
  value: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function validateTextList(
  value: unknown,
  label: string,
  errors: string[],
): value is string[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length === 0
  ) {
    errors.push(
      `${label} is missing. Provide an explicit statement when direct support is unavailable.`,
    );
    return false;
  }

  if (value.length > MAX_QUALITY_LIST_ITEMS) {
    errors.push(
      `${label} must contain at most ${MAX_QUALITY_LIST_ITEMS} items.`,
    );
    return false;
  }

  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(?:0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length
    ) {
      errors.push(`${label} contains unsupported array property "${String(key)}".`);
      return false;
    }
  }

  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      errors.push(`${label} item ${index + 1} must be an own data property.`);
      valid = false;
      continue;
    }
    valid = validateText(
      descriptor.value,
      `${label} item ${index + 1}`,
      errors,
    ) && valid;
  }

  return valid;
}

/**
 * Runtime validation for model-produced JSON. The input is intentionally
 * `unknown`: compile-time types cannot make an AI or network response trusted.
 */
export function validateQualityEnvelope(
  envelope: unknown,
  mode: ResponseModeId,
): QualityValidationResult {
  const errors: string[] = [];

  if (!RESPONSE_MODES.some((candidate) => candidate.id === mode)) {
    errors.push(`Response mode "${String(mode)}" is not supported.`);
  }

  if (!isPlainRecord(envelope)) {
    return {
      valid: false,
      errors: [...errors, "Response quality envelope must be a plain object."],
    };
  }

  validateExactDataProperties(
    envelope,
    QUALITY_SECTION_KEYS,
    "Response quality envelope",
    errors,
  );

  for (const [key, label] of Object.entries(ARRAY_SECTION_LABELS) as Array<
    [keyof typeof ARRAY_SECTION_LABELS, string]
  >) {
    validateTextList(readOwnDataProperty(envelope, key), label, errors);
  }

  const confidence = readOwnDataProperty(envelope, "confidence");
  if (!isPlainRecord(confidence)) {
    errors.push("Confidence is missing.");
  } else {
    validateExactDataProperties(
      confidence,
      ["score", "rationale"],
      "Confidence",
      errors,
    );
    const score = readOwnDataProperty(confidence, "score");
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    ) {
      errors.push("Confidence score must be a finite number from 0 through 1.");
    }
    validateText(
      readOwnDataProperty(confidence, "rationale"),
      "Confidence rationale",
      errors,
    );
  }

  const recommendation = readOwnDataProperty(envelope, "recommendation");
  if (!isPlainRecord(recommendation)) {
    errors.push("Recommendation is missing.");
  } else {
    validateExactDataProperties(
      recommendation,
      ["text", "tradeoffs"],
      "Recommendation",
      errors,
    );
    validateText(
      readOwnDataProperty(recommendation, "text"),
      "Recommendation text",
      errors,
    );
    validateTextList(
      readOwnDataProperty(recommendation, "tradeoffs"),
      "Recommendation tradeoffs",
      errors,
    );
  }

  return { valid: errors.length === 0, errors };
}
