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
