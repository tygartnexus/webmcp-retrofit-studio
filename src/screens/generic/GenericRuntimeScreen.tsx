import { ArrowRight, CheckCircle2, CircleDashed, LockKeyhole, Play, ShieldCheck, Terminal } from "lucide-react";
import { useState } from "react";
import { describeReceipt } from "../BookingPreview";
import type { GenericFlow, GenericRegistrationState } from "./useGenericFlow";

/**
 * Step 3 for a generic proposal: the reviewed tools go live in the page's
 * model context, a console lets the owner call them exactly as an agent
 * would, and every staged write waits for a passkey gesture.
 */

interface GenericRuntimeScreenProps {
  flow: GenericFlow;
  onContinue: () => void;
}

function registrationCopy(state: GenericRegistrationState, count: number): string {
  switch (state) {
    case "registering":
      return `Registering ${count} tool${count === 1 ? "" : "s"}`;
    case "registered":
      return `${count} live tool${count === 1 ? "" : "s"} registered`;
    case "unsupported":
      return "Live discovery unavailable";
    case "failed":
      return "Registration failed closed";
    default:
      return "Registration idle";
  }
}

export function GenericRegistrationBadge({ state, count }: { state: GenericRegistrationState; count: number }) {
  return (
    <span className={`registration-badge ${state}`}>
      {state === "registered" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
      {registrationCopy(state, count)}
    </span>
  );
}

function ToolConsole({ flow }: { flow: GenericFlow }) {
  const names = flow.tools.map((tool) => tool.name);
  const [selected, setSelected] = useState(names[0] ?? "");
  const [input, setInput] = useState(() => (names[0] ? flow.sampleInputFor(names[0]) : "{}"));
  const [busy, setBusy] = useState(false);

  const choose = (name: string) => {
    setSelected(name);
    setInput(flow.sampleInputFor(name));
  };

  const run = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await flow.invoke(selected, input);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="scan-card console-card" aria-labelledby="console-heading">
      <div className="column-title">
        <div>
          <p className="eyebrow">Call tools as an agent would</p>
          <h2 id="console-heading">Tool console</h2>
        </div>
        <Terminal size={20} />
      </div>
      {names.length === 0 ? (
        <p className="muted">No tools were proposed for this page.</p>
      ) : (
        <div className="console-form">
          <label>
            Tool
            <select aria-label="Tool" onChange={(event) => choose(event.target.value)} value={selected}>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Input JSON
            <textarea aria-label="Input JSON" onChange={(event) => setInput(event.target.value)} rows={5} value={input} />
          </label>
          <button className="secondary-button" disabled={busy} onClick={() => void run()} type="button">
            <Play size={16} /> {busy ? "Invoking" : "Invoke"}
          </button>
        </div>
      )}
      <ol className="call-log" aria-label="Call log">
        {flow.log.map((entry) => (
          <li className={entry.error ? "has-error" : ""} key={entry.id}>
            <div>
              <code>{entry.toolName}</code>
              <span>{entry.at.slice(11, 19)} UTC</span>
            </div>
            <pre>{entry.error ?? entry.output}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StagedChanges({ flow }: { flow: GenericFlow }) {
  return (
    <section className="scan-card staged-card" aria-labelledby="staged-heading">
      <div className="column-title">
        <div>
          <p className="eyebrow">Human confirmation boundary</p>
          <h2 id="staged-heading">Staged changes</h2>
        </div>
        <LockKeyhole size={20} />
      </div>
      <p className="muted">
        Not a WebMCP tool. Each staged write needs a device gesture no agent can perform. This build records the
        receipt and performs no submission.
      </p>
      {flow.staged.length === 0 ? (
        <p className="muted">Nothing staged yet. Invoke a write tool to stage a change.</p>
      ) : (
        <ul className="staged-list">
          {flow.staged.map(({ change, receipt, failure, verifying, superseded }) => (
            <li key={change.id}>
              <div>
                <strong>{change.actionLabel}</strong>
                <span className="muted">
                  {change.toolName} · {Object.keys(change.fields).length} field
                  {Object.keys(change.fields).length === 1 ? "" : "s"}
                </span>
              </div>
              {receipt ? (
                <p className="confirmed-note">
                  <CheckCircle2 size={15} /> Confirmed · {describeReceipt(receipt)}
                </p>
              ) : superseded ? (
                <p className="muted">Superseded by a later change to the same form. Confirm the latest change.</p>
              ) : (
                <button
                  className="primary-button"
                  disabled={verifying}
                  onClick={() => void flow.confirm(change.id)}
                  type="button"
                >
                  <ShieldCheck size={16} /> {verifying ? "Waiting for your device" : "Confirm with passkey"}
                </button>
              )}
              {failure && <p className="validation-error" role="alert">{failure}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GenericRuntimeScreen({ flow, onContinue }: GenericRuntimeScreenProps) {
  const count = flow.outcome?.proposal.tools.length ?? 0;
  return (
    <div className="screen-content validate-screen">
      <div className="screen-intro validate-intro">
        <div>
          <p className="eyebrow">3 of 5 · Preview</p>
          <h1>Generic tools live</h1>
          <p>The reviewed tools are registered against an inert copy of the page. Call them, stage a change, confirm it.</p>
        </div>
        <GenericRegistrationBadge count={count} state={flow.registration} />
      </div>
      <div className="generic-runtime-workbench">
        <ToolConsole flow={flow} />
        <StagedChanges flow={flow} />
      </div>
      <div className="decision-bar">
        <div className="decision-status">
          <ShieldCheck size={18} /> Writes only stage. Finalizing and credential actions were never registered.
        </div>
        <div className="decision-actions">
          <button className="primary-button" onClick={onContinue} type="button">
            Continue to validate <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
