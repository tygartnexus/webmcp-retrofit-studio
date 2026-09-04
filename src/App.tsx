import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  Code2,
  Download,
  Eye,
  FileCheck2,
  FileCode2,
  Globe2,
  Hash,
  HelpCircle,
  Info,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TestTube2,
  X,
} from "lucide-react";
import { BookingPreview, type DraftSource } from "./screens/BookingPreview";
import {
  createWebAuthnPresenceVerifier,
  type HumanPresenceVerifier,
  type PresenceReceipt,
} from "./presence/humanPresence";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildCandidateReviewModel,
  type CandidateReviewModel,
  type CandidateState,
} from "./data/candidates";
import {
  BOOKING_TOOL_NAMES,
  stageBooking,
  type BookingDraft,
  type ServiceId,
} from "./domain/booking";
import {
  isResponseModeId,
  RESPONSE_MODES,
  type QualitySectionKey,
  type ResponseModeId,
} from "./quality/responseQuality";
import { getReviewModeConfiguration } from "./quality/reviewModes";
import {
  buildExportBundle,
  serializeVerifiedExportBundle,
  type ExportBundle,
} from "./export/buildExportBundle";
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
  DETERMINISTIC_CHECKS,
  isPassingDeterministicReport,
  runDeterministicChecks,
  type DeterministicReport,
} from "./validation/runDeterministicChecks";
import { registerBookingTools } from "./webmcp/registerBookingTools";
import {
  BOOKING_TOOL_CONTRACTS,
  STAGE_BOOKING_TOOL_CONTRACT,
} from "./webmcp/bookingToolContracts";

type Screen = "scan" | "candidates" | "preview" | "validate" | "export";
type ReviewDecision = "pending" | "approved" | "rejected";
type RegistrationState =
  | "idle"
  | "registering"
  | "registered"
  | "unsupported"
  | "failed";

const STEPS = [
  { id: "scan", label: "Scan", icon: Search },
  { id: "candidates", label: "Candidates", icon: Sparkles },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "validate", label: "Validate", icon: TestTube2 },
  { id: "export", label: "Export", icon: FileCheck2 },
] as const;

const CONTRACT_JSON = JSON.stringify(STAGE_BOOKING_TOOL_CONTRACT, null, 2);
const PREVIEW_CODE = `const registrationController = new AbortController();
const contracts = ${JSON.stringify(BOOKING_TOOL_CONTRACTS, null, 2)};

for (const contract of contracts) {
  await document.modelContext.registerTool({
    ...contract,
    execute: trustedHandlers[contract.name],
  }, { signal: registrationController.signal });
}

return () => registrationController.abort();`;

function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <Blocks size={23} strokeWidth={2.2} />
        </span>
        <div>
          <span className="brand-name">WebMCP Retrofit Studio</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="fixture-name">Legacy Booking Demo</span>
        </div>
      </div>
      <a
        className="quiet-button"
        href="https://learn.chatgpt.com/docs/webmcp"
        rel="noreferrer"
        target="_blank"
      >
        <HelpCircle size={17} />
        Help
      </a>
    </header>
  );
}

function StepRail({
  screen,
  scanComplete,
  approved,
  previewReady,
  validated,
  onNavigate,
}: {
  screen: Screen;
  scanComplete: boolean;
  approved: boolean;
  previewReady: boolean;
  validated: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <aside className="step-rail" aria-label="Retrofit progress">
      <p className="eyebrow rail-eyebrow">Retrofit flow</p>
      <nav>
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === screen;
          const isComplete =
            (step.id === "scan" && scanComplete) ||
            (step.id === "candidates" && approved) ||
            (step.id === "preview" && previewReady) ||
            (step.id === "validate" && validated);
          const canNavigate =
            step.id === "scan" ||
            (step.id === "candidates" && scanComplete) ||
            (step.id === "preview" && approved) ||
            (step.id === "validate" && previewReady) ||
            (step.id === "export" && validated);
          const disabled = !canNavigate;
          return (
            <button
              className={`step-link${isActive ? " is-active" : ""}`}
              disabled={disabled}
              key={step.id}
              onClick={() => onNavigate(step.id)}
              type="button"
            >
              <span className={`step-index${isComplete ? " is-complete" : ""}`}>
                {isComplete ? <Check size={14} /> : index + 1}
              </span>
              <Icon size={17} />
              <span>{step.label}</span>
              {isActive && <ChevronRight className="step-chevron" size={16} />}
            </button>
          );
        })}
      </nav>
      <div className="rail-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Owned fixture only</strong>
          <span>No credentials or live bookings.</span>
        </div>
      </div>
    </aside>
  );
}

