import {
  MAX_QUALITY_LIST_ITEMS,
  MAX_QUALITY_TEXT_LENGTH,
  QUALITY_SECTION_KEYS,
  RESPONSE_MODES,
  validateQualityEnvelope,
  type ResponseQualityEnvelope,
} from "../src/quality/responseQuality";
import { PROMPT_TEMPLATES } from "../src/quality/promptTemplates";

const completeEnvelope: ResponseQualityEnvelope = {
  facts: ["The fixture exposes a visible service-booking form."],
  evidence: ["fixture:/booking#service-form"],
  assumptions: ["The visible labels represent the intended user goals."],
  unknowns: ["Real-site authorization rules are not represented by the fixture."],
  confidence: {
    score: 0.88,
    rationale: "Every candidate maps to deterministic fixture evidence.",
  },
  risks: ["A generated write tool could be mistaken for final submission."],
  counterarguments: ["Manual browser interaction can already complete the form."],
  recommendation: {
    text: "Expose only search, availability, and reversible draft staging.",
    tradeoffs: ["The agent cannot complete the entire booking autonomously."],
  },
  changeConditions: ["A reviewed consent design could change the finalization boundary."],
};

describe("AI response quality framework", () => {
  it("defines all six selectable output modes", () => {
    expect(RESPONSE_MODES.map((mode) => mode.id)).toEqual([
      "standard",
      "accuracy",
      "red-team",
      "ceo",
      "technical",
      "legal-risk",
    ]);
  });

  it("requires every truth and decision section", () => {
    expect(QUALITY_SECTION_KEYS).toEqual([
      "facts",
      "evidence",
      "assumptions",
      "unknowns",
      "confidence",
      "risks",
      "counterarguments",
      "recommendation",
      "changeConditions",
    ]);
    expect(validateQualityEnvelope(completeEnvelope, "accuracy")).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("acknowledges missing evidence instead of silently implying support", () => {
    const result = validateQualityEnvelope(
      { ...completeEnvelope, evidence: [] },
      "accuracy",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/evidence.*missing/i);
  });

  it("requires a bounded confidence score with rationale", () => {
    const result = validateQualityEnvelope(
      {
        ...completeEnvelope,
        confidence: { score: 1.4, rationale: "" },
      },
      "technical",
    );

    expect(result.errors.join(" ")).toMatch(/confidence/i);
    expect(result.errors.join(" ")).toMatch(/rationale/i);
  });

  it("requires recommendation tradeoffs and change conditions", () => {
    const result = validateQualityEnvelope(
      {
        ...completeEnvelope,
        recommendation: { ...completeEnvelope.recommendation, tradeoffs: [] },
        changeConditions: [],
      },
      "ceo",
    );

    expect(result.errors.join(" ")).toMatch(/tradeoff/i);
    expect(result.errors.join(" ")).toMatch(/change/i);
  });

  it("makes red-team risks and counterarguments substantive", () => {
    const result = validateQualityEnvelope(
      { ...completeEnvelope, risks: [], counterarguments: [] },
      "red-team",
    );

    expect(result.errors.join(" ")).toMatch(/risk/i);
    expect(result.errors.join(" ")).toMatch(/counterargument/i);
  });

  it("rejects inherited, accessor-backed, and undeclared fields without invoking getters", () => {
    const inherited = Object.create(completeEnvelope) as unknown;
    expect(validateQualityEnvelope(inherited, "accuracy").valid).toBe(false);

    let getterReads = 0;
    const accessorBacked = { ...completeEnvelope } as Record<string, unknown>;
    Object.defineProperty(accessorBacked, "facts", {
      enumerable: true,
      get() {
        getterReads += 1;
        return completeEnvelope.facts;
      },
    });
    const accessorResult = validateQualityEnvelope(accessorBacked, "accuracy");
    expect(accessorResult.valid).toBe(false);
    expect(accessorResult.errors.join(" ")).toMatch(/data property/i);
    expect(getterReads).toBe(0);

    const extraField = validateQualityEnvelope(
      { ...completeEnvelope, unsupportedVerdict: "ship it" },
      "accuracy",
    );
    expect(extraField.valid).toBe(false);
    expect(extraField.errors.join(" ")).toMatch(/unsupportedVerdict/i);

    const nestedExtra = validateQualityEnvelope(
      {
        ...completeEnvelope,
        confidence: { ...completeEnvelope.confidence, unsupported: true },
      },
      "accuracy",
    );
    expect(nestedExtra.valid).toBe(false);
    expect(nestedExtra.errors.join(" ")).toMatch(/unsupported/i);
  });

  it("bounds model-produced text and list sizes", () => {
    const oversizedText = validateQualityEnvelope(
      {
        ...completeEnvelope,
        facts: ["x".repeat(MAX_QUALITY_TEXT_LENGTH + 1)],
      },
      "accuracy",
    );
    expect(oversizedText.valid).toBe(false);
    expect(oversizedText.errors.join(" ")).toMatch(/at most/i);

    const oversizedList = validateQualityEnvelope(
      {
        ...completeEnvelope,
        risks: Array.from(
          { length: MAX_QUALITY_LIST_ITEMS + 1 },
          (_, index) => `Risk ${index + 1}`,
        ),
      },
      "red-team",
    );
    expect(oversizedList.valid).toBe(false);
    expect(oversizedList.errors.join(" ")).toMatch(/items/i);
  });

  it("centralizes eight versioned prompt templates without placeholders", () => {
    expect(Object.keys(PROMPT_TEMPLATES)).toHaveLength(8);
    expect(Object.values(PROMPT_TEMPLATES).every((template) => template.version)).toBe(
      true,
    );
    expect(JSON.stringify(PROMPT_TEMPLATES)).not.toMatch(/TODO|TBD|<[^>]+>/i);
  });
});
