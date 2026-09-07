import type { BookingToolContract } from "../webmcp/bookingToolContracts";

/**
 * Static contract lint. These rules run without registering or executing a
 * tool. They encode the registration contract the reference polyfill
 * enforces and the character budgets from Chrome's WebMCP security guidance.
 * They are deliberately separate from the eight runtime checks so the runtime
 * inventory stays stable.
 */

/** Any tool contract shape the lint can check; not limited to the booking tools. */
export interface LintableToolContract {
  name: string;
  description: string;
  inputSchema: BookingToolContract["inputSchema"];
  annotations: BookingToolContract["annotations"];
}

export type ContractLintRuleId =
  | "name-pattern"
  | "name-budget"
  | "description-budget"
  | "parameter-descriptions"
  | "schema-serializable"
  | "schema-strict"
  | "name-safety-consistency";

export interface ContractLintRule {
  id: ContractLintRuleId;
  label: string;
  source: string;
}

export interface ContractLintFinding {
  ruleId: ContractLintRuleId;
  toolName: string;
  status: "passed" | "failed";
  detail: string;
}

export interface ContractLintReport {
  findings: readonly ContractLintFinding[];
  passed: number;
  total: number;
}

const REGISTRATION_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const NAME_BUDGET = 30;
const DESCRIPTION_MIN = 10;
/** Chrome's guidance; shared with inference so descriptions are clipped to what the lint accepts. */
export const DESCRIPTION_BUDGET = 500;
export const PARAMETER_DESCRIPTION_BUDGET = 150;
/** Name words that read as writes; read-only tools must not carry them. */
export const WRITE_NAME_WORDS = Object.freeze([
  "create", "update", "delete", "remove", "submit", "send", "post", "book", "register", "finalize", "confirm", "pay",
  "purchase", "cancel", "deletion", "cancellation", "removal", "termination",
]);
const WRITE_NAME_PATTERN = new RegExp(`(^|_)(${WRITE_NAME_WORDS.join("|")})(_|$)`, "i");

export const CONTRACT_LINT_RULES: readonly ContractLintRule[] = Object.freeze([
  Object.freeze({
    id: "name-pattern",
    label: "Name matches the registration pattern",
    source: "reference polyfill: ^[A-Za-z0-9_.-]{1,128}$",
  }),
  Object.freeze({
    id: "name-budget",
    label: `Name within ${NAME_BUDGET} characters`,
    source: "Chrome secure-tools guidance",
  }),
  Object.freeze({
    id: "description-budget",
    label: `Description between ${DESCRIPTION_MIN} and ${DESCRIPTION_BUDGET} characters`,
    source: "Chrome secure-tools guidance",
  }),
  Object.freeze({
    id: "parameter-descriptions",
    label: `Every parameter described within ${PARAMETER_DESCRIPTION_BUDGET} characters`,
    source: "Chrome secure-tools guidance",
  }),
  Object.freeze({
    id: "schema-serializable",
    label: "Input schema is JSON-serializable",
    source: "reference polyfill registration check",
  }),
  Object.freeze({
    id: "schema-strict",
    label: "Input schema rejects undeclared properties",
    source: "project contract rule",
  }),
  Object.freeze({
    id: "name-safety-consistency",
    label: "Write-sounding names are not marked read-only",
    source: "webmcp-core safety/possible-write heuristic, reimplemented",
  }),
] as const);

type RuleCheck = (contract: LintableToolContract) => string | null;

function checkNamePattern(contract: LintableToolContract): string | null {
  return REGISTRATION_NAME_PATTERN.test(contract.name)
    ? null
    : `"${contract.name}" is not a valid registration name`;
}

function checkNameBudget(contract: LintableToolContract): string | null {
  return contract.name.length <= NAME_BUDGET
    ? null
    : `name is ${contract.name.length} characters; budget is ${NAME_BUDGET}`;
}

function checkDescriptionBudget(contract: LintableToolContract): string | null {
  const length = contract.description.trim().length;
  if (length < DESCRIPTION_MIN) return `description is ${length} characters; minimum is ${DESCRIPTION_MIN}`;
  if (length > DESCRIPTION_BUDGET) return `description is ${length} characters; budget is ${DESCRIPTION_BUDGET}`;
  return null;
}

function checkParameterDescriptions(contract: LintableToolContract): string | null {
  const properties = contract.inputSchema.properties ?? {};
  for (const [key, schema] of Object.entries(properties)) {
    const description = (schema as { description?: unknown }).description;
    if (typeof description !== "string" || description.trim().length === 0) {
      return `parameter "${key}" has no description`;
    }
    if (description.length > PARAMETER_DESCRIPTION_BUDGET) {
      return `parameter "${key}" description is ${description.length} characters; budget is ${PARAMETER_DESCRIPTION_BUDGET}`;
    }
  }
  return null;
}

function checkSchemaSerializable(contract: LintableToolContract): string | null {
  try {
    const roundTrip = JSON.parse(JSON.stringify(contract.inputSchema)) as unknown;
    return typeof roundTrip === "object" && roundTrip !== null
      ? null
      : "input schema did not survive a JSON round trip";
  } catch (error) {
    return error instanceof Error ? error.message : "input schema is not JSON-serializable";
  }
}

function checkSchemaStrict(contract: LintableToolContract): string | null {
  return contract.inputSchema.additionalProperties === false
    ? null
    : "input schema must set additionalProperties to false";
}

function checkNameSafetyConsistency(contract: LintableToolContract): string | null {
  const soundsLikeWrite = WRITE_NAME_PATTERN.test(contract.name);
  return soundsLikeWrite && contract.annotations.readOnlyHint
    ? `"${contract.name}" sounds like a write but is annotated read-only`
    : null;
}

const RULE_CHECKS: Readonly<Record<ContractLintRuleId, RuleCheck>> = Object.freeze({
  "name-pattern": checkNamePattern,
  "name-budget": checkNameBudget,
  "description-budget": checkDescriptionBudget,
  "parameter-descriptions": checkParameterDescriptions,
  "schema-serializable": checkSchemaSerializable,
  "schema-strict": checkSchemaStrict,
  "name-safety-consistency": checkNameSafetyConsistency,
});

export function lintToolContract(
  contract: LintableToolContract,
): readonly ContractLintFinding[] {
  const findings = CONTRACT_LINT_RULES.map((rule) => {
    const failure = RULE_CHECKS[rule.id](contract);
    return Object.freeze({
      ruleId: rule.id,
      toolName: contract.name,
      status: failure === null ? ("passed" as const) : ("failed" as const),
      detail: failure ?? rule.label,
    });
  });
  return Object.freeze(findings);
}

export function lintToolContracts(
  contracts: readonly LintableToolContract[],
): ContractLintReport {
  const findings = Object.freeze(contracts.flatMap((contract) => lintToolContract(contract)));
  return Object.freeze({
    findings,
    passed: findings.filter((finding) => finding.status === "passed").length,
    total: findings.length,
  });
}
