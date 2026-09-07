import { CheckCircle2, Download, FileCheck2, FileCode2, Hash, HelpCircle, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import type { GenericFlow } from "./useGenericFlow";

/** Step 5 for a generic proposal: the hash-bound package and its download. */

export function GenericExportScreen({ flow }: { flow: GenericFlow }) {
  const { bundle, bundleError, exportApproved, downloading, downloadError } = flow;
  const excluded = flow.outcome?.proposal.excluded.length ?? 0;
  const confirmations = flow.staged.filter((entry) => entry.receipt).length;

  return (
    <div className="screen-content export-screen">
      <div className="screen-intro">
        <div>
          <p className="eyebrow">5 of 5 · Export</p>
          <h1>Export generic retrofit package</h1>
          <p>Manifest, tool bindings, evidence, and an embed script, each hashed and bound to this proposal.</p>
        </div>
        <span className="snapshot-chip">
          <PackageCheck size={16} /> Ready for owner-controlled integration
        </span>
      </div>

      <div className="export-boundary-banner">
        <ShieldCheck size={22} />
        <div>
          <strong>Export does not deploy or publish.</strong>
          <span>The embed never submits a form. Your page decides what a confirmed change does.</span>
        </div>
      </div>

      <div className="export-workbench">
        <section className="readiness-card" aria-labelledby="generic-readiness-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Release gate</p>
              <h2 id="generic-readiness-heading">Readiness checklist</h2>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <ul className="retention-list">
            <li>
              <CheckCircle2 size={17} /> {flow.report?.passed ?? 0} of {flow.report?.total ?? 10} deterministic checks passed
            </li>
            <li>
              <CheckCircle2 size={17} /> {flow.outcome?.proposal.tools.length ?? 0} reviewed tool(s), {excluded} action(s) kept off the surface
            </li>
            <li>
              <CheckCircle2 size={17} /> {confirmations} human confirmation receipt(s) attached
            </li>
          </ul>
        </section>

        <section className="manifest-card" aria-labelledby="generic-manifest-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Clean-room output</p>
              <h2 id="generic-manifest-heading">Package manifest</h2>
            </div>
            <FileCheck2 size={20} />
          </div>
          {bundle ? (
            <div className="manifest-list">
              {bundle.files.map((file) => (
                <div key={file.path}>
                  <FileCode2 size={16} />
                  <span>{file.path}</span>
                  <code>{file.sha256.slice(0, 10)}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{bundleError ?? "Building the package…"}</p>
          )}
        </section>

        <aside className="integrity-card" aria-labelledby="generic-integrity-heading">
          <div className="column-title">
            <div>
              <p className="eyebrow">Exact artifact approval</p>
              <h2 id="generic-integrity-heading">Integrity</h2>
            </div>
            <Hash size={20} />
          </div>
          <p className="bundle-hash">
            <span>Bundle SHA-256</span>
            <code>{bundle?.bundleHash ?? "—"}</code>
          </p>
          <label className="authorization-check bundle-approval">
            <input
              checked={exportApproved}
              disabled={!bundle || downloading}
              onChange={(event) => flow.setExportApproved(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>I approve this exact bundle hash.</strong>A changed bundle requires a new approval.
            </span>
          </label>
          <div className="unknowns-panel">
            <HelpCircle size={18} />
            <div>
              <strong>Still requires integrator review</strong>
              <span>Selectors were observed on a snapshot; confirm them against the live page before embedding.</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="decision-bar">
        <div className={`decision-status${downloadError ? " has-error" : ""}`} role={downloadError ? "alert" : undefined}>
          <ShieldCheck size={18} /> {downloadError ?? "Download is a local file only. Nothing is sent anywhere."}
        </div>
        <div className="decision-actions">
          <button className="primary-button" disabled={!bundle || !exportApproved || downloading} onClick={flow.download} type="button">
            {downloading ? <RefreshCw className="spin" size={17} /> : <Download size={17} />}
            {downloading ? "Preparing download" : "Download package"}
          </button>
        </div>
      </div>
    </div>
  );
}
