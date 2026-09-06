import type { ExportBundle } from "../../export/buildExportBundle";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileCode2,
  Hash,
  HelpCircle,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

/** Step 5 of the booking flow: the hash-bound export package. */

export function ExportScreen({
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
