import { BOOKING_TOOL_CONTRACTS } from "../src/webmcp/bookingToolContracts";
import {
  CONTRACT_LINT_RULES,
  lintToolContract,
  lintToolContracts,
  type LintableToolContract,
} from "../src/validation/lintToolContracts";

const searchContract = BOOKING_TOOL_CONTRACTS[0];

function contractWith(overrides: Partial<LintableToolContract>): LintableToolContract {
  return { ...searchContract, ...overrides } as LintableToolContract;
}

function failingRuleIds(contract: LintableToolContract): string[] {
  return lintToolContract(contract)
    .filter((finding) => finding.status === "failed")
    .map((finding) => finding.ruleId);
}

describe("tool contract lint", () => {
  it("declares a stable rule inventory", () => {
    expect(CONTRACT_LINT_RULES.map((rule) => rule.id)).toEqual([
      "name-pattern",
      "name-budget",
      "description-budget",
      "parameter-descriptions",
      "schema-serializable",
      "schema-strict",
      "name-safety-consistency",
    ]);
  });

  it("passes every shipped booking contract", () => {
    const report = lintToolContracts(BOOKING_TOOL_CONTRACTS);

    expect(report.total).toBe(CONTRACT_LINT_RULES.length * BOOKING_TOOL_CONTRACTS.length);
    expect(report.passed).toBe(report.total);
    expect(report.findings.every((finding) => finding.status === "passed")).toBe(true);
  });

  it("rejects names outside the registration pattern or over the 30 character budget", () => {
    expect(failingRuleIds(contractWith({ name: "search services" as never }))).toContain(
      "name-pattern",
    );
    expect(
      failingRuleIds(contractWith({ name: "search_services_across_every_catalog_entry" as never })),
    ).toContain("name-budget");
  });

  it("requires a description between 10 and 500 characters", () => {
    expect(failingRuleIds(contractWith({ description: "Search." }))).toContain(
      "description-budget",
    );
    expect(failingRuleIds(contractWith({ description: "x".repeat(501) }))).toContain(
      "description-budget",
    );
  });

  it("requires every parameter to carry a description of at most 150 characters", () => {
    const missing = contractWith({
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        additionalProperties: false,
      },
    });
    const tooLong = contractWith({
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "y".repeat(151) } },
        additionalProperties: false,
      },
    });

    expect(failingRuleIds(missing)).toContain("parameter-descriptions");
    expect(failingRuleIds(tooLong)).toContain("parameter-descriptions");
  });

  it("rejects schemas that are not JSON-serializable or that permit undeclared properties", () => {
    const circular: Record<string, unknown> = { type: "object", properties: {} };
    circular.self = circular;

    expect(
      failingRuleIds(contractWith({ inputSchema: circular as never })),
    ).toContain("schema-serializable");
    expect(
      failingRuleIds(
        contractWith({
          inputSchema: {
            type: "object",
            properties: { query: { type: "string", description: "Free text." } },
            additionalProperties: true as never,
          },
        }),
      ),
    ).toContain("schema-strict");
  });

  it("rejects a write-sounding name that claims to be read-only", () => {
    const misleading = contractWith({
      name: "submit_booking" as never,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    });

    expect(failingRuleIds(misleading)).toContain("name-safety-consistency");
  });

  it("returns immutable findings with the exact rule count per contract", () => {
    const findings = lintToolContract(searchContract);

    expect(findings).toHaveLength(CONTRACT_LINT_RULES.length);
    expect(Object.isFrozen(findings)).toBe(true);
    expect(findings.every((finding) => Object.isFrozen(finding))).toBe(true);
  });
});
