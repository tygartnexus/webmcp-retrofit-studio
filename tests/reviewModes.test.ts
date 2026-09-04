import {
  REVIEW_MODE_CONFIG,
  getReviewModeConfiguration,
} from "../src/quality/reviewModes";
import { RESPONSE_MODES } from "../src/quality/responseQuality";

describe("review mode routing", () => {
  it("routes every response mode to a versioned prompt and complete section order", () => {
    expect(Object.keys(REVIEW_MODE_CONFIG)).toEqual(
      RESPONSE_MODES.map((mode) => mode.id),
    );

    for (const mode of RESPONSE_MODES) {
      const configuration = getReviewModeConfiguration(mode.id);
      expect(configuration.prompt.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(new Set(configuration.sectionOrder).size).toBe(9);
      expect(configuration.emphasis.length).toBeGreaterThan(20);
    }
  });

  it("makes hostile and executive modes lead with different decision evidence", () => {
    expect(getReviewModeConfiguration("red-team").sectionOrder[0]).toBe("risks");
    expect(getReviewModeConfiguration("ceo").sectionOrder[0]).toBe(
      "recommendation",
    );
    expect(getReviewModeConfiguration("technical").prompt.id).toBe(
      "technicalArchitectureReview",
    );
    expect(getReviewModeConfiguration("legal-risk").prompt.id).toBe(
      "legalComplianceReview",
    );
  });
});

describe("prompt template coverage", () => {
  it("routes every versioned template through at least one review mode", async () => {
    const { PROMPT_TEMPLATE_IDS } = await import("../src/quality/promptTemplates");
    const routed = new Set<string>();
    for (const mode of RESPONSE_MODES) {
      const config = getReviewModeConfiguration(mode.id);
      routed.add(config.prompt.id);
      if (config.supplementaryPrompt) routed.add(config.supplementaryPrompt.id);
    }

    for (const id of PROMPT_TEMPLATE_IDS) {
      expect(routed.has(id)).toBe(true);
    }
  });

  it("pairs bias detection with red team and the decision matrix with the CEO mode", async () => {
    expect(getReviewModeConfiguration("red-team").supplementaryPrompt?.id).toBe("biasDetection");
    expect(getReviewModeConfiguration("ceo").supplementaryPrompt?.id).toBe("executiveDecisionMatrix");
  });
});
