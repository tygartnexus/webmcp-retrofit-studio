import type { BookingToolName } from "../domain/booking";
import {
  BOOKING_TOOL_CONTRACTS,
  type BookingToolContract,
} from "../webmcp/bookingToolContracts";
import {
  canonicalJson,
  scanOwnedFixture,
  sha256Hex,
  type EvidenceObservationId,
  type OwnedFixtureScanResult,
} from "./scanOwnedFixture";

export interface ProposedCapability {
  name: BookingToolName;
  title: string;
  description: string;
  inputSchema: BookingToolContract["inputSchema"];
  annotations: BookingToolContract["annotations"];
  evidenceIds: readonly EvidenceObservationId[];
  reviewBoundary: "read-only" | "human-review-before-visible-write";
}

export interface CapabilityProposal {
  scanHash: string;
  proposalHash: string;
  versionHash: string;
  capabilities: readonly ProposedCapability[];
  excludedCapabilityNames: readonly ["finalize_booking"];
  humanConfirmationBoundary: "outside-tool-surface";
}

const INFERENCE_VERSION = "retrofit-inference-v2";
const REQUIRED_EVIDENCE = Object.freeze([
  "service-search-control",
  "service-choice-control",
  "date-control",
  "time-control",
  "stage-control",
  "human-confirmation-control",
] as const satisfies readonly EvidenceObservationId[]);

const EVIDENCE_BY_TOOL = Object.freeze({
  search_services: ["service-search-control", "service-choice-control"],
  get_availability: [
    "service-choice-control",
    "date-control",
    "time-control",
  ],
  stage_booking: [
    "service-choice-control",
    "date-control",
    "time-control",
    "stage-control",
  ],
} as const satisfies Readonly<
  Record<BookingToolName, readonly EvidenceObservationId[]>
>);

function assertCompleteEvidence(scan: OwnedFixtureScanResult): void {
  const present = new Set(
    scan.observations
      .filter((observation) => observation.present)
      .map((observation) => observation.id),
  );
  if (REQUIRED_EVIDENCE.some((evidenceId) => !present.has(evidenceId))) {
    throw new Error("Required fixture evidence is absent");
  }
  if (
    !scan.safety.parsedInertly ||
    scan.safety.externalRequests !== 0 ||
    scan.safety.executedScripts !== 0 ||
    scan.safety.capturedCredentials ||
    scan.safety.retainedRawValues
  ) {
    throw new Error("Discovery safety boundary was not satisfied");
  }
}

export async function inferCapabilities(
  scan: OwnedFixtureScanResult,
): Promise<CapabilityProposal> {
  assertCompleteEvidence(scan);
  const trustedScan = await scanOwnedFixture();
  if (canonicalJson(scan) !== canonicalJson(trustedScan)) {
    throw new Error("Scan metadata is not bound to the bundled snapshot");
  }

  const capabilities = BOOKING_TOOL_CONTRACTS.map((contract) => ({
    name: contract.name,
    title: contract.title,
    description: contract.description,
    inputSchema: contract.inputSchema,
    annotations: contract.annotations,
    evidenceIds: EVIDENCE_BY_TOOL[contract.name],
    reviewBoundary: contract.annotations.readOnlyHint
      ? ("read-only" as const)
      : ("human-review-before-visible-write" as const),
  }));
  const excludedCapabilityNames = Object.freeze(["finalize_booking"] as const);
  const humanConfirmationBoundary = "outside-tool-surface" as const;
  const versionHash = await sha256Hex(
    canonicalJson({
      inferenceVersion: INFERENCE_VERSION,
      capabilities,
      excludedCapabilityNames,
      humanConfirmationBoundary,
    }),
  );
  const proposalHash = await sha256Hex(
    canonicalJson({
      scanHash: scan.scanHash,
      versionHash,
      capabilities,
      excludedCapabilityNames,
      humanConfirmationBoundary,
    }),
  );

  return {
    scanHash: scan.scanHash,
    proposalHash,
    versionHash,
    capabilities,
    excludedCapabilityNames,
    humanConfirmationBoundary,
  };
}
