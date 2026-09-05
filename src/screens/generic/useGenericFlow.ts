import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenericProposal } from "../../discovery/inferGenericCapabilities";
import type { GenericScanResult } from "../../discovery/scanHtml";
import {
  buildGenericExportBundle,
  serializeGenericExportBundle,
  type GenericExportBundle,
} from "../../export/buildGenericExportBundle";
import type { HtmlSnapshot } from "../../fixtures/genericFixtures";
import type { HumanPresenceVerifier, PresenceReceipt } from "../../presence/humanPresence";
import {
  createGenericToolDefinitions,
  registerGenericTools,
  type StagedChange,
} from "../../runtime/genericRuntime";
import { sampleToolInput } from "../../runtime/sampleInput";
import { isPassingGenericReport, runGenericChecks, type GenericCheckReport } from "../../validation/runGenericChecks";
import type { ModelContextLike } from "../../webmcp/registerBookingTools";
import { describeFailure } from "../BookingPreview";

/**
 * State for the generic retrofit flow after a scan: approval bound to the
 * proposal hash, live registration while the runtime is on screen, a tool
 * console that invokes the same definitions an agent would, staged changes
 * with per-change presence receipts, the deterministic report, and the
 * fail-closed export.
 */

export interface GenericOutcome {
  snapshot: HtmlSnapshot;
  scan: GenericScanResult;
  proposal: GenericProposal;
}

export type GenericScreen = "candidates" | "preview" | "validate" | "export";
export type GenericRegistrationState = "idle" | "registering" | "registered" | "unsupported" | "failed";

export interface ConsoleEntry {
  id: number;
  toolName: string;
  input: string;
  output: string | null;
  error: string | null;
  at: string;
}

export interface StagedEntry {
  change: StagedChange;
  receipt: PresenceReceipt | null;
  failure: string | null;
  verifying: boolean;
  /** A later write to the same capability replaced this unconfirmed change on the page. */
  superseded: boolean;
}

export interface GenericFlowOptions {
  presenceVerifier: HumanPresenceVerifier;
  modelContext: ModelContextLike | undefined;
  runtimeActive: boolean;
}

export interface GenericFlow {
  outcome: GenericOutcome | null;
  approved: boolean;
  registration: GenericRegistrationState;
  tools: readonly WebMCP.ModelContextTool[];
  log: readonly ConsoleEntry[];
  staged: readonly StagedEntry[];
  report: GenericCheckReport | null;
  checksRunning: boolean;
  checkError: string | null;
  validated: boolean;
  bundle: GenericExportBundle | null;
  bundleError: string | null;
  exportApproved: boolean;
  downloading: boolean;
  downloadError: string | null;
  approve(): void;
  reject(): void;
  sampleInputFor(toolName: string): string;
  invoke(toolName: string, inputJson: string): Promise<void>;
  confirm(changeId: string): Promise<void>;
  runChecks(): void;
  canEnter(screen: GenericScreen): boolean;
  prepareExport(): void;
  setExportApproved(approved: boolean): void;
  download(): void;
  reset(): void;
}

const CHECK_FAILURE_MESSAGE = "The deterministic checks could not run; no report was recorded.";
const SUPERSEDED_MESSAGE = "A later change replaced this one on the page. Confirm the latest change instead.";
const BUNDLE_FAILURE_MESSAGE = "The export could not be built from the current proposal and report.";
const DOWNLOAD_FAILURE_MESSAGE = "The package could not start a local download.";

