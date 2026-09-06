import {
  } from "lucide-react";
import { type DraftSource } from "./screens/BookingPreview";
import { GenericCandidateScreen } from "./screens/GenericCandidates";
import { BOOKING_SOURCE_ID, OWNER_SOURCE_ID, ScanScreen } from "./screens/ScanScreen";
import { createOwnerSnapshot, OwnerSnapshotError } from "./fixtures/ownerSnapshot";
import { GenericExportScreen } from "./screens/generic/GenericExportScreen";
import { GenericRuntimeScreen } from "./screens/generic/GenericRuntimeScreen";
import { GenericValidateScreen } from "./screens/generic/GenericValidateScreen";
import { useGenericFlow, type GenericOutcome, type GenericScreen } from "./screens/generic/useGenericFlow";
import { GENERIC_FIXTURES } from "./fixtures/genericFixtures";
import { scanHtml } from "./discovery/scanHtml";
import { inferGenericCapabilities } from "./discovery/inferGenericCapabilities";
import { createWebAuthnPresenceVerifier, type HumanPresenceVerifier, type PresenceReceipt } from "./presence/humanPresence";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  } from "react";
import { buildCandidateReviewModel } from "./data/candidates";
import {
  BOOKING_TOOL_NAMES,
  stageBooking,
  type BookingDraft,
  type ServiceId,
} from "./domain/booking";
import {
  type ResponseModeId,
} from "./quality/responseQuality";
import { buildExportBundle, serializeVerifiedExportBundle, type ExportBundle } from "./export/buildExportBundle";
import {
  approveCapabilities,
  createRetrofitPreview,
  createRetrofitWorkflow,
  invalidateValidation,
  recordExportReceipt,
  recordValidation,
  rejectCapabilities,
  rescanOwnedFixture,
  type RetrofitWorkflowState,
} from "./workflow/retrofitWorkflow";
import {
  runDeterministicChecks,
  type DeterministicReport,
} from "./validation/runDeterministicChecks";
import { registerBookingTools } from "./webmcp/registerBookingTools";
import { AppHeader } from "./components/AppHeader";
import { type RegistrationState } from "./components/RegistrationBadge";
import { type Screen, StepRail } from "./components/StepRail";
import { CandidateScreen, type ReviewDecision } from "./screens/booking/CandidateScreen";
import { ExportScreen } from "./screens/booking/ExportScreen";
import { PreviewScreen } from "./screens/booking/PreviewScreen";
import { ValidateScreen } from "./screens/booking/ValidateScreen";

export type AppView = "owner" | "customer";

export interface AppProps {
  /** Test seam; production uses the WebAuthn verifier. */
  presenceVerifier?: HumanPresenceVerifier;
  /**
   * Owner view walks the retrofit; customer view opens the booking page with
   * the reviewed tools already live. Defaults from `?view=customer`.
   */
  view?: AppView;
}

function defaultView(): AppView {
  if (typeof location === "undefined") return "owner";
  return new URLSearchParams(location.search).get("view") === "customer" ? "customer" : "owner";
}

