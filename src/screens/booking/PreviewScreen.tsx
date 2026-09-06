import { RegistrationBadge, type RegistrationState } from "../../components/RegistrationBadge";
import { BOOKING_TOOL_NAMES, type BookingDraft } from "../../domain/booking";
import { BOOKING_TOOL_CONTRACTS } from "../../webmcp/bookingToolContracts";
import { AlertTriangle, ArrowRight, FileCode2, Hash, LockKeyhole, ShieldCheck } from "lucide-react";

/** Step 3 of the booking flow: the generated adapter preview. */

const PREVIEW_CODE = `const registrationController = new AbortController();
const contracts = ${JSON.stringify(BOOKING_TOOL_CONTRACTS, null, 2)};

for (const contract of contracts) {
  await document.modelContext.registerTool({
    ...contract,
    execute: trustedHandlers[contract.name],
  }, { signal: registrationController.signal });
}

return () => registrationController.abort();`;

export function PreviewScreen({
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
