import { AlertTriangle, CheckCircle2, Globe2, HelpCircle, Info, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { GENERIC_FIXTURES } from "../fixtures/genericFixtures";
import { OWNER_HTML_MAX_CHARS } from "../fixtures/ownerSnapshot";

/**
 * Step 1. The owner picks a source: the bundled booking fixture (full
 * hand-modelled flow), a bundled generic fixture, or their own page HTML
 * pasted in. Every source is scanned inertly; nothing is fetched.
 */

/** The bundled booking fixture drives the original retrofit flow. */
export const BOOKING_SOURCE_ID = "legacy-booking";
/** Owner-supplied markup, pasted into the page and parsed inertly. */
export const OWNER_SOURCE_ID = "owner-html";

export interface ScanSource {
  id: string;
  title: string;
}

export const SCAN_SOURCES: readonly ScanSource[] = Object.freeze([
  Object.freeze({ id: BOOKING_SOURCE_ID, title: "Legacy booking (hand-modelled retrofit)" }),
  ...GENERIC_FIXTURES.map((fixture) => Object.freeze({ id: fixture.id, title: `${fixture.title} (generic retrofit)` })),
  Object.freeze({ id: OWNER_SOURCE_ID, title: "Paste your own page HTML (generic retrofit)" }),
]);

export interface ScanScreenProps {
  authorized: boolean;
  scanning: boolean;
  error: string | null;
  sourceId: string;
  ownerHtml: string;
  ownerLabel: string;
  onAuthorizationChange: (authorized: boolean) => void;
  onSourceChange: (sourceId: string) => void;
  onOwnerHtmlChange: (html: string) => void;
  onOwnerLabelChange: (label: string) => void;
  onScan: () => void;
}

function sourceNote(sourceId: string): string {
  if (sourceId === BOOKING_SOURCE_ID) return "https://legacy-booking.test";
  if (sourceId === OWNER_SOURCE_ID) {
    return "Your markup stays in this tab. It is parsed inertly; scripts never run and nothing is fetched.";
  }
  return "Bundled synthetic HTML, scanned inertly into reviewable tool proposals.";
}

function OwnerHtmlFields({
  ownerHtml,
  ownerLabel,
  scanning,
  onOwnerHtmlChange,
  onOwnerLabelChange,
}: Pick<ScanScreenProps, "ownerHtml" | "ownerLabel" | "scanning" | "onOwnerHtmlChange" | "onOwnerLabelChange">) {
  return (
    <>
      <label>
        Page label
        <input
          aria-label="Page label"
          disabled={scanning}
          onChange={(event) => onOwnerLabelChange(event.target.value)}
          placeholder="Used when the markup has no title"
          value={ownerLabel}
        />
      </label>
      <label>
        Page HTML
        <textarea
          aria-label="Page HTML"
          disabled={scanning}
          onChange={(event) => onOwnerHtmlChange(event.target.value)}
          placeholder="Paste the HTML of a page you own or are authorized to analyze"
          rows={8}
          spellCheck={false}
          value={ownerHtml}
        />
      </label>
      <p className="muted">
        Up to {OWNER_HTML_MAX_CHARS.toLocaleString()} characters. Field values, hidden inputs, and credential fields are
        never retained.
      </p>
    </>
  );
}

export function ScanScreen({
  authorized,
  scanning,
  error,
  sourceId,
  ownerHtml,
  ownerLabel,
  onAuthorizationChange,
  onSourceChange,
  onOwnerHtmlChange,
  onOwnerLabelChange,
  onScan,
}: ScanScreenProps) {
  const ownerSelected = sourceId === OWNER_SOURCE_ID;
  const canScan = authorized && !scanning && (!ownerSelected || ownerHtml.trim().length > 0);
  const scanLabel = ownerSelected ? "Scan pasted page" : "Scan owned fixture";
  return (
    <div className="screen-content scan-screen">
      <div className="screen-intro">
        <div>
          <p className="eyebrow">1 of 5 · Scan</p>
          <h1>{ownerSelected ? "Scan your page" : "Scan owned fixture"}</h1>
          <p>Inspect a bundled snapshot or your own page markup without contacting an external site.</p>
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
              <h2 id="scan-source-heading">{ownerSelected ? "Your page markup" : "Bundled synthetic snapshot"}</h2>
            </div>
            <Globe2 size={20} />
          </div>
          <div className="scan-card-body">
            <label>
              Source
              <select onChange={(event) => onSourceChange(event.target.value)} value={sourceId}>
                {SCAN_SOURCES.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted fixture-note">{sourceNote(sourceId)}</p>
            {ownerSelected && (
              <OwnerHtmlFields
                onOwnerHtmlChange={onOwnerHtmlChange}
                onOwnerLabelChange={onOwnerLabelChange}
                ownerHtml={ownerHtml}
                ownerLabel={ownerLabel}
                scanning={scanning}
              />
            )}
            <label className="authorization-check">
              <input checked={authorized} onChange={(event) => onAuthorizationChange(event.target.checked)} type="checkbox" />
              <span>
                <strong>{ownerSelected ? "I own or am authorized to analyze this page." : "I am authorized to analyze this fixture."}</strong>
                {ownerSelected
                  ? " Only markup you are entitled to inspect. The scan keeps structure, never values."
                  : " This approval is limited to the bundled, entrant-controlled snapshot."}
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
            <li>
              <CheckCircle2 size={17} /> Control roles and field names
            </li>
            <li>
              <CheckCircle2 size={17} /> Form and action relationships
            </li>
            <li>
              <CheckCircle2 size={17} /> Reversible versus final boundaries
            </li>
            <li>
              <CheckCircle2 size={17} /> A SHA-256 source fingerprint
            </li>
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
          {error ?? (ownerSelected ? "Scan analyzes only the markup pasted here" : "Scan analyzes only the included fixture snapshot")}
        </div>
        <div className="decision-actions">
          <button className="primary-button" disabled={!canScan} onClick={onScan} type="button">
            {scanning ? <RefreshCw className="spin" size={17} /> : <Search size={17} />}
            {scanning ? "Scanning" : scanLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
