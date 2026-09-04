import {
  isExactBookingToolInventory,
  type BookingToolName,
} from "../domain/booking";
import { inferCapabilities } from "../discovery/inferCapabilities";
import { canonicalJson, sha256Hex } from "../discovery/scanOwnedFixture";
import {
  hasPassingWorkflowValidation,
  type RetrofitWorkflowState,
} from "../workflow/retrofitWorkflow";
import type { PresenceReceipt } from "../presence/humanPresence";

export interface ExportManifest {
  schemaVersion: "1.0.0";
  sourceFixtureId: string;
  scanHash: string;
  proposalHash: string;
  versionHash: string;
  toolNames: readonly BookingToolName[];
  executionBoundary: "owner-reviewed-adapter";
  humanConfirmationBoundary: "outside-tool-surface";
  validation: {
    passed: number;
    total: number;
    checkIds: readonly string[];
  };
  artifacts: {
    evidencePath: "webmcp-retrofit.evidence.json";
    evidenceSha256: string;
    generatedJavaScriptPath: "webmcp-retrofit.generated.js";
    generatedJavaScriptSha256: string;
  };
}

export interface ExportEvidence {
  sourceFixtureId: string;
  scanHash: string;
  proposalHash: string;
  observations: readonly {
    id: string;
    selector: string;
    semanticRole: string;
  }[];
  safety: {
    parsedInertly: true;
    externalRequests: 0;
    executedScripts: 0;
    capturedCredentials: false;
    retainedRawValues: false;
  };
  /** PII-free WebAuthn presence receipt when a person confirmed the draft; null otherwise. */
  humanConfirmation: PresenceReceipt | null;
}

export interface ExportBundleOptions {
  humanConfirmation?: PresenceReceipt | null;
}

export interface ExportFile {
  path:
    | "webmcp-retrofit.manifest.json"
    | "webmcp-retrofit.evidence.json"
    | "webmcp-retrofit.generated.js";
  mediaType: "application/json" | "text/javascript";
  sha256: string;
  content: string;
}

export interface ExportBundle {
  bundleHash: string;
  manifest: ExportManifest;
  evidence: ExportEvidence;
  generatedJavaScript: string;
  files: readonly ExportFile[];
}

type UnsignedExportBundle = Omit<ExportBundle, "bundleHash">;

const EXPECTED_EXPORT_FILES = Object.freeze([
  {
    path: "webmcp-retrofit.manifest.json",
    mediaType: "application/json",
  },
  {
    path: "webmcp-retrofit.evidence.json",
    mediaType: "application/json",
  },
  {
    path: "webmcp-retrofit.generated.js",
    mediaType: "text/javascript",
  },
] as const);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function integrityError(detail: string): Error {
  return new Error(`Export bundle integrity check failed: ${detail}`);
}

function assertExactTopLevelKeys(bundle: ExportBundle): void {
  const expected = new Set([
    "bundleHash",
    "manifest",
    "evidence",
    "generatedJavaScript",
    "files",
  ]);
  const prototype = Object.getPrototypeOf(bundle);
  if (prototype !== Object.prototype && prototype !== null) {
    throw integrityError("bundle must be a plain object");
  }
  const keys = Reflect.ownKeys(bundle);
  if (
    keys.length !== expected.size ||
    keys.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    throw integrityError("bundle contains missing or unsupported top-level fields");
  }
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(bundle, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw integrityError(`${key} must be an enumerable own data property`);
    }
  }
}

function unsignedBundlePayload(bundle: ExportBundle): UnsignedExportBundle {
  return {
    manifest: bundle.manifest,
    evidence: bundle.evidence,
    generatedJavaScript: bundle.generatedJavaScript,
    files: bundle.files,
  };
}