export function App({ presenceVerifier, view }: AppProps = {}) {
  const appView = view ?? defaultView();
  const customerView = appView === "customer";
  const verifier = useMemo(
    () => presenceVerifier ?? createWebAuthnPresenceVerifier(),
    [presenceVerifier],
  );
  const [screen, setScreen] = useState<Screen>("scan");
  const [workflow, setWorkflow] = useState<RetrofitWorkflowState>(() =>
    createRetrofitWorkflow(),
  );
  const exportRequestIdRef = useRef(0);
  const [authorized, setAuthorized] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(BOOKING_SOURCE_ID);
  const [ownerHtml, setOwnerHtml] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [generic, setGeneric] = useState<GenericOutcome | null>(null);
  const [mode, setMode] = useState<ResponseModeId>("accuracy");
  const [decision, setDecision] = useState<ReviewDecision>("pending");
  const [registration, setRegistration] = useState<RegistrationState>("idle");
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null);
  const [presenceReceipt, setPresenceReceipt] = useState<PresenceReceipt | null>(null);
  const [validationReport, setValidationReport] =
    useState<DeterministicReport | null>(null);
  const [validationRunning, setValidationRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [liveUatRecorded, setLiveUatRecorded] = useState(false);
  const [exportBundle, setExportBundle] = useState<ExportBundle | null>(null);
  const [exportApproved, setExportApproved] = useState(false);
  const [exportDownloading, setExportDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const approved = decision === "approved" && workflow.approvedToolNames !== null;
  const candidateReviewModel = useMemo(
    () =>
      workflow.scan && workflow.proposal
        ? buildCandidateReviewModel(workflow.scan, workflow.proposal)
        : null,
    [workflow.proposal, workflow.scan],
  );
  const previewReady = workflow.preview !== null;
  const validationPassed = workflow.validation?.status === "passed";
  const exportReady = validationPassed && liveUatRecorded;
  const runtimeActive = !generic && screen === "validate";

  const handleDraftStaged = useCallback((nextDraft: BookingDraft) => {
    setDraft(nextDraft);
    setDraftSource("tool");
    setPresenceReceipt(null);
  }, []);

  const modelContext = useMemo(() => {
    if (typeof document === "undefined") return undefined;
    return document.modelContext;
  }, []);

  const genericFlow = useGenericFlow(generic, {
    presenceVerifier: verifier,
    modelContext,
    runtimeActive: generic !== null && (screen === "preview" || screen === "validate"),
  });
  const resetGenericFlow = genericFlow.reset;

  useEffect(() => {
    if (!runtimeActive) {
      setRegistration("idle");
      return;
    }

    if (!modelContext) {
      setRegistration("unsupported");
      return;
    }

    let disposed = false;
    let disposeRegistration: () => void = () => {};
    const registrationOwner = new AbortController();
    setRegistration("registering");

    void registerBookingTools({
      modelContext,
      onDraftStaged: handleDraftStaged,
      registrationSignal: registrationOwner.signal,
    })
      .then((result) => {
        disposeRegistration = result.dispose;
        if (disposed) {
          disposeRegistration();
          return;
        }
        setRegistration(result.supported ? "registered" : "unsupported");
      })
      .catch(() => {
        if (!disposed) setRegistration("failed");
      });

    return () => {
      disposed = true;
      registrationOwner.abort("left-validation-runtime");
      disposeRegistration();
    };
  }, [handleDraftStaged, modelContext, runtimeActive]);

  useEffect(() => {
    if (!customerView) return;
    let cancelled = false;
    void rescanOwnedFixture(createRetrofitWorkflow())
      .then((scanned) => {
        if (cancelled) return;
        const ready = createRetrofitPreview(approveCapabilities(scanned, BOOKING_TOOL_NAMES));
        setWorkflow(ready);
        setAuthorized(true);
        setDecision("approved");
        setScreen("validate");
      })
      .catch(() => {
        if (!cancelled) setScanError("The customer view could not prepare the reviewed tools.");
      });
    return () => {
      cancelled = true;
    };
  }, [customerView]);

  const handleLocalStage = useCallback(
    (input: { serviceId: ServiceId; date: string; time: string }) => {
      setDraft(stageBooking(input));
      setDraftSource("visible-ui");
      setPresenceReceipt(null);
    },
    [],
  );

  const resetDownstream = useCallback(() => {
    setDecision("pending");
    setDraft(null);
    setDraftSource(null);
    setPresenceReceipt(null);
    setValidationReport(null);
    setValidationError(null);
    setLiveUatRecorded(false);
    setExportBundle(null);
    setExportApproved(false);
    setExportDownloading(false);
    setExportError(null);
  }, []);

  const handleScan = useCallback(() => {
    if (!authorized || scanningRef.current) return;
    scanningRef.current = true;
    exportRequestIdRef.current += 1;
    setScanning(true);
    setScanError(null);
    resetGenericFlow();
    const ownerSelected = sourceId === OWNER_SOURCE_ID;
    const fixture = GENERIC_FIXTURES.find((candidate) => candidate.id === sourceId);
    const snapshot = ownerSelected
      ? createOwnerSnapshot(ownerHtml, { fallbackTitle: ownerLabel })
      : fixture
        ? Promise.resolve(fixture)
        : null;
    const run = snapshot
      ? snapshot.then(async (source) => {
          const scan = await scanHtml(source);
          const proposal = await inferGenericCapabilities(scan);
          setGeneric({ snapshot: source, scan, proposal });
          setWorkflow(createRetrofitWorkflow());
        })
      : rescanOwnedFixture(workflow).then((nextWorkflow) => {
          setGeneric(null);
          setWorkflow(nextWorkflow);
        });
    void run
      .then(() => {
        resetDownstream();
        setScreen("candidates");
      })
      .catch((error: unknown) => {
        // Only the paste helper's own validation messages are shown; anything else stays generic.
        setScanError(
          error instanceof OwnerSnapshotError
            ? error.message
            : "The inert snapshot scan could not complete; no evidence was retained.",
        );
      })
      .finally(() => {
        scanningRef.current = false;
        setScanning(false);
      });
  }, [authorized, ownerHtml, ownerLabel, resetDownstream, resetGenericFlow, sourceId, workflow]);

  // The attestation wording differs per source, so a new source needs a fresh tick.
  const handleSourceChange = useCallback((nextSourceId: string) => {
    setSourceId(nextSourceId);
    setAuthorized(false);
    setScanError(null);
  }, []);

  const handleApprove = useCallback(() => {
    if (approved) return;
    exportRequestIdRef.current += 1;
    setWorkflow((current) => approveCapabilities(current, BOOKING_TOOL_NAMES));
    setDecision("approved");
    setLiveUatRecorded(false);
    setExportBundle(null);
    setExportApproved(false);
    setExportDownloading(false);
    setExportError(null);
  }, [approved]);

  const handleReject = useCallback(() => {
    exportRequestIdRef.current += 1;
    setWorkflow((current) => rejectCapabilities(current));
    setDecision("rejected");
    setDraft(null);
    setDraftSource(null);
    setPresenceReceipt(null);
    setValidationReport(null);
    setValidationError(null);
    setLiveUatRecorded(false);
    setExportBundle(null);
    setExportApproved(false);
    setExportDownloading(false);
    setExportError(null);
  }, []);

  const handleRunValidation = useCallback(() => {
    exportRequestIdRef.current += 1;
    setValidationRunning(true);
    setValidationReport(null);
    setValidationError(null);
    setWorkflow((current) => invalidateValidation(current));
    setLiveUatRecorded(false);
    setExportBundle(null);
    setExportApproved(false);
    setExportDownloading(false);
    setExportError(null);
    void runDeterministicChecks()
      .then((report) => {
        setValidationReport(report);
        setWorkflow((current) => recordValidation(current, report));
      })
      .catch(() => {
        setValidationReport(null);
        setValidationError(
          "The in-browser checks could not complete; no pass result was recorded.",
        );
      })
      .finally(() => setValidationRunning(false));
  }, []);

  const navigate = (nextScreen: Screen) => {
    if (nextScreen !== "export") {
      exportRequestIdRef.current += 1;
      setExportDownloading(false);
      setExportError(null);
    }
    if (generic) {
      if (nextScreen !== "scan" && !genericFlow.canEnter(nextScreen as GenericScreen)) return;
      if (nextScreen === "export") genericFlow.prepareExport();
      setScreen(nextScreen);
      return;
    }
    if (nextScreen === "candidates" && !workflow.scan) return;
    if (nextScreen === "preview") {
      if (!approved) return;
      if (!workflow.preview) {
        const nextWorkflow = createRetrofitPreview(workflow);
        setWorkflow(nextWorkflow);
      }
    }
    if (nextScreen === "validate" && !workflow.preview) return;
    if (nextScreen === "export" && (!exportReady || !exportBundle)) return;
    setScreen(nextScreen);
  };

  const lockForValidation = () => {
    const nextWorkflow = workflow.preview
      ? workflow
      : createRetrofitPreview(workflow);
    if (nextWorkflow !== workflow) setWorkflow(nextWorkflow);
    setScreen("validate");
  };

  const continueToExport = () => {
    if (!exportReady) return;
    const requestId = exportRequestIdRef.current + 1;
    exportRequestIdRef.current = requestId;
    const sourceWorkflow = workflow;
    const sourceReceipt = presenceReceipt;
    void buildExportBundle(sourceWorkflow, { humanConfirmation: sourceReceipt })
      .then((bundle) => {
        if (exportRequestIdRef.current !== requestId) return;
        setExportBundle(bundle);
        setExportApproved(false);
        setExportDownloading(false);
        setExportError(null);
        setScreen("export");
      })
      .catch(() => {
        if (exportRequestIdRef.current !== requestId) return;
        setValidationError(
          "The clean-room bundle could not be generated; validation evidence remains unchanged.",
        );
      });
  };

  const downloadBundle = () => {
    if (!exportBundle || !exportApproved || exportDownloading) return;
    const requestId = exportRequestIdRef.current + 1;
    exportRequestIdRef.current = requestId;
    const sourceWorkflow = workflow;
    const sourceBundle = exportBundle;
    setExportDownloading(true);
    setExportError(null);

    void serializeVerifiedExportBundle(sourceBundle)
      .then((serializedBundle) => {
        if (exportRequestIdRef.current !== requestId) return;
        let nextWorkflow: RetrofitWorkflowState;
        try {
          nextWorkflow = recordExportReceipt(sourceWorkflow, {
            bundleHash: sourceBundle.bundleHash,
            proposalHash: sourceBundle.manifest.proposalHash,
          });
        } catch {
          setExportError(
            "The package no longer matches the current reviewed proposal; no download occurred.",
          );
          return;
        }

        let url: string | null = null;
        try {
          const blob = new Blob([serializedBundle], {
            type: "application/json",
          });
          url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `webmcp-retrofit-${sourceBundle.bundleHash.slice(0, 12)}.json`;
          anchor.click();
          setWorkflow(nextWorkflow);
        } catch {
          setExportError(
            "The verified package could not start a local download; no export receipt was recorded.",
          );
        } finally {
          if (url) URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (exportRequestIdRef.current !== requestId) return;
        setExportError(
          "Final bundle integrity verification failed; no download occurred.",
        );
      })
      .finally(() => {
        if (exportRequestIdRef.current === requestId) {
          setExportDownloading(false);
        }
      });
  };

  return (
    <div className="app-shell">
      <AppHeader />
      {customerView && (
        <div className="customer-banner" role="note">
          <strong>Customer view.</strong> The owner's retrofit is already applied; an agent stages the
          draft and you confirm it with one device gesture.{" "}
          <a href="./">Owner view</a>
          {scanError && <span className="customer-banner-error"> {scanError}</span>}
        </div>
      )}
      <div className={customerView ? "app-body no-rail" : "app-body"}>
        {!customerView && (
        <StepRail
          approved={approved || genericFlow.approved}
          onNavigate={navigate}
          previewReady={previewReady || genericFlow.approved}
          scanComplete={workflow.scan !== null || generic !== null}
          screen={screen}
          validated={exportReady || genericFlow.validated}
        />
        )}
        <main>
          {screen === "scan" && (
            <ScanScreen
              authorized={authorized}
              error={scanError}
              onAuthorizationChange={setAuthorized}
              onOwnerHtmlChange={setOwnerHtml}
              onOwnerLabelChange={setOwnerLabel}
              onScan={handleScan}
              onSourceChange={handleSourceChange}
              ownerHtml={ownerHtml}
              ownerLabel={ownerLabel}
              scanning={scanning}
              sourceId={sourceId}
            />
          )}
          {screen === "candidates" && generic && (
            <GenericCandidateScreen
              approved={genericFlow.approved}
              onApprove={() => {
                genericFlow.approve();
                setScreen("preview");
              }}
              onBack={() => setScreen("scan")}
              onReject={() => {
                genericFlow.reject();
                setScreen("scan");
              }}
              proposal={generic.proposal}
              scan={generic.scan}
            />
          )}
          {screen === "preview" && generic && (
            <GenericRuntimeScreen flow={genericFlow} onContinue={() => navigate("validate")} />
          )}
          {screen === "validate" && generic && (
            <GenericValidateScreen flow={genericFlow} onContinue={() => navigate("export")} />
          )}
          {screen === "export" && generic && <GenericExportScreen flow={genericFlow} />}
          {screen === "candidates" && !generic && workflow.scan && candidateReviewModel && (
            <CandidateScreen
              decision={decision}
              mode={mode}
              onApprove={handleApprove}
              onModeChange={setMode}
              onReject={handleReject}
              reviewModel={candidateReviewModel}
              scanHash={workflow.scan.scanHash}
            />
          )}
          {!generic && screen === "preview" && workflow.proposal && workflow.preview && (
            <PreviewScreen
              draft={draft}
              onContinue={lockForValidation}
              proposalHash={workflow.proposal.proposalHash}
              registration={registration}
              versionHash={workflow.proposal.versionHash}
            />
          )}
          {!generic && screen === "validate" && (
            <ValidateScreen
              presenceReceipt={presenceReceipt}
              presenceVerifier={verifier}
              draft={draft}
              draftSource={draftSource}
              liveUatRecorded={liveUatRecorded}
              onConfirmed={(receipt) => {
                if (receipt.subject === draft?.id) setPresenceReceipt(receipt);
              }}
              onContinue={continueToExport}
              onRecordLiveUat={() => setLiveUatRecorded(true)}
              onRunValidation={handleRunValidation}
              onStage={handleLocalStage}
              onValuesChanged={() => setPresenceReceipt(null)}
              registration={registration}
              validationError={validationError}
              validationReport={validationReport}
              validationRunning={validationRunning}
            />
          )}
          {!generic && screen === "export" && exportBundle && (
            <ExportScreen
              approved={exportApproved}
              bundle={exportBundle}
              downloading={exportDownloading}
              error={exportError}
              onApprovalChange={(nextApproved) => {
                exportRequestIdRef.current += 1;
                setExportApproved(nextApproved);
                setExportDownloading(false);
                setExportError(null);
              }}
              onDownload={downloadBundle}
            />
          )}
        </main>
      </div>
      <footer className="app-footer">
        <span>Synthetic fixture · No external transaction</span>
        <span>Contract v1.0 · Evidence policy 1.0</span>
      </footer>
    </div>
  );
}
