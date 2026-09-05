import { ArrowRight, CheckCircle2, CircleDashed, ShieldCheck, TestTube2, X } from "lucide-react";
import { GENERIC_CHECKS } from "../../validation/runGenericChecks";
import { GenericRegistrationBadge } from "./GenericRuntimeScreen";
import type { GenericFlow } from "./useGenericFlow";

/** Step 4 for a generic proposal: the nine deterministic checks. */

interface GenericValidateScreenProps {
  flow: GenericFlow;
  onContinue: () => void;
}

export function GenericValidateScreen({ flow, onContinue }: GenericValidateScreenProps) {
  const { report, checksRunning, checkError } = flow;
  const resultById = new Map(report?.checks.map((check) => [check.id, check]));
  const heading = checksRunning
    ? "Running checks"
    : report
      ? `${report.passed}/${report.total} passed`
      : checkError
        ? "Check run failed"
        : "Not run";
  const score = report ? `${Math.round((report.passed / report.total) * 100)}%` : checksRunning ? "…" : "—";
  const confirmed = flow.staged.filter((entry) => entry.receipt).length;
  const count = flow.outcome?.proposal.tools.length ?? 0;

  return (
    <div className="screen-content validate-screen">
      <div className="screen-intro validate-intro">
        <div>
          <p className="eyebrow">4 of 5 · Validate</p>
          <h1>Validate generic tools</h1>
          <p>Nine deterministic checks run against a fresh inert copy of the page.</p>
        </div>
        <GenericRegistrationBadge count={count} state={flow.registration} />
      </div>
      <div className="generic-validate-workbench">
        <aside className="validation-card" aria-labelledby="generic-validation-heading">
          <div className="validation-score">
            <div>
              <p className="eyebrow">Deterministic suite</p>
              <h2 id="generic-validation-heading">{heading}</h2>
            </div>
            <span className="score-ring">{score}</span>
          </div>
          <div className="test-list">
            {GENERIC_CHECKS.map((check) => {
              const result = resultById.get(check.id);
              const status = checksRunning ? "running" : (result?.status ?? "pending");
              return (
                <div className={`test-row ${status}`} key={check.id} title={result?.detail}>
                  {status === "passed" ? <CheckCircle2 size={16} /> : status === "failed" ? <X size={16} /> : <CircleDashed size={16} />}
                  <span>{check.label}</span>
                  <strong>{status}</strong>
                </div>
              );
            })}
          </div>
          {report && (
            <p className="execution-note">
              Executed in this session at {report.executedAt.slice(11, 19)} UTC against proposal{" "}
              {report.proposalHash.slice(0, 12)}.
            </p>
          )}
          {report &&
            report.checks
              .filter((check) => check.status === "failed")
              .map((check) => (
                <p className="validation-error" key={check.id}>
                  {check.label}: {check.detail}
                </p>
              ))}
          {checkError && <p className="validation-error">{checkError}</p>}
        </aside>
        <section className="live-uat-card" aria-labelledby="generic-evidence-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Recorded in this session</p>
              <h2 id="generic-evidence-heading">Human confirmations</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="uat-status-row">
            {confirmed > 0 ? <CheckCircle2 size={19} /> : <CircleDashed size={19} />}
            <div>
              <strong>
                {confirmed} of {flow.staged.length} staged change{flow.staged.length === 1 ? "" : "s"} confirmed
              </strong>
              <span>Receipts are PII-free and travel with the export evidence. None is required to export.</span>
            </div>
          </div>
        </section>
      </div>
      <div className="decision-bar validation-actions-bar">
        <div className="decision-status">
          <ShieldCheck size={18} /> Export requires all nine checks to pass for this exact proposal
        </div>
        <div className="decision-actions">
          <button className="secondary-button" disabled={checksRunning} onClick={flow.runChecks} type="button">
            <TestTube2 size={16} />
            {checksRunning ? "Running deterministic checks" : report ? "Rerun deterministic checks" : "Run deterministic checks"}
          </button>
          <button className="primary-button" disabled={!flow.validated} onClick={onContinue} type="button">
            Continue to export <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
