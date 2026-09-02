import {
  BOOKING_TOOL_NAMES,
  isExactBookingToolInventory,
  type BookingToolName,
} from "../domain/booking";
import {
  inferCapabilities,
  type CapabilityProposal,
} from "../discovery/inferCapabilities";
import {
  scanOwnedFixture,
  type OwnedFixtureScanResult,
} from "../discovery/scanOwnedFixture";
import {
  hasExactDeterministicInventory,
  isPassingDeterministicReport,
  type DeterministicCheckResult,
} from "../validation/runDeterministicChecks";

export interface RetrofitPreview {
  proposalHash: string;
  versionHash: string;
  toolNames: readonly BookingToolName[];
  humanConfirmationBoundary: "outside-tool-surface";
}

export interface WorkflowValidation {
  proposalHash: string;
  passed: number;
  total: number;
  checkIds: readonly DeterministicCheckResult["id"][];
  status: "passed" | "failed";
}

export interface ExportReceipt {
  proposalHash: string;
  bundleHash: string;
}

export interface RetrofitWorkflowState {
  revision: number;
  scan: OwnedFixtureScanResult | null;
  proposal: CapabilityProposal | null;
  approvedToolNames: readonly BookingToolName[] | null;
  preview: RetrofitPreview | null;
  validation: WorkflowValidation | null;
  exportReceipt: ExportReceipt | null;
}

export function createRetrofitWorkflow(): RetrofitWorkflowState {
  return {
    revision: 0,
    scan: null,
    proposal: null,
    approvedToolNames: null,
    preview: null,
    validation: null,
    exportReceipt: null,
  };
}

export async function rescanOwnedFixture(
  previous: RetrofitWorkflowState,
): Promise<RetrofitWorkflowState> {
  const scan = await scanOwnedFixture();
  const proposal = await inferCapabilities(scan);
  return {
    revision: previous.revision + 1,
    scan,
    proposal,
    approvedToolNames: null,
    preview: null,
    validation: null,
    exportReceipt: null,
  };
}

export function approveCapabilities(
  state: RetrofitWorkflowState,
  toolNames: readonly BookingToolName[],
): RetrofitWorkflowState {
  if (!state.proposal) {
    throw new Error("A discovery proposal is required before approval");
  }
  if (!isExactBookingToolInventory(toolNames)) {
    throw new Error("Approval must match the exact three-tool allowlist");
  }

  return {
    ...state,
    approvedToolNames: [...BOOKING_TOOL_NAMES],
    preview: null,
    validation: null,
    exportReceipt: null,
  };
}

export function rejectCapabilities(
  state: RetrofitWorkflowState,
): RetrofitWorkflowState {
  return {
    ...state,
    approvedToolNames: null,
    preview: null,
    validation: null,
    exportReceipt: null,
  };
}

export function createRetrofitPreview(
  state: RetrofitWorkflowState,
): RetrofitWorkflowState {
  if (!state.proposal || !state.approvedToolNames) {
    throw new Error("Capability approval is required before preview");
  }

  return {
    ...state,
    preview: {
      proposalHash: state.proposal.proposalHash,
      versionHash: state.proposal.versionHash,
      toolNames: [...state.approvedToolNames],
      humanConfirmationBoundary: "outside-tool-surface",
    },
    validation: null,
    exportReceipt: null,
  };
}

export function recordValidation(
  state: RetrofitWorkflowState,
  result: {
    checks: readonly DeterministicCheckResult[];
    passed: number;
    total: number;
  },
): RetrofitWorkflowState {
  if (!state.proposal || !state.preview) {
    throw new Error("A generated preview is required before validation");
  }
  if (
    !Number.isInteger(result.passed) ||
    !Number.isInteger(result.total) ||
    result.total <= 0 ||
    result.passed < 0 ||
    result.passed > result.total
  ) {
    throw new TypeError("Validation counts must be bounded non-negative integers");
  }
  if (!hasExactDeterministicInventory(result)) {
    throw new Error("Validation must match the exact deterministic check inventory");
  }

  return {
    ...state,
    validation: {
      proposalHash: state.proposal.proposalHash,
      passed: result.passed,
      total: result.total,
      checkIds: result.checks.map((check) => check.id),
      status: isPassingDeterministicReport(result) ? "passed" : "failed",
    },
    exportReceipt: null,
  };
}

export function invalidateValidation(
  state: RetrofitWorkflowState,
): RetrofitWorkflowState {
  return {
    ...state,
    validation: null,
    exportReceipt: null,
  };
}

export function hasPassingWorkflowValidation(
  validation: WorkflowValidation | null,
): validation is WorkflowValidation & { status: "passed" } {
  if (!validation) return false;
  return isPassingDeterministicReport({
    passed: validation.passed,
    total: validation.total,
    checks: validation.checkIds.map((id) => ({
      id,
      label: id,
      detail: "recorded",
      status: validation.status === "passed" ? "passed" : "failed",
    })),
  });
}

export function recordExportReceipt(
  state: RetrofitWorkflowState,
  receipt: { bundleHash: string; proposalHash: string },
): RetrofitWorkflowState {
  if (!hasPassingWorkflowValidation(state.validation) || !state.proposal) {
    throw new Error("A passing validation is required before recording export");
  }
  if (receipt.proposalHash !== state.proposal.proposalHash) {
    throw new Error("The export receipt does not match the current proposal");
  }
  const { bundleHash } = receipt;
  if (!/^[a-f0-9]{64}$/.test(bundleHash)) {
    throw new TypeError("bundleHash must be a lowercase SHA-256 digest");
  }

  return {
    ...state,
    exportReceipt: {
      proposalHash: state.proposal.proposalHash,
      bundleHash,
    },
  };
}
