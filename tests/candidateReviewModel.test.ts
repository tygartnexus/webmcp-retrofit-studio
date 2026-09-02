import { buildCandidateReviewModel } from "../src/data/candidates";
import { BOOKING_TOOL_NAMES } from "../src/domain/booking";
import { inferCapabilities } from "../src/discovery/inferCapabilities";
import { scanOwnedFixture } from "../src/discovery/scanOwnedFixture";

describe("candidate review evidence model", () => {
  it("derives every displayed capability and evidence pointer from the current scan and proposal", async () => {
    const scan = await scanOwnedFixture();
    const proposal = await inferCapabilities(scan);
    const model = buildCandidateReviewModel(scan, proposal);
    const observedSelectors = new Set(
      scan.observations
        .filter((observation) => observation.present)
        .map((observation) => observation.selector),
    );

    expect(model.candidates.map((candidate) => candidate.name)).toEqual([
      ...BOOKING_TOOL_NAMES,
      "finalize_booking",
    ]);
    expect(model.candidates.at(-1)).toMatchObject({
      name: "finalize_booking",
      state: "not-exposed",
    });

    for (const candidate of model.candidates) {
      expect(candidate.evidenceSelectors.length).toBeGreaterThan(0);
      for (const selector of candidate.evidenceSelectors) {
        expect(observedSelectors).toContain(selector);
      }
    }

    expect(model.quality.evidence).toEqual(
      scan.observations
        .filter((observation) => observation.present)
        .map((observation) => `fixture:${scan.fixtureId}${observation.selector}`),
    );
    expect(JSON.stringify(model)).not.toMatch(
      /#service-select|#date-time-fields|#confirm-action|Service cards/,
    );
  });
});
