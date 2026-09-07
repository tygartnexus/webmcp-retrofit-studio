import { ArrowLeft, ArrowRight, Check, CheckCircle2, Hash, Info, LockKeyhole, ShieldCheck, X } from "lucide-react";
import type { GenericProposal, ProposedTool } from "../discovery/inferGenericCapabilities";
import type { GenericScanResult } from "../discovery/scanHtml";

/**
 * Review of a generic proposal: what the inert scan observed, what the
 * inference proposed, and what stays off the tool surface. Approval is bound
 * to this exact proposal hash and unlocks the runtime step.
 */

interface GenericCandidateScreenProps {
  scan: GenericScanResult;
  proposal: GenericProposal;
  approved: boolean;
  onApprove: () => void;
  onReject: () => void;
  onBack: () => void;
}

interface ParameterRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

function parameterRows(tool: ProposedTool): readonly ParameterRow[] {
  const required = new Set(tool.inputSchema.required ?? []);
  return Object.entries(tool.inputSchema.properties).map(([name, schema]) => ({
    name,
    type: schema.enum ? `enum (${schema.enum.length} values)` : schema.type,
    required: required.has(name),
    description: schema.description,
  }));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function ToolCard({ tool }: { tool: ProposedTool }) {
  const rows = parameterRows(tool);
  return (
    <li className="candidate-card generic-tool-card">
      <div className="column-title">
        <div>
          <p className="eyebrow">{tool.riskClass === "read" ? "Read-only" : "State-changing, staged for review"}</p>
          <h3>
            <code>{tool.name}</code>
          </h3>
        </div>
        <span className={`risk-chip risk-${tool.riskClass}`}>{tool.riskClass}</span>
      </div>
      <p>{tool.description}</p>
      {rows.length === 0 ? (
        <p className="muted">No parameters.</p>
      ) : (
        <table className="parameter-table">
          <thead>
            <tr>
              <th scope="col">Parameter</th>
              <th scope="col">Type</th>
              <th scope="col">Required</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>
                  <code>{row.name}</code>
                </td>
                <td>{row.type}</td>
                <td>{row.required ? "yes" : "no"}</td>
                <td>{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tool.outputColumns && <p className="muted">Output columns: {tool.outputColumns.join(", ")}</p>}
    </li>
  );
}

export function GenericCandidateScreen({ scan, proposal, approved, onApprove, onReject, onBack }: GenericCandidateScreenProps) {
  const { safety } = scan;
  const nothingToApprove = proposal.tools.length === 0;
  return (
    <div className="screen-content candidate-screen">
      <div className="screen-intro">
        <div>
          <p className="eyebrow">2 of 5 · Candidates</p>
          <h1>Generic candidate capabilities</h1>
          <p>Proposed from an inert scan of “{scan.title}”. Approve to bring these tools live for review.</p>
        </div>
        <div className="intro-status-stack">
          <span className="snapshot-chip">
            <ShieldCheck size={16} /> Parsed inertly, {plural(safety.scriptsIgnored, "script")} ignored
          </span>
          <span className="hash-chip">
            <Hash size={14} /> Source fingerprint · {scan.scanHash.slice(0, 12)}
          </span>
          <span className="hash-chip">
            <Hash size={14} /> Proposal · {proposal.proposalHash.slice(0, 12)}
          </span>
        </div>
      </div>

      <div className="candidate-workbench generic-workbench">
        <section aria-labelledby="generic-tools-heading">
          <h2 id="generic-tools-heading">Proposed tools ({proposal.tools.length})</h2>
          {nothingToApprove ? (
            <p>No tool is proposed. Every observed capability was a credential or finalizing action.</p>
          ) : (
            <ul className="candidate-list">
              {proposal.tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="generic-excluded-heading" className="risk-section">
          <h2 id="generic-excluded-heading">Kept off the tool surface ({proposal.excluded.length})</h2>
          {proposal.excluded.length === 0 ? (
            <p>Nothing was excluded from this page.</p>
          ) : (
            <ul className="excluded-list">
              {proposal.excluded.map((item) => (
                <li key={item.capabilityId}>
                  <LockKeyhole size={16} />
                  <div>
                    <strong>{item.actionLabel}</strong>
                    <span className={`risk-chip risk-${item.riskClass}`}>{item.riskClass}</span>
                    <p>{item.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="unknowns-panel">
            <Info size={18} />
            <div>
              <strong>Safety envelope</strong>
              <span>
                {plural(safety.credentialFieldsExcluded, "credential field")}, {plural(safety.hiddenFieldsExcluded, "hidden field")},
                {" "}and {plural(safety.fileFieldsExcluded, "file field")} excluded;{" "}
                {plural(safety.navigationButtonsSkipped, "navigation button")} skipped. No raw values retained, no scripts
                executed, no network requests.
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="decision-bar">
        <div className="decision-status" role="status">
          {approved ? (
            <>
              <CheckCircle2 size={18} /> Exact proposal approved for runtime
            </>
          ) : (
            <>
              <Info size={18} /> Approval applies only to this proposal version. Excluded actions never register.
            </>
          )}
        </div>
        <div className="decision-actions">
          <button className="secondary-button" onClick={onBack} type="button">
            <ArrowLeft size={16} /> Back to scan
          </button>
          <button className="danger-quiet-button" onClick={onReject} type="button">
            <X size={16} /> Reject
          </button>
          <button className="primary-button" disabled={approved || nothingToApprove} onClick={onApprove} type="button">
            {approved ? <Check size={17} /> : <ArrowRight size={17} />}
            {approved ? "Approved for runtime" : "Approve for runtime"}
          </button>
        </div>
      </div>
    </div>
  );
}