function summarize(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

export function useGenericFlow(outcome: GenericOutcome | null, options: GenericFlowOptions): GenericFlow {
  const { presenceVerifier, modelContext, runtimeActive } = options;
  const [approvedHash, setApprovedHash] = useState<string | null>(null);
  const [registration, setRegistration] = useState<GenericRegistrationState>("idle");
  const [log, setLog] = useState<ConsoleEntry[]>([]);
  const [staged, setStaged] = useState<StagedEntry[]>([]);
  const [report, setReport] = useState<GenericCheckReport | null>(null);
  const [checksRunning, setChecksRunning] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<GenericExportBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [exportApproved, setExportApproved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const logIdRef = useRef(0);
  const checksRunningRef = useRef(false);

  const host = useMemo(
    () => (outcome ? new DOMParser().parseFromString(outcome.snapshot.html, "text/html") : null),
    [outcome],
  );

  const handleStaged = useCallback((change: StagedChange) => {
    setStaged((current) => [
      ...current.map((entry) =>
        entry.change.capabilityId === change.capabilityId && !entry.receipt && !entry.verifying
          ? { ...entry, superseded: true }
          : entry,
      ),
      { change, receipt: null, failure: null, verifying: false, superseded: false },
    ]);
  }, []);

  const tools = useMemo(
    () =>
      outcome && host
        ? createGenericToolDefinitions({
            hostDocument: host,
            scan: outcome.scan,
            proposal: outcome.proposal,
            modelContext: undefined,
            onStaged: handleStaged,
          })
        : [],
    [handleStaged, host, outcome],
  );

  const approved = outcome !== null && approvedHash === outcome.proposal.proposalHash;
  const validated = report !== null && outcome !== null && isPassingGenericReport(report, outcome.proposal);

  useEffect(() => {
    if (!runtimeActive || !approved || !outcome || !host) {
      setRegistration("idle");
      return;
    }
    if (!modelContext) {
      setRegistration("unsupported");
      return;
    }
    let disposed = false;
    let dispose: () => void = () => {};
    const owner = new AbortController();
    setRegistration("registering");
    void registerGenericTools({
      hostDocument: host,
      scan: outcome.scan,
      proposal: outcome.proposal,
      modelContext,
      onStaged: handleStaged,
      registrationSignal: owner.signal,
    })
      .then((result) => {
        dispose = result.dispose;
        if (disposed) {
          dispose();
          return;
        }
        setRegistration(result.supported ? "registered" : "unsupported");
      })
      .catch(() => {
        if (!disposed) setRegistration("failed");
      });
    return () => {
      disposed = true;
      owner.abort("left-generic-runtime");
      dispose();
    };
  }, [approved, handleStaged, host, modelContext, outcome, runtimeActive]);

  const reset = useCallback(() => {
    requestRef.current += 1;
    checksRunningRef.current = false;
    setApprovedHash(null);
    setLog([]);
    setStaged([]);
    setReport(null);
    setChecksRunning(false);
    setCheckError(null);
    setBundle(null);
    setBundleError(null);
    setExportApproved(false);
    setDownloading(false);
    setDownloadError(null);
  }, []);

  const approve = useCallback(() => {
    if (outcome) setApprovedHash(outcome.proposal.proposalHash);
  }, [outcome]);

  const reject = useCallback(() => setApprovedHash(null), []);

  const sampleInputFor = useCallback(
    (toolName: string) => {
      const proposed = outcome?.proposal.tools.find((tool) => tool.name === toolName);
      return proposed ? summarize(sampleToolInput(proposed.inputSchema)) : "{}";
    },
    [outcome],
  );

  const invoke = useCallback(
    async (toolName: string, inputJson: string) => {
      const tool = tools.find((candidate) => candidate.name === toolName);
      const requestId = requestRef.current;
      const id = (logIdRef.current += 1);
      const at = new Date().toISOString();
      const entry = (output: string | null, error: string | null): ConsoleEntry => ({
        id,
        toolName,
        input: inputJson,
        output,
        error,
        at,
      });
      if (!tool) {
        setLog((current) => [entry(null, `Unknown tool ${toolName}`), ...current]);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(inputJson) as unknown;
      } catch {
        setLog((current) => [entry(null, "Input is not valid JSON"), ...current]);
        return;
      }
      try {
        // The runtime re-validates shape and keys; the cast only satisfies the callback type.
        const output = await tool.execute(parsed as Record<string, unknown>, { signal: new AbortController().signal });
        if (requestRef.current !== requestId) return;
        setLog((current) => [entry(summarize(output), null), ...current]);
      } catch (error) {
        if (requestRef.current !== requestId) return;
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        setLog((current) => [entry(null, message), ...current]);
      }
    },
    [tools],
  );

  const confirm = useCallback(
    async (changeId: string) => {
      const target = staged.find((entry) => entry.change.id === changeId);
      if (!target || target.verifying || target.receipt) return;
      const update = (patch: Partial<StagedEntry>) =>
        setStaged((current) =>
          current.map((entry) => (entry.change.id === changeId ? { ...entry, ...patch } : entry)),
        );
      if (target.superseded) {
        update({ failure: SUPERSEDED_MESSAGE });
        return;
      }
      update({ verifying: true, failure: null });
      try {
        const receipt = await presenceVerifier.verify(changeId);
        if (receipt.subject !== changeId) {
          update({ verifying: false, failure: "The receipt does not belong to this staged change." });
          return;
        }
        update({ verifying: false, receipt });
      } catch (error) {
        update({ verifying: false, failure: describeFailure(error) });
      }
    },
    [presenceVerifier, staged],
  );

  const runChecks = useCallback(() => {
    if (!outcome || checksRunningRef.current) return;
    checksRunningRef.current = true;
    const requestId = (requestRef.current += 1);
    setChecksRunning(true);
    setCheckError(null);
    setBundle(null);
    setExportApproved(false);
    void runGenericChecks({ snapshot: outcome.snapshot, scan: outcome.scan, proposal: outcome.proposal })
      .then((next) => {
        if (requestRef.current !== requestId) return;
        setReport(next);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setReport(null);
        setCheckError(CHECK_FAILURE_MESSAGE);
      })
      .finally(() => {
        checksRunningRef.current = false;
        if (requestRef.current === requestId) setChecksRunning(false);
      });
  }, [outcome]);

  const prepareExport = useCallback(() => {
    if (!outcome || !report || !validated || bundle) return;
    const requestId = (requestRef.current += 1);
    setBundleError(null);
    const humanConfirmations = staged.flatMap((entry) => (entry.receipt ? [entry.receipt] : []));
    void buildGenericExportBundle({
      snapshot: outcome.snapshot,
      scan: outcome.scan,
      proposal: outcome.proposal,
      validation: report,
      staged: staged.map((entry) => ({ id: entry.change.id, capabilityId: entry.change.capabilityId })),
      humanConfirmations,
    })
      .then((next) => {
        if (requestRef.current === requestId) setBundle(next);
      })
      .catch(() => {
        if (requestRef.current === requestId) setBundleError(BUNDLE_FAILURE_MESSAGE);
      });
  }, [bundle, outcome, report, staged, validated]);

  const canEnter = useCallback(
    (screen: GenericScreen) => {
      switch (screen) {
        case "candidates":
          return outcome !== null;
        case "preview":
        case "validate":
          return approved;
        case "export":
          return validated;
      }
    },
    [approved, outcome, validated],
  );

  const download = useCallback(() => {
    if (!bundle || !exportApproved || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    let url: string | null = null;
    try {
      const blob = new Blob([serializeGenericExportBundle(bundle)], { type: "application/json" });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `webmcp-generic-retrofit-${bundle.bundleHash.slice(0, 12)}.json`;
      anchor.click();
    } catch {
      setDownloadError(DOWNLOAD_FAILURE_MESSAGE);
    } finally {
      if (url) URL.revokeObjectURL(url);
      setDownloading(false);
    }
  }, [bundle, downloading, exportApproved]);

  return {
    outcome,
    approved,
    registration,
    tools,
    log,
    staged,
    report,
    checksRunning,
    checkError,
    validated,
    bundle,
    bundleError,
    exportApproved,
    downloading,
    downloadError,
    approve,
    reject,
    sampleInputFor,
    invoke,
    confirm,
    runChecks,
    canEnter,
    prepareExport,
    setExportApproved,
    download,
    reset,
  };
}
