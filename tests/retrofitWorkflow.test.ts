import { BOOKING_TOOL_NAMES } from "../src/domain/booking";
import {
  approveCapabilities,
  createRetrofitPreview,
  createRetrofitWorkflow,
  recordExportReceipt,
  recordValidation,
  rejectCapabilities,
  rescanOwnedFixture,
} from "../src/workflow/retrofitWorkflow";
import {
  DETERMINISTIC_CHECKS,
  type DeterministicCheckResult,
} from "../src/validation/runDeterministicChecks";

function validationResult(passed: number = DETERMINISTIC_CHECKS.length) {
  const checks: DeterministicCheckResult[] = DETERMINISTIC_CHECKS.map(
    (check, index) => ({
      ...check,
      status: index < passed ? "passed" : "failed",
      detail: "test evidence",
    }),
  );
  return { checks, passed, total: checks.length };
}

describe("retrofit workflow", () => {
  it("moves evidence through approval, preview, validation, and export receipt", async () => {
    let state = await rescanOwnedFixture(createRetrofitWorkflow());
    state = approveCapabilities(state, BOOKING_TOOL_NAMES);
    state = createRetrofitPreview(state);
    state = recordValidation(state, validationResult());
    state = recordExportReceipt(state, {
      bundleHash: "a".repeat(64),
      proposalHash: state.proposal!.proposalHash,
    });

    expect(state.approvedToolNames).toEqual(BOOKING_TOOL_NAMES);
    expect(state.preview).toMatchObject({
      proposalHash: state.proposal?.proposalHash,
      humanConfirmationBoundary: "outside-tool-surface",
    });
    expect(state.validation?.status).toBe("passed");
    expect(state.exportReceipt?.bundleHash).toBe("a".repeat(64));
  });

  it("invalidates every downstream artifact on each rescan", async () => {
    let state = await rescanOwnedFixture(createRetrofitWorkflow());
    state = approveCapabilities(state, BOOKING_TOOL_NAMES);
    state = createRetrofitPreview(state);
    state = recordValidation(state, validationResult());
    state = recordExportReceipt(state, {
      bundleHash: "b".repeat(64),
      proposalHash: state.proposal!.proposalHash,
    });

    const rescanned = await rescanOwnedFixture(state);

    expect(rescanned.revision).toBe(state.revision + 1);
    expect(rescanned.scan).not.toBeNull();
    expect(rescanned.proposal).not.toBeNull();
    expect(rescanned.approvedToolNames).toBeNull();
    expect(rescanned.preview).toBeNull();
    expect(rescanned.validation).toBeNull();
    expect(rescanned.exportReceipt).toBeNull();
  });

  it("rejects partial approval and out-of-order transitions", async () => {
    const empty = createRetrofitWorkflow();
    expect(() => createRetrofitPreview(empty)).toThrow(/approval/i);

    const scanned = await rescanOwnedFixture(empty);
    expect(() => approveCapabilities(scanned, ["search_services"])).toThrow(
      /exact three-tool allowlist/i,
    );
    expect(() => recordValidation(scanned, validationResult())).toThrow(
      /preview/i,
    );
  });

  it("rejects capabilities without discarding the current scan or proposal", async () => {
    let state = await rescanOwnedFixture(createRetrofitWorkflow());
    state = approveCapabilities(state, BOOKING_TOOL_NAMES);
    state = createRetrofitPreview(state);
    state = recordValidation(state, validationResult());
    state = recordExportReceipt(state, {
      bundleHash: "c".repeat(64),
      proposalHash: state.proposal!.proposalHash,
    });

    const rejected = rejectCapabilities(state);

    expect(rejected.revision).toBe(state.revision);
    expect(rejected.scan).toBe(state.scan);
    expect(rejected.proposal).toBe(state.proposal);
    expect(rejected.approvedToolNames).toBeNull();
    expect(rejected.preview).toBeNull();
    expect(rejected.validation).toBeNull();
    expect(rejected.exportReceipt).toBeNull();
  });

  it("rejects duplicate, reordered, and incomplete tool approvals", async () => {
    const scanned = await rescanOwnedFixture(createRetrofitWorkflow());
    expect(() =>
      approveCapabilities(scanned, [
        "search_services",
        "stage_booking",
        "get_availability",
      ]),
    ).toThrow(/exact three-tool allowlist/i);
    expect(() =>
      approveCapabilities(
        scanned,
        [
          "search_services",
          "get_availability",
          "stage_booking",
          "stage_booking",
        ] as unknown as typeof BOOKING_TOOL_NAMES,
      ),
    ).toThrow(/exact three-tool allowlist/i);
  });

  it("binds validation to the exact eight-check inventory", async () => {
    let state = await rescanOwnedFixture(createRetrofitWorkflow());
    state = approveCapabilities(state, BOOKING_TOOL_NAMES);
    state = createRetrofitPreview(state);

    expect(() =>
      recordValidation(state, {
        checks: [
          {
            ...DETERMINISTIC_CHECKS[0],
            status: "passed",
            detail: "insufficient evidence",
          },
        ],
        passed: 1,
        total: 1,
      }),
    ).toThrow(/exact deterministic check inventory/i);

    const reordered = validationResult();
    expect(() =>
      recordValidation(state, {
        ...reordered,
        checks: [...reordered.checks].reverse(),
      }),
    ).toThrow(/exact deterministic check inventory/i);
  });

  it("refuses an export receipt from a different proposal", async () => {
    let state = await rescanOwnedFixture(createRetrofitWorkflow());
    state = approveCapabilities(state, BOOKING_TOOL_NAMES);
    state = createRetrofitPreview(state);
    state = recordValidation(state, validationResult());

    expect(() =>
      recordExportReceipt(state, {
        bundleHash: "e".repeat(64),
        proposalHash: "f".repeat(64),
      }),
    ).toThrow(/current proposal/i);
  });
});