async function verifySnapshot(bundle: ExportBundle): Promise<void> {
  assertExactTopLevelKeys(bundle);
  if (!/^[a-f0-9]{64}$/.test(bundle.bundleHash)) {
    throw integrityError("bundle hash is not a SHA-256 hex digest");
  }
  if (!Array.isArray(bundle.files) || bundle.files.length !== 3) {
    throw integrityError("exactly three files are required");
  }

  const canonicalManifest = canonicalJson(bundle.manifest);
  const canonicalEvidence = canonicalJson(bundle.evidence);
  const expectedContents = [
    canonicalManifest,
    canonicalEvidence,
    bundle.generatedJavaScript,
  ];

  for (let index = 0; index < EXPECTED_EXPORT_FILES.length; index += 1) {
    const file = bundle.files[index];
    const expected = EXPECTED_EXPORT_FILES[index];
    if (
      file.path !== expected.path ||
      file.mediaType !== expected.mediaType ||
      file.content !== expectedContents[index]
    ) {
      throw integrityError(`artifact ${expected.path} does not match its payload`);
    }
    const contentHash = await sha256Hex(file.content);
    if (file.sha256 !== contentHash) {
      throw integrityError(`artifact ${expected.path} digest does not match`);
    }
  }

  const evidenceFile = bundle.files[1];
  const generatedFile = bundle.files[2];
  if (
    bundle.manifest.artifacts.evidencePath !== evidenceFile.path ||
    bundle.manifest.artifacts.evidenceSha256 !== evidenceFile.sha256 ||
    bundle.manifest.artifacts.generatedJavaScriptPath !== generatedFile.path ||
    bundle.manifest.artifacts.generatedJavaScriptSha256 !== generatedFile.sha256
  ) {
    throw integrityError("manifest artifact references do not match the files");
  }

  const expectedBundleHash = await sha256Hex(
    canonicalJson(unsignedBundlePayload(bundle)),
  );
  if (bundle.bundleHash !== expectedBundleHash) {
    throw integrityError("bundle hash does not bind the complete payload");
  }
}

/**
 * Revalidates every duplicate payload and digest in an export bundle.
 * The bundle hash intentionally excludes only its own `bundleHash` field.
 */
export async function verifyExportBundleIntegrity(
  bundle: ExportBundle,
): Promise<void> {
  const snapshot = JSON.parse(canonicalJson(bundle)) as ExportBundle;
  await verifySnapshot(snapshot);
}

/** Returns the exact canonical bytes that were verified for local download. */
export async function serializeVerifiedExportBundle(
  bundle: ExportBundle,
): Promise<string> {
  const serialized = canonicalJson(bundle);
  const snapshot = JSON.parse(serialized) as ExportBundle;
  await verifySnapshot(snapshot);
  return serialized;
}

function buildGeneratedJavaScript(state: RetrofitWorkflowState): string {
  const contracts = state.proposal!.capabilities.map((capability) => ({
    name: capability.name,
    title: capability.title,
    description: capability.description,
    inputSchema: capability.inputSchema,
    annotations: capability.annotations,
  }));

  return `// Generated by WebMCP Retrofit Studio from reviewed metadata only.
// Connect this registration layer to an owner-reviewed same-origin adapter.
function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

const contracts = deepFreeze(${JSON.stringify(contracts, null, 2)});

function abortError() {
  return new DOMException("Tool execution was cancelled", "AbortError");
}

export async function registerWebMcpRetrofit({
  adapter = globalThis.webMcpRetrofitAdapter,
  registrationSignal,
} = {}) {
  if (typeof document.modelContext?.registerTool !== "function" ||
      typeof adapter?.execute !== "function") {
    throw new Error("WebMCP and the reviewed site adapter are required");
  }

  const registrationController = new AbortController();
  const abortFromOwner = () => registrationController.abort(
    registrationSignal?.reason ?? "registration-owner-disposed",
  );
  if (registrationSignal?.aborted) {
    abortFromOwner();
  } else {
    registrationSignal?.addEventListener("abort", abortFromOwner, { once: true });
  }

  const registeredTools = [];
  try {
    for (const contract of contracts) {
      if (registrationController.signal.aborted) throw abortError();
      await document.modelContext.registerTool({
        ...contract,
        async execute(input, client = {}) {
          if (registrationController.signal.aborted || client?.signal?.aborted) {
            throw abortError();
          }
          // The owner-reviewed adapter must honor client.signal transactionally
          // for async or state-changing work. Do not relabel a completed adapter
          // outcome if registration cleanup races its return.
          return adapter.execute(contract.name, input, client);
        },
      }, { signal: registrationController.signal });
      if (registrationController.signal.aborted) throw abortError();
      registeredTools.push(contract.name);
    }
  } catch (error) {
    registrationController.abort("partial-registration-failed");
    registrationSignal?.removeEventListener("abort", abortFromOwner);
    throw error;
  }

  let disposed = false;
  return Object.freeze({
    registeredTools: Object.freeze([...registeredTools]),
    dispose() {
      if (disposed) return;
      disposed = true;
      registrationSignal?.removeEventListener("abort", abortFromOwner);
      registrationController.abort("webmcp-retrofit-disposed");
    },
  });
}
`;
}

