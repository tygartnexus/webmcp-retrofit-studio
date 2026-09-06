import type { CandidateReviewModel, CandidateState } from "../../data/candidates";
import {
  type QualitySectionKey,
  RESPONSE_MODES,
  type ResponseModeId,
  isResponseModeId,
} from "../../quality/responseQuality";
import { getReviewModeConfiguration } from "../../quality/reviewModes";
import { STAGE_BOOKING_TOOL_CONTRACT } from "../../webmcp/bookingToolContracts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Code2,
  Eye,
  Hash,
  HelpCircle,
  Info,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

/** Step 2 of the booking flow: candidate review, quality evidence, and the contract panel. */

export type ReviewDecision = "pending" | "approved" | "rejected";

const CONTRACT_JSON = JSON.stringify(STAGE_BOOKING_TOOL_CONTRACT, null, 2);

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

export function CandidateScreen({
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
