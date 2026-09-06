import { RegistrationBadge, type RegistrationState } from "../../components/RegistrationBadge";
import type { BookingDraft, ServiceId } from "../../domain/booking";
import type { HumanPresenceVerifier, PresenceReceipt } from "../../presence/humanPresence";
import {
  DETERMINISTIC_CHECKS,
  type DeterministicReport,
  isPassingDeterministicReport,
} from "../../validation/runDeterministicChecks";
import { BookingPreview, type DraftSource } from "../BookingPreview";
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  TestTube2,
  X,
} from "lucide-react";

/** Step 4 of the booking flow: live tools, deterministic checks, and current-browser UAT. */

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

export function ValidateScreen({
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