function ReviewModeSelector({
  selected,
  onSelect,
}: {
  selected: ResponseModeId;
  onSelect: (id: ResponseModeId) => void;
}) {
  return (
    <section className="mode-section" aria-labelledby="review-mode-label">
      <div className="section-heading-row compact-heading-row">
        <div>
          <h2 id="review-mode-label">Review mode</h2>
        </div>
        <span className="plain-status">
          <ShieldCheck size={15} /> Nine-field truth contract
        </span>
      </div>
      <div className="mode-switcher" role="group" aria-label="Response mode">
        {RESPONSE_MODES.map((mode) => (
          <button
            aria-label={mode.label}
            aria-pressed={selected === mode.id}
            className={selected === mode.id ? "is-selected" : ""}
            key={mode.id}
            onClick={() => onSelect(mode.id)}
            type="button"
          >
            {mode.shortLabel}
          </button>
        ))}
      </div>
      <select
        aria-label="Mobile response mode"
        className="mobile-mode-select"
        onChange={(event) => {
          if (isResponseModeId(event.target.value)) {
            onSelect(event.target.value);
          }
        }}
        value={selected}
      >
        {RESPONSE_MODES.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.shortLabel}
          </option>
        ))}
      </select>
    </section>
  );
}

function StateBadge({ state }: { state: CandidateState }) {
  const labels: Record<CandidateState, string> = {
    "read-only": "Read only",
    "needs-review": "Needs review",
    "not-exposed": "Not exposed",
  };
  return <span className={`state-badge ${state}`}>{labels[state]}</span>;
}

function CandidateList({
  candidates,
}: {
  candidates: CandidateReviewModel["candidates"];
}) {
  return (
    <section className="candidate-column" aria-labelledby="candidate-list-heading">
      <div className="column-title">
        <div>
          <p className="eyebrow">4 observed goals</p>
          <h2 id="candidate-list-heading">Proposed tools</h2>
        </div>
        <span className="count-badge">3 eligible</span>
      </div>
      <div className="candidate-list">
        {candidates.map((candidate) => (
          <article
            className={`candidate-card${candidate.selected ? " is-selected" : ""}${
              candidate.state === "not-exposed" ? " is-excluded" : ""
            }`}
            key={candidate.name}
          >
            <div className="candidate-card-topline">
              <code>{candidate.name}</code>
              <StateBadge state={candidate.state} />
            </div>
            <p>{candidate.summary}</p>
            <span className="evidence-pointer">
              <Eye size={13} /> {candidate.evidence}
            </span>
            {candidate.state === "not-exposed" && (
              <span className="boundary-note">
                <LockKeyhole size={13} /> Visible UI only
              </span>
            )}
          </article>
        ))}
      </div>
      <p className="mobile-candidate-meta">
        3 candidates · <code>finalize_booking</code> not exposed
      </p>
    </section>
  );
}