async function assertExportReady(state: RetrofitWorkflowState): Promise<void> {
  if (
    !state.scan ||
    !state.proposal ||
    !state.preview ||
    !state.approvedToolNames ||
    !hasPassingWorkflowValidation(state.validation)
  ) {
    throw new Error("A passing validation is required before export");
  }
  if (
    state.preview.proposalHash !== state.proposal.proposalHash ||
    state.validation.proposalHash !== state.proposal.proposalHash
  ) {
    throw new Error("Export artifacts do not match the current proposal");
  }

  const trustedProposal = await inferCapabilities(state.scan);
  const inventoryIsExact = isExactBookingToolInventory(
    state.approvedToolNames,
  );
  if (
    !inventoryIsExact ||
    canonicalJson(state.proposal) !== canonicalJson(trustedProposal)
  ) {
    throw new Error("Export does not match the current reviewed proposal");
  }
}

export async function buildExportBundle(
  state: RetrofitWorkflowState,
  options: ExportBundleOptions = {},
): Promise<ExportBundle> {
  await assertExportReady(state);
  const scan = state.scan!;
  const proposal = state.proposal!;
  const validation = state.validation!;

  const evidence: ExportEvidence = {
    sourceFixtureId: scan.fixtureId,
    scanHash: scan.scanHash,
    proposalHash: proposal.proposalHash,
    observations: scan.observations
      .filter((observation) => observation.present)
      .map(({ id, selector, semanticRole }) => ({ id, selector, semanticRole })),
    safety: scan.safety,
    humanConfirmation: options.humanConfirmation ? { ...options.humanConfirmation } : null,
  };
  const evidenceContent = canonicalJson(evidence);
  const evidenceSha256 = await sha256Hex(evidenceContent);
  const generatedJavaScript = buildGeneratedJavaScript(state);
  const generatedJavaScriptSha256 = await sha256Hex(generatedJavaScript);

  const manifest: ExportManifest = {
    schemaVersion: "1.0.0",
    sourceFixtureId: scan.fixtureId,
    scanHash: scan.scanHash,
    proposalHash: proposal.proposalHash,
    versionHash: proposal.versionHash,
    toolNames: [...state.approvedToolNames!],
    executionBoundary: "owner-reviewed-adapter",
    humanConfirmationBoundary: "outside-tool-surface",
    validation: {
      passed: validation.passed,
      total: validation.total,
      checkIds: [...validation.checkIds],
    },
    artifacts: {
      evidencePath: "webmcp-retrofit.evidence.json",
      evidenceSha256,
      generatedJavaScriptPath: "webmcp-retrofit.generated.js",
      generatedJavaScriptSha256,
    },
  };
  const manifestContent = canonicalJson(manifest);
  const manifestSha256 = await sha256Hex(manifestContent);
  const files: ExportFile[] = [
    {
      path: "webmcp-retrofit.manifest.json",
      mediaType: "application/json",
      sha256: manifestSha256,
      content: manifestContent,
    },
    {
      path: "webmcp-retrofit.evidence.json",
      mediaType: "application/json",
      sha256: evidenceSha256,
      content: evidenceContent,
    },
    {
      path: "webmcp-retrofit.generated.js",
      mediaType: "text/javascript",
      sha256: generatedJavaScriptSha256,
      content: generatedJavaScript,
    },
  ];
  const unsignedBundle: UnsignedExportBundle = {
    manifest,
    evidence,
    generatedJavaScript,
    files,
  };
  const bundleHash = await sha256Hex(canonicalJson(unsignedBundle));

  return deepFreeze({ bundleHash, ...unsignedBundle });
}
