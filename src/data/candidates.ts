import type { CapabilityProposal } from "../discovery/inferCapabilities";
import type {
  EvidenceObservation,
  EvidenceObservationId,
  OwnedFixtureScanResult,
} from "../discovery/scanOwnedFixture";
import type { ResponseQualityEnvelope } from "../quality/responseQuality";

export type CandidateState = "read-only" | "needs-review" | "not-exposed";

export interface CapabilityCandidate {
  name: string;
  summary: string;
  evidence: string;
  evidenceSelectors: readonly string[];
  state: CandidateState;
  selected?: boolean;
}

export interface CandidateReviewModel {
  candidates: readonly CapabilityCandidate[];
  quality: ResponseQualityEnvelope;
}

function requirePresentEvidence(
  observations: ReadonlyMap<EvidenceObservationId, EvidenceObservation>,
  evidenceIds: readonly EvidenceObservationId[],
): EvidenceObservation[] {
  return evidenceIds.map((evidenceId) => {
    const observation = observations.get(evidenceId);
    if (!observation?.present) {
      throw new Error(`Candidate evidence is absent: ${evidenceId}`);
    }
    return observation;
  });
}

export function buildCandidateReviewModel(
  scan: OwnedFixtureScanResult,
  proposal: CapabilityProposal,
): CandidateReviewModel {
  if (proposal.scanHash !== scan.scanHash) {
    throw new Error("Candidate proposal is not bound to the current scan");
  }

  const observations = new Map(
    scan.observations.map((observation) => [observation.id, observation]),
  );
  const proposedCandidates = proposal.capabilities.map((capability) => {
    const evidence = requirePresentEvidence(observations, capability.evidenceIds);
    const evidenceSelectors = evidence.map((observation) => observation.selector);
    const state: CandidateState = capability.annotations.readOnlyHint
      ? "read-only"
      : "needs-review";
    return {
      name: capability.name,
      summary: capability.description,
      evidence: `Selectors: ${evidenceSelectors.join(", ")}`,
      evidenceSelectors,
      state,
      selected: state === "needs-review",
    } satisfies CapabilityCandidate;
  });
  const confirmationEvidence = requirePresentEvidence(observations, [
    "human-confirmation-control",
  ]);
  const confirmationSelectors = confirmationEvidence.map(
    (observation) => observation.selector,
  );
  const candidates: readonly CapabilityCandidate[] = [
    ...proposedCandidates,
    {
      name: proposal.excludedCapabilityNames[0],
      summary:
        "Final submission remains on the visible interface and outside the WebMCP tool surface.",
      evidence: `Selector: ${confirmationSelectors[0]}`,
      evidenceSelectors: confirmationSelectors,
      state: "not-exposed",
    },
  ];
  const presentObservations = scan.observations.filter(
    (observation) => observation.present,
  );
  const quality: ResponseQualityEnvelope = {
    facts: [
      `The owner-authorized fixture scan observed ${presentObservations.length} required controls.`,
      `The version-bound proposal contains exactly ${proposal.capabilities.length} WebMCP tools and excludes ${proposal.excludedCapabilityNames[0]}.`,
      "The state-changing proposal stages a reversible synthetic draft; it does not finalize a booking.",
    ],
    evidence: presentObservations.map(
      (observation) => `fixture:${scan.fixtureId}${observation.selector}`,
    ),
    assumptions: [
      "Visible booking labels represent the intended synthetic fixture flow.",
      "A staged draft is useful before visible-interface confirmation.",
    ],
    unknowns: [
      "A real production site's authorization, inventory, billing, and consent rules are not modeled.",
    ],
    confidence: {
      score: 0.82,
      rationale: `All ${presentObservations.length} required fixture selectors resolve and the proposal is scan-hash bound.`,
    },
    risks: [
      "An agent or user could mistake a staged draft for a completed booking.",
    ],
    counterarguments: [
      "The ordinary form is already usable without an agent.",
      "Adding a write tool increases the state-management surface.",
    ],
    recommendation: {
      text: "Approve reversible draft staging for the locked Validate runtime only.",
      tradeoffs: [
        "This improves agent efficiency while keeping final completion on the visible interface.",
      ],
    },
    changeConditions: [
      "Evidence of a reviewed, current consent flow could justify revisiting finalization in a separate proposal.",
    ],
  };

  return { candidates, quality };
}
