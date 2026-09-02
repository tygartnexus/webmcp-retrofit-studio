import { PROMPT_TEMPLATES, type VersionedPromptTemplate } from "./promptTemplates";
import type { QualitySectionKey, ResponseModeId } from "./responseQuality";

export interface ReviewModeConfiguration {
  prompt: VersionedPromptTemplate;
  emphasis: string;
  sectionOrder: readonly QualitySectionKey[];
}

export const REVIEW_MODE_CONFIG = Object.freeze({
  standard: {
    prompt: PROMPT_TEMPLATES.antiHallucination,
    emphasis:
      "Lead with the supportable answer, then make its evidence boundary and tradeoffs easy to inspect.",
    sectionOrder: [
      "facts",
      "recommendation",
      "evidence",
      "assumptions",
      "unknowns",
      "confidence",
      "risks",
      "counterarguments",
      "changeConditions",
    ],
  },
  accuracy: {
    prompt: PROMPT_TEMPLATES.evidenceBasedRecommendation,
    emphasis:
      "Lead with verified observations and citations before inference, risk, and recommendation.",
    sectionOrder: [
      "facts",
      "evidence",
      "assumptions",
      "unknowns",
      "confidence",
      "risks",
      "counterarguments",
      "recommendation",
      "changeConditions",
    ],
  },
  "red-team": {
    prompt: PROMPT_TEMPLATES.redTeamReview,
    emphasis:
      "Lead with credible failure modes, missing proof, and the strongest challenge to the proposal.",
    sectionOrder: [
      "risks",
      "unknowns",
      "counterarguments",
      "facts",
      "evidence",
      "assumptions",
      "confidence",
      "recommendation",
      "changeConditions",
    ],
  },
  ceo: {
    prompt: PROMPT_TEMPLATES.ceoRealityCheck,
    emphasis:
      "Lead with the decision, tradeoffs, stop conditions, and the evidence needed to justify more investment.",
    sectionOrder: [
      "recommendation",
      "changeConditions",
      "risks",
      "counterarguments",
      "facts",
      "evidence",
      "assumptions",
      "unknowns",
      "confidence",
    ],
  },
  technical: {
    prompt: PROMPT_TEMPLATES.technicalArchitectureReview,
    emphasis:
      "Lead with implemented behavior and test evidence, then surface failure handling and architecture risk.",
    sectionOrder: [
      "facts",
      "evidence",
      "risks",
      "unknowns",
      "assumptions",
      "counterarguments",
      "confidence",
      "recommendation",
      "changeConditions",
    ],
  },
  "legal-risk": {
    prompt: PROMPT_TEMPLATES.legalComplianceReview,
    emphasis:
      "Lead with authorization, consent, source, and jurisdiction risks without overstating a legal conclusion.",
    sectionOrder: [
      "risks",
      "unknowns",
      "evidence",
      "facts",
      "assumptions",
      "counterarguments",
      "confidence",
      "recommendation",
      "changeConditions",
    ],
  },
} as const satisfies Readonly<Record<ResponseModeId, ReviewModeConfiguration>>);

export function getReviewModeConfiguration(
  mode: ResponseModeId,
): ReviewModeConfiguration {
  return REVIEW_MODE_CONFIG[mode];
}