function EvidenceSection({
  icon,
  title,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`evidence-section ${className}`}>
      <h3>
        <span className="section-icon">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function QualityEvidence({
  quality,
  selectedMode,
}: {
  quality: CandidateReviewModel["quality"];
  selectedMode: ResponseModeId;
}) {
  const selectedLabel = RESPONSE_MODES.find((mode) => mode.id === selectedMode)?.label;
  const presentation = getReviewModeConfiguration(selectedMode);
  const sectionRenderers: Record<QualitySectionKey, () => ReactNode> = {
    facts: () => (
      <EvidenceSection icon={<CheckCircle2 size={16} />} title="Facts">
        <BulletList items={quality.facts} />
      </EvidenceSection>
    ),
    evidence: () => (
      <EvidenceSection icon={<ClipboardCheck size={16} />} title="Evidence">
        <BulletList items={quality.evidence} />
      </EvidenceSection>
    ),
    assumptions: () => (
      <EvidenceSection icon={<CircleDashed size={16} />} title="Assumptions">
        <BulletList items={quality.assumptions} />
      </EvidenceSection>
    ),
    unknowns: () => (
      <EvidenceSection icon={<HelpCircle size={16} />} title="Unknowns">
        <BulletList items={quality.unknowns} />
      </EvidenceSection>
    ),
    confidence: () => (
      <EvidenceSection icon={<ShieldCheck size={16} />} title="Confidence">
        <p>
          <strong>{Math.round(quality.confidence.score * 100)}%</strong>{" "}
          — {quality.confidence.rationale}
        </p>
      </EvidenceSection>
    ),
    risks: () => (
      <EvidenceSection
        className="risk-section"
        icon={<AlertTriangle size={16} />}
        title="Risks"
      >
        <BulletList items={quality.risks} />
      </EvidenceSection>
    ),
    counterarguments: () => (
      <EvidenceSection icon={<ArrowLeft size={16} />} title="Counterarguments">
        <BulletList items={quality.counterarguments} />
      </EvidenceSection>
    ),
    recommendation: () => (
      <EvidenceSection
        className="recommendation-section"
        icon={<ArrowRight size={16} />}
        title="Recommendation"
      >
        <p>{quality.recommendation.text}</p>
        <BulletList items={quality.recommendation.tradeoffs} />
      </EvidenceSection>
    ),
    changeConditions: () => (
      <EvidenceSection
        className="wide-section"
        icon={<Sparkles size={16} />}
        title="What would change it"
      >
        <BulletList items={quality.changeConditions} />
      </EvidenceSection>
    ),
  };

  return (
    <section className="evidence-column" data-testid="quality-evidence">
      <div className="column-title evidence-column-title">
        <div>
          <p className="eyebrow">Accuracy and evidence</p>
          <h2>Why this capability exists</h2>
        </div>
        <span className="confidence-chip">
          {Math.round(quality.confidence.score * 100)}% confidence
        </span>
      </div>
      <div className="mode-context">
        <Info size={16} />
        <span>
          <strong>{selectedLabel}</strong> {presentation.emphasis}
          <small className="mode-prompt-route">
            Prompt route: {presentation.prompt.title} · v
            {presentation.prompt.version}
            {presentation.supplementaryPrompt
              ? ` + ${presentation.supplementaryPrompt.title} · v${presentation.supplementaryPrompt.version}`
              : null}
          </small>
        </span>
      </div>
      <div className="evidence-grid">
        {presentation.sectionOrder.map((section) => (
          <Fragment key={section}>{sectionRenderers[section]()}</Fragment>
        ))}
      </div>
    </section>
  );
}

function ContractPanel() {
  const [tab, setTab] = useState<"contract" | "binding" | "tests">("contract");
  return (
    <aside
      aria-label="Generated tool contract"
      className="contract-column"
      id="tool-contract"
      tabIndex={-1}
    >
      <div className="column-title">
        <div>
          <p className="eyebrow">Generated artifact</p>
          <h2>Tool contract</h2>
        </div>
        <Code2 size={19} />
      </div>
      <div className="contract-tabs" role="tablist" aria-label="Contract details">
        {(["contract", "binding", "tests"] as const).map((value) => (
          <button
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            key={value}
            onClick={() => setTab(value)}
            role="tab"
            type="button"
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      {tab === "contract" && <pre className="contract-code">{CONTRACT_JSON}</pre>}
      {tab === "binding" && (
        <div className="panel-copy">
          <p className="panel-label">Trusted handler</p>
          <code>booking.stageBooking</code>
          <p>Runtime validation reuses the same synthetic booking rules as the form.</p>
          <div className="pass-row">
            <CheckCircle2 size={16} /> Fixed local binding
          </div>
        </div>
      )}
      {tab === "tests" && (
        <div className="panel-copy">
          <p className="panel-label">Required postcondition</p>
          <code>booking_draft_updated</code>
          <p>The visible draft must match the validated service, date, and time.</p>
          <div className="pass-row">
            <CheckCircle2 size={16} /> Final submission absent
          </div>
        </div>
      )}
      <div className="contract-risk">
        <AlertTriangle size={17} />
        <div>
          <strong>State-changing and reversible</strong>
          <span>Human review is required before preview.</span>
        </div>
      </div>
    </aside>
  );
}

function CandidateScreen({
  decision,
  mode,
  reviewModel,
  scanHash,
  onApprove,
  onReject,
  onModeChange,
}: {
  decision: ReviewDecision;
  mode: ResponseModeId;
  reviewModel: CandidateReviewModel;
  scanHash: string;
  onApprove: () => void;
  onReject: () => void;
  onModeChange: (mode: ResponseModeId) => void;
}) {
  const approved = decision === "approved";
  const reviewContract = () => {
    const contract = document.getElementById("tool-contract");
    contract?.scrollIntoView({ behavior: "smooth", block: "center" });
    contract?.focus({ preventScroll: true });
  };

  return (
    <div className="screen-content candidate-screen">
      <div className="screen-intro">
        <div>
          <p className="eyebrow">2 of 5 · Candidates</p>
          <h1>Candidate capabilities</h1>
          <p>Review what was observed before tools are generated.</p>
        </div>
        <div className="intro-status-stack">
          <span className="snapshot-chip">
            <CheckCircle2 size={16} /> Passive snapshot verified
          </span>
          <span className="hash-chip">
            <Hash size={14} /> Source fingerprint · {scanHash.slice(0, 12)}
          </span>
        </div>
      </div>
      <ReviewModeSelector selected={mode} onSelect={onModeChange} />
      <div className="candidate-workbench">
        <CandidateList candidates={reviewModel.candidates} />
        <QualityEvidence quality={reviewModel.quality} selectedMode={mode} />
        <ContractPanel />
      </div>
      <div className="decision-bar">
        <div className="decision-status" aria-live="polite">
          {approved ? (
            <>
              <CheckCircle2 size={18} /> Exact candidate version approved for preview
            </>
          ) : decision === "rejected" ? (
            <>
              <X size={18} /> Candidate rejected for this session
            </>
          ) : (
            <>
              <Info size={18} /> Approval applies only to this contract version
            </>
          )}
        </div>
        <div className="decision-actions">
          <button
            className="danger-quiet-button"
            onClick={onReject}
            type="button"
          >
            <X size={16} /> Reject
          </button>
          <button
            className="secondary-button"
            onClick={reviewContract}
            type="button"
          >
            <Code2 size={16} /> Review contract
          </button>
          <button
            className="primary-button"
            disabled={approved}
            onClick={onApprove}
            type="button"
          >
            {approved ? <Check size={17} /> : <ArrowRight size={17} />}
            {approved ? "Approved for preview" : "Approve for preview"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScanScreen({
  authorized,
  scanning,
  error,
  onAuthorizationChange,
  onScan,
}: {
  authorized: boolean;
  scanning: boolean;
  error: string | null;
  onAuthorizationChange: (authorized: boolean) => void;
  onScan: () => void;
}) {
  return (
    <div className="screen-content scan-screen">
      <div className="screen-intro">
        <div>
          <p className="eyebrow">1 of 5 · Scan</p>
          <h1>Scan owned fixture</h1>
          <p>Inspect a bundled synthetic snapshot without contacting an external site.</p>
        </div>
        <span className="snapshot-chip">
          <ShieldCheck size={16} /> Snapshot-only boundary
        </span>
      </div>

      <div className="scan-workbench">
        <section className="scan-card" aria-labelledby="scan-source-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Owner-controlled source</p>
              <h2 id="scan-source-heading">Bundled synthetic snapshot</h2>
            </div>
            <Globe2 size={20} />
          </div>
          <div className="scan-card-body">
            <label>
              Fixture URL
              <input readOnly value="https://legacy-booking.test" />
            </label>
            <label className="authorization-check">
              <input
                checked={authorized}
                onChange={(event) => onAuthorizationChange(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>I am authorized to analyze this fixture.</strong>
                This approval is limited to the bundled, entrant-controlled snapshot.
              </span>
            </label>
            <div className="scan-boundary-callout">
              <ShieldCheck size={20} />
              <div>
                <strong>No credentials, remote fetches, or scripts</strong>
                <span>The parser observes structure inertly and keeps only redacted evidence.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="scan-card" aria-labelledby="scan-capture-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Deterministic intake</p>
              <h2 id="scan-capture-heading">What the scan retains</h2>
            </div>
            <Search size={20} />
          </div>
          <ul className="retention-list">
            <li><CheckCircle2 size={17} /> Control roles and field names</li>
            <li><CheckCircle2 size={17} /> Form and action relationships</li>
            <li><CheckCircle2 size={17} /> Reversible versus final boundaries</li>
            <li><CheckCircle2 size={17} /> A SHA-256 source fingerprint</li>
          </ul>
          <div className="unknowns-panel">
            <HelpCircle size={18} />
            <div>
              <strong>Intentionally unknown</strong>
              <span>Production authorization, inventory, billing, and side effects are not inferred.</span>
            </div>
          </div>
        </section>
      </div>

      <div className="decision-bar">
        <div className={`decision-status${error ? " has-error" : ""}`} role={error ? "alert" : undefined}>
          {error ? <AlertTriangle size={18} /> : <Info size={18} />}
          {error ?? "Scan analyzes only the included fixture snapshot"}
        </div>
        <div className="decision-actions">
          <button
            className="primary-button"
            disabled={!authorized || scanning}
            onClick={onScan}
            type="button"
          >
            {scanning ? <RefreshCw className="spin" size={17} /> : <Search size={17} />}
            {scanning ? "Scanning owned fixture" : "Scan owned fixture"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewScreen({
  proposalHash,
  versionHash,
  registration,
  draft,
  onContinue,
}: {
  proposalHash: string;
  versionHash: string;
  registration: RegistrationState;
  draft: BookingDraft | null;
  onContinue: () => void;
}) {
  return (
    <div className="screen-content preview-screen">
      <div className="screen-intro validate-intro">
        <div>
          <p className="eyebrow">3 of 5 · Preview</p>
          <h1>Preview generated retrofit</h1>
          <p>Review the exact allowlisted version before the validation runtime is locked.</p>
        </div>
        <RegistrationBadge state={registration} />
      </div>

      <div className="version-strip">
        <span><strong>Approved proposal</strong> {proposalHash.slice(0, 12)}</span>
        <span><strong>Version hash</strong> {versionHash.slice(0, 12)}</span>
        <span><strong>Generated tools</strong> 3</span>
      </div>

      <div className="preview-workbench">
        <section className="tool-inventory-card" aria-labelledby="preview-tools-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Fixed allowlist</p>
              <h2 id="preview-tools-heading">Selected tools</h2>
            </div>
            <span className="count-badge">3</span>
          </div>
          <div className="preview-tool-list">
            {BOOKING_TOOL_NAMES.map((toolName, index) => (
              <div key={toolName}>
                <span className="activity-index">{index + 1}</span>
                <code>{toolName}</code>
                <span className={toolName === "stage_booking" ? "state-badge needs-review" : "state-badge read-only"}>
                  {toolName === "stage_booking" ? "Reversible draft" : "Read only"}
                </span>
              </div>
            ))}
          </div>
          <div className="excluded-tool">
            <LockKeyhole size={17} />
            <div>
              <strong>finalize_booking not exposed</strong>
              <span>Final confirmation remains on the visible interface.</span>
            </div>
          </div>
        </section>

        <section className="generated-code-card" aria-labelledby="generated-code-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Generated adapter</p>
              <h2 id="generated-code-heading">Top-level WebMCP registration</h2>
            </div>
            <FileCode2 size={20} />
          </div>
          <pre>{PREVIEW_CODE}</pre>
        </section>

        <aside className="preview-evidence-card" aria-label="Preview evidence">
          <div className="column-title">
            <div>
              <p className="eyebrow">Version-bound evidence</p>
              <h2>Runtime boundary</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <dl>
            <div><dt>Registration</dt><dd><RegistrationBadge state={registration} /></dd></div>
            <div><dt>Visible draft</dt><dd>{draft ? draft.id : "Awaiting tool or UI staging"}</dd></div>
            <div><dt>Unknowns</dt><dd>Registration is deferred until the version is locked for Validate.</dd></div>
          </dl>
          <div className="scan-boundary-callout warning-tone">
            <AlertTriangle size={19} />
            <div>
              <strong>Rescanning invalidates this approval</strong>
              <span>Validation and export stay bound to the hashes shown above.</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="decision-bar">
        <div className="decision-status">
          <Hash size={18} /> Approval is bound to version {versionHash.slice(0, 12)}
        </div>
        <div className="decision-actions">
          <button className="primary-button" onClick={onContinue} type="button">
            Lock version for validation <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistrationBadge({ state }: { state: RegistrationState }) {
  const copy: Record<RegistrationState, string> = {
    idle: "Registration deferred to Validate",
    registering: "Registering 3 tools",
    registered: "3 live tools registered",
    unsupported: "Live discovery unavailable",
    failed: "Registration failed closed",
  };
  return (
    <span className={`registration-badge ${state}`}>
      {state === "registered" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
      {copy[state]}
    </span>
  );
}

function ToolActivity({
  draft,
  draftSource,
}: {
  draft: BookingDraft | null;
  draftSource: DraftSource | null;
}) {
  const toolDraftObserved = Boolean(draft && draftSource === "tool");
  return (
    <section className="activity-card" aria-labelledby="activity-heading">
      <div className="column-title">
        <div>
          <p className="eyebrow">Human and agent sync</p>
          <h2 id="activity-heading">Tool activity</h2>
        </div>
        <Blocks size={19} />
      </div>
      <ol className="activity-list">
        <li>
          <span className="activity-index">1</span>
          <div>
            <code>search_services</code>
            <p>Returns the bounded synthetic service catalog.</p>
          </div>
          <span className="ready-pill">Ready</span>
        </li>
        <li>
          <span className="activity-index">2</span>
          <div>
            <code>get_availability</code>
            <p>Reads fixed dates and times for one service.</p>
          </div>
          <span className="ready-pill">Ready</span>
        </li>
        <li className={toolDraftObserved ? "is-current" : ""}>
          <span className="activity-index">3</span>
          <div>
            <code>stage_booking</code>
            <p>
              {toolDraftObserved
                ? "Visible postcondition observed in the booking preview."
                : draftSource === "visible-ui"
                  ? "A visible-UI draft exists; no agent call was observed."
                  : "Waiting for a validated draft request."}
            </p>
          </div>
          <span className={toolDraftObserved ? "passed-pill" : "ready-pill"}>
            {toolDraftObserved ? "Observed" : "Ready"}
          </span>
        </li>
      </ol>
      <div className="boundary-callout">
        <LockKeyhole size={18} />
        <div>
          <strong>Final booking remains outside WebMCP</strong>
          <span>Confirmation must use the visible control.</span>
        </div>
      </div>
    </section>
  );
}

function ValidationResults({
  registration,
  report,
  running,
  runError,
}: {
  registration: RegistrationState;
  report: DeterministicReport | null;
  running: boolean;
  runError: string | null;
}) {
  const resultById = new Map(report?.checks.map((check) => [check.id, check]));
  const heading = running
    ? "Running checks"
    : report
      ? `${report.passed}/${report.total} passed`
      : runError
        ? "Check run failed"
        : "Not run";
  const score = report
    ? `${Math.round((report.passed / report.total) * 100)}%`
    : running
      ? "…"
      : "—";

  return (
    <aside className="validation-card" aria-labelledby="validation-results-heading">
      <div className="validation-score">
        <div>
          <p className="eyebrow">Deterministic suite</p>
          <h2 id="validation-results-heading">{heading}</h2>
        </div>
        <span className="score-ring">{score}</span>
      </div>
      <div className="test-list">
        {DETERMINISTIC_CHECKS.map((check) => {
          const result = resultById.get(check.id);
          const status = running ? "running" : (result?.status ?? "pending");
          return (
          <div className={`test-row ${status}`} key={check.id}>
            {status === "passed" ? (
              <CheckCircle2 size={16} />
            ) : status === "failed" ? (
              <X size={16} />
            ) : (
              <CircleDashed size={16} />
            )}
            <span>{check.label}</span>
            <strong>{status}</strong>
          </div>
          );
        })}
      </div>
      {report && (
        <p className="execution-note">
          Executed in this session at {report.executedAt.slice(11, 19)} UTC.
        </p>
      )}
      {runError && <p className="validation-error">{runError}</p>}
      <div className="live-check">
        <span>Live browser discovery</span>
        <RegistrationBadge state={registration} />
      </div>
      {registration === "unsupported" && (
        <p className="unsupported-note">
          The ordinary human interface remains active. Live Site Tools UAT requires a
          compatible browser.
        </p>
      )}
    </aside>
  );
}

function ValidateScreen({
  registration,
  draft,
  draftSource,
  presenceReceipt,
  presenceVerifier,
  validationReport,
  validationRunning,
  validationError,
  liveUatRecorded,
  onRunValidation,
  onRecordLiveUat,
  onContinue,
  onStage,
  onValuesChanged,
  onConfirmed,
}: {
  registration: RegistrationState;
  draft: BookingDraft | null;
  draftSource: DraftSource | null;
  presenceReceipt: PresenceReceipt | null;
  presenceVerifier: HumanPresenceVerifier;
  validationReport: DeterministicReport | null;
  validationRunning: boolean;
  validationError: string | null;
  liveUatRecorded: boolean;
  onRunValidation: () => void;
  onRecordLiveUat: () => void;
  onContinue: () => void;
  onStage: (input: { serviceId: ServiceId; date: string; time: string }) => void;
  onValuesChanged: () => void;
  onConfirmed: (receipt: PresenceReceipt) => void;
}) {
  const validationPassed =
    validationReport !== null &&
    isPassingDeterministicReport(validationReport);
  const canRecordLiveUat = validationPassed && registration === "registered";

  return (
    <div className="screen-content validate-screen">
      <div className="screen-intro validate-intro">
        <div>
          <p className="eyebrow">4 of 5 · Validate</p>
          <h1>Validate generated tools</h1>
          <p>Prove discovery, execution, visible state, and postconditions before export.</p>
        </div>
        <RegistrationBadge state={registration} />
      </div>
      <div className="validation-workbench">
        <BookingPreview
          draft={draft}
          draftSource={draftSource}
          onConfirmed={onConfirmed}
          presenceReceipt={presenceReceipt}
          presenceVerifier={presenceVerifier}
          onStage={onStage}
          onValuesChanged={onValuesChanged}
        />
        <ToolActivity draft={draft} draftSource={draftSource} />
        <ValidationResults
          registration={registration}
          report={validationReport}
          runError={validationError}
          running={validationRunning}
        />
        <section
          className="live-uat-card"
          data-testid="live-uat-evidence"
          aria-labelledby="live-uat-heading"
        >
          <div className="column-title">
            <div>
              <p className="eyebrow">Separate evidence class</p>
              <h2 id="live-uat-heading">Live-client UAT</h2>
            </div>
            <Globe2 size={20} />
          </div>
          <div className="uat-status-row">
            {liveUatRecorded ? <CheckCircle2 size={19} /> : <CircleDashed size={19} />}
            <div>
              <strong>{liveUatRecorded ? "Operator attestation recorded" : "Not verified"}</strong>
              <span>
                Registration and deterministic checks do not prove agent discovery or selection.
              </span>
            </div>
          </div>
          <ul>
            <li>Discover all three allowlisted tools in the current browser.</li>
            <li>Invoke <code>stage_booking</code> and observe the visible draft update.</li>
            <li>Confirm that <code>finalize_booking</code> is absent.</li>
          </ul>
          <button
            className="secondary-button"
            disabled={!canRecordLiveUat || liveUatRecorded}
            onClick={onRecordLiveUat}
            type="button"
          >
            <ClipboardCheck size={16} />
            {liveUatRecorded ? "Current-browser UAT recorded" : "Record current-browser UAT"}
          </button>
          {registration !== "registered" && (
            <p className="unsupported-note">
              Enable WebMCP in a compatible browser before recording this evidence.
            </p>
          )}
        </section>
      </div>
      <div className="decision-bar validation-actions-bar">
        <div className="decision-status">
          <ShieldCheck size={18} /> Export requires eight passing checks and current-browser UAT
        </div>
        <div className="decision-actions">
          <button
            className="secondary-button"
            disabled={validationRunning}
            onClick={onRunValidation}
            type="button"
          >
            <TestTube2 size={16} />
            {validationRunning
              ? "Running deterministic checks"
              : validationReport
                ? "Rerun deterministic checks"
                : "Run deterministic checks"}
          </button>
          <button
            className="primary-button"
            disabled={!validationPassed || !liveUatRecorded}
            onClick={onContinue}
            type="button"
          >
            Continue to export <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportScreen({
  bundle,
  approved,
  downloading,
  error,
  onApprovalChange,
  onDownload,
}: {
  bundle: ExportBundle;
  approved: boolean;
  downloading: boolean;
  error: string | null;
  onApprovalChange: (approved: boolean) => void;
  onDownload: () => void;
}) {
  return (
    <div className="screen-content export-screen">
      <div className="screen-intro">
        <div>
          <p className="eyebrow">5 of 5 · Export</p>
          <h1>Export retrofit package</h1>
          <p>Review the evidence-bound clean-room package before downloading it.</p>
        </div>
        <span className="snapshot-chip">
          <PackageCheck size={16} /> Ready for owner-controlled integration
        </span>
      </div>

      <div className="export-boundary-banner">
        <ShieldCheck size={22} />
        <div>
          <strong>Export does not deploy or publish.</strong>
          <span>You decide where the generated adapter is reviewed and integrated.</span>
        </div>
      </div>

      <div className="export-workbench">
        <section className="readiness-card" aria-labelledby="readiness-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Release gate</p>
              <h2 id="readiness-heading">Readiness checklist</h2>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <ul className="retention-list">
            <li><CheckCircle2 size={17} /> 8 of 8 deterministic checks passed</li>
            <li><CheckCircle2 size={17} /> Current-browser UAT attestation recorded</li>
            <li><CheckCircle2 size={17} /> Exactly three allowlisted tools</li>
            <li><CheckCircle2 size={17} /> Final confirmation excluded</li>
          </ul>
        </section>

        <section className="manifest-card" aria-labelledby="manifest-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Clean-room output</p>
              <h2 id="manifest-heading">Package manifest</h2>
            </div>
            <FileCheck2 size={20} />
          </div>
          <div className="manifest-list">
            {bundle.files.map((file) => (
              <div key={file.path}>
                <FileCode2 size={16} />
                <span>{file.path}</span>
                <code>{file.sha256.slice(0, 10)}</code>
              </div>
            ))}
          </div>
        </section>

        <aside className="integrity-card" aria-labelledby="integrity-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Exact artifact approval</p>
              <h2 id="integrity-heading">Integrity</h2>
            </div>
            <Hash size={20} />
          </div>
          <p className="bundle-hash"><span>Bundle SHA-256</span><code>{bundle.bundleHash}</code></p>
          <label className="authorization-check bundle-approval">
            <input
              checked={approved}
              disabled={downloading}
              onChange={(event) => onApprovalChange(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>I approve this exact bundle hash.</strong>
              A changed bundle requires a new approval.
            </span>
          </label>
          <div className="unknowns-panel">
            <HelpCircle size={18} />
            <div>
              <strong>Still requires integrator review</strong>
              <span>Production authentication, authorization, CSP, and backend behavior remain site-specific.</span>
            </div>
          </div>
        </aside>
      </div>

      {error && (
        <div className="validation-error" role="alert">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      <div className="decision-bar">
        <div className="decision-status">
          <LockKeyhole size={18} /> Download is local and performs no network request
        </div>
        <div className="decision-actions">
          <button
            className="primary-button"
            disabled={!approved || downloading}
            onClick={onDownload}
            type="button"
          >
            <Download size={17} />
            {downloading ? "Verifying exact bundle" : "Download retrofit package"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [scanError, setScanError] = useState<string | null>(null);
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
  const runtimeActive = screen === "validate";

  const handleDraftStaged = useCallback((nextDraft: BookingDraft) => {
    setDraft(nextDraft);
    setDraftSource("tool");
    setPresenceReceipt(null);
  }, []);

  const modelContext = useMemo(() => {
    if (typeof document === "undefined") return undefined;
    return document.modelContext;
  }, []);

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

  const handleScan = useCallback(() => {
    if (!authorized || scanning) return;
    exportRequestIdRef.current += 1;
    setScanning(true);
    setScanError(null);
    void rescanOwnedFixture(workflow)
      .then((nextWorkflow) => {
        setWorkflow(nextWorkflow);
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
        setScreen("candidates");
      })
      .catch(() => {
        setScanError("The inert snapshot scan could not complete; no evidence was retained.");
      })
      .finally(() => setScanning(false));
  }, [authorized, scanning, workflow]);

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
          approved={approved}
          onNavigate={navigate}
          previewReady={previewReady}
          scanComplete={workflow.scan !== null}
          screen={screen}
          validated={exportReady}
        />
        )}
        <main>
          {screen === "scan" && (
            <ScanScreen
              authorized={authorized}
              error={scanError}
              onAuthorizationChange={setAuthorized}
              onScan={handleScan}
              scanning={scanning}
            />
          )}
          {screen === "candidates" && workflow.scan && candidateReviewModel && (
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
          {screen === "preview" && workflow.proposal && workflow.preview && (
            <PreviewScreen
              draft={draft}
              onContinue={lockForValidation}
              proposalHash={workflow.proposal.proposalHash}
              registration={registration}
              versionHash={workflow.proposal.versionHash}
            />
          )}
          {screen === "validate" && (
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
          {screen === "export" && exportBundle && (
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
