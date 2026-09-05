# WebMCP Retrofit Studio

WebMCP Retrofit Studio is a local, synthetic product prototype for turning an owner-authorized website workflow into narrow, reviewable browser-agent tools. The connected experience carries evidence through five guarded stages: **Scan → Candidates → Preview → Validate → Export**.

The implemented fixture is intentionally bounded. It does not scan arbitrary third-party websites, request credentials, contact a booking provider, create a real booking, deploy generated code, or publish a challenge submission.

## Product flow

1. **Scan owned fixture** requires an explicit authorization check, then parses a bundled synthetic HTML snapshot inertly. The scanner rejects its configured prohibited active tags, URL-bearing attributes, event-handler attributes, and password inputs; makes zero external requests; executes no scripts; retains no raw form values; and records six semantic observations plus a SHA-256 source fingerprint.
2. **Candidate capabilities** maps those observations to exactly three eligible contracts: `search_services`, `get_availability`, and `stage_booking`. It keeps `finalize_booking` outside the agent surface and explains the proposal through facts, evidence, assumptions, unknowns, confidence, risks, counterarguments, tradeoffs, and change conditions.
3. **Preview generated retrofit** binds the approved three-tool allowlist to proposal and implementation-version hashes. The preview must match the exact proposal; partial approval and out-of-order transitions fail closed.
4. **Validate generated tools** activates the reviewed three-tool runtime only after the version is locked on Validate, preserves the ordinary booking interface, and runs eight deterministic checks in the current browser session. `stage_booking` updates every visible draft field, while final confirmation remains a separate visible-interface action that requires a WebAuthn presence ceremony.
5. **Export retrofit package** requires a passing validation and the current-browser UAT attestation, then builds a deterministic clean-room package. After the owner approves the exact bundle hash, the browser revalidates every artifact digest and the complete canonical payload before downloading one local JSON package containing a manifest, evidence record, generated registration source, and per-file SHA-256 digests. Downloading performs no network request and does not deploy or publish anything.

## What works

- Scans only the bundled, entrant-controlled synthetic fixture and retains metadata instead of raw HTML or customer values.
- Produces stable scan, proposal, version, file, and bundle hashes with Web Crypto SHA-256.
- Invalidates every downstream approval, preview, validation, and export receipt when the fixture is rescanned. Rejecting or changing an earlier gate likewise clears dependent artifacts.
- Registers exactly three top-level imperative WebMCP tools only on the locked Validate stage:
  - `search_services`
  - `get_availability`
  - `stage_booking`
- Reuses the same fixed booking validation for the visible interface and tool handlers.
- Keeps `finalize_booking` outside the WebMCP inventory. Final confirmation is available only through the visible interface, and only after a WebAuthn user-presence ceremony completes on a platform authenticator.
- Preserves an ordinary booking interface when `document.modelContext` is unavailable.
- Runs eight deterministic checks and shows no pass score before they execute.
- Keeps deterministic results separate from live-client proof. The in-app UAT control records an operator attestation; it does not by itself prove that an agent discovered, selected, and executed the live site tools.
- Supports Standard, Accuracy, Red Team, CEO, Technical, and Legal Risk review modes.
- Validates a nine-section response-quality envelope and centralizes eight versioned review prompts.
- Provides responsive desktop and mobile product views derived from locally reviewed design references. Those source references remain local-only; public release evidence uses screenshots generated from this build.

## Safety and authority boundary

This repository uses only browser-local synthetic services, schedules, snapshots, and drafts. It requests no credentials, fetches no third-party page, and calls no external booking service.

Discovery is not a universal website copier. `scanOwnedFixture` accepts no URL and parses only the frozen `synthetic-legacy-booking-v1` snapshot. Capability inference re-derives the trusted scan, requires every expected observation, and refuses metadata that is not bound to that snapshot. The generated adapter is metadata-only and still requires an owner-reviewed, same-origin execution binding before production integration.

Tool input is revalidated during execution. Schemas reject additional properties. Read tools carry `readOnlyHint: true`; every tool marks returned synthetic/page-derived content with `untrustedContentHint: true`. An owner-controlled registration `AbortSignal` removes the tool group immediately when Validate is left, even if a registration promise is still pending. Each callback honors a separate client execution-cancellation signal when the bridge supplies one. The compatibility fallback for an omitted signal is limited to synchronous, browser-local handlers; draft validation, the visible-state callback, and the store commit still share one pre-commit boundary so a rejected or supplied-signal-cancelled callback does not leave a committed draft.

The confirmation control requires a currently staged draft and displays its exact values before the final step. Confirmation then requires a WebAuthn ceremony on a platform authenticator (touch, biometric, or PIN). Automation that only synthesizes mouse and keyboard input can click the visible button but cannot complete the authenticator prompt, so the draft stays unconfirmed. The app records a PII-free presence receipt (method, ceremony type, the id of the draft the gesture was requested for, relying-party id, user-presence and user-verification flags, a SHA-256 of the credential id, and a timestamp) and carries it into the export evidence. A receipt is bound to the draft shown when the ceremony started; if a tool re-stages a different draft while the authenticator prompt is open, the completed gesture is discarded and the person is asked to review the new draft.

### Generic retrofit flow

The Scan screen offers a source picker. The booking fixture runs the
original hand-modelled flow. The other fixtures (contact form, catalog
search, orders table, checkout, login) and your own pasted page HTML run
the generic flow:

1. **Scan.** A DOMParser-only inert scan records forms, fields, buttons, and
   tables with a safety envelope: scripts ignored, credential and hidden
   fields excluded, no values retained, no requests.
2. **Candidates.** Read-only tools are proposed for searches and tables,
   staged write tools for ordinary forms, and no tool at all for credential
   entry or finalizing actions such as placing an order. Exclusions are
   listed with the reason. Approval is bound to the proposal hash.
3. **Preview.** The approved tools register with `document.modelContext`
   against an inert copy of the page. A tool console calls them exactly as an
   agent would. Search tools apply parameters and return the request the
   page would make without performing it. Write tools apply parameters and
   stage a change that waits for a passkey gesture. Nothing submits.
4. **Validate.** Nine deterministic checks run against a fresh inert copy:
   exact inventory, no finalizing or credential binding, hints match risk,
   contract lint, undeclared input rejected, no submit, read output within
   1.5K characters, cancellation honoured, writes stage for a person.
5. **Export.** A hash-bound package: manifest, tool contracts with page
   bindings, PII-free evidence with any confirmation receipts, and an embed
   script that registers the tools on the live page and announces staged
   writes as a `webmcp-retrofit:staged` event for the page's own
   confirmation step. Export refuses unless all nine checks passed for this
   exact proposal.

Design notes, the classification table, and what the embed does and does
not do are in [docs/design/generic-scanner.md](docs/design/generic-scanner.md).

## Customer view

The five stages are the owner's retrofit, done once per site. Append `?view=customer` to the URL to open the booking page with the reviewed tools already live and no step rail. In that view an agent calls `stage_booking`, the confirmation dialog opens by itself for exactly that draft, and the person's only action is the device gesture. Drafts staged by hand in the visible form still need the explicit Confirm booking click. In this build the customer view shows the full Validate page, including the deterministic checks and the export path; hiding the owner-only sections is deferred.

The verifier can remember the registered credential (`persistCredential: true`, stored in `localStorage` as a hex credential id, never a secret) so later visits need one prompt instead of two. It is off by default because persisting anything is a product decision; the code path is tested either way.

### What the presence ceremony proves, and what it does not

It proves that a local authenticator reported a user gesture for a challenge this page issued, checked in the browser by parsing the authenticator flags and the client-data challenge echo. It does not prove identity or account ownership, nothing is attested to a third party, and no relying-party server verifies a signature, because the app has no backend. Code that already runs JavaScript in the page, such as devtools-protocol automation, a malicious extension, or a compromised dependency, could replace `navigator.credentials` and fabricate a response; a client-only check cannot detect that. The credential-id hash in the receipt is stable for one browser session, so exports from the same session can be correlated, and because no credential is persisted, each fresh session registers a new platform credential. If WebAuthn is unavailable, the origin is insecure, the ceremony is cancelled, or the authenticator does not report presence, confirmation fails closed with a visible reason. Agents learn about this hand-off from the `stage_booking` response, which carries `requiresHumanConfirmation: true` and a `humanConfirmation` object naming the method and surface.

## Evidence lifecycle

```text
owner authorization
        │
        ▼
inert bundled-fixture scan ── SHA-256 scan hash
        │
        ▼
evidence-bound candidate proposal ── proposal + version hashes
        │
        ▼
exact three-tool approval
        │
        ▼
hashed preview
        │
        ▼
deterministic validation + separate live-client UAT gate
        │
        ▼
owner-approved local export ── manifest + evidence + generated code + digests
```

A new scan increments the workflow revision and clears approval, preview, validation, and export state. Export re-infers the trusted proposal and rejects stale or mismatched artifacts before creating the package.

## Product screenshots

These release screenshots were generated from the verified production-mode build; they contain no account, customer, or credential data. The final image below preserves the visible postcondition from the public WebMCP UAT.

![Evidence-based Candidate review](docs/screenshots/candidates-desktop.png)

![Version-bound Validate screen](docs/screenshots/validate-desktop.png)

![Guarded local Export screen](docs/screenshots/export-desktop.png)

![Public Validate WebMCP UAT](docs/screenshots/validate-public-uat.png)

## WebMCP runtime

The adapter feature-detects `document.modelContext.registerTool` and registers from the top-level page. That matches the current [OpenAI Site Tools guidance](https://learn.chatgpt.com/docs/webmcp), whose built-in browser support does not currently discover declarative or iframe-registered tools. Registration cleanup and callback cancellation follow the current [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), and annotations/output limits follow [Chrome's WebMCP security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools).

The approval and Preview views serialize the same deeply frozen contract objects used during runtime registration. The generated export source contains an explicit top-level `document.modelContext.registerTool` loop, a caller-owned registration signal, a disposer, and a pre-dispatch execution-cancellation check; it delegates execution to an owner-reviewed adapter rather than synthesizing remote or arbitrary code. For asynchronous or state-changing integrations, that adapter must honor the supplied client signal transactionally. The wrapper does not relabel a completed adapter outcome if cancellation or registration cleanup races its return.

Mocked registration, deterministic browser-session checks, and Chromium E2E tests verify local application behavior. A [local in-app-browser receipt](docs/evidence/local-webmcp-uat-2026-09-02.md) verifies real local WebMCP discovery and execution. The [public UAT receipt](docs/evidence/public-webmcp-uat-2026-09-02.md) separately records a complete pass against the deployed application from source commit `291cc98d3efca19e1db9fbdf7493a37d05275902`, including exact tool calls, the visible postcondition, cleanup, and deployed-asset hashes.

## Architecture

Key modules:

- `src/fixtures/legacyBookingSnapshot.ts` — frozen synthetic HTML fixture and ownership metadata.
- `src/discovery/scanOwnedFixture.ts` — inert parsing, prohibited-content checks, evidence observations, canonical JSON, and SHA-256 helpers.
- `src/discovery/inferCapabilities.ts` — complete-evidence gate, exact capability mapping, excluded finalization, and proposal/version hashes.
- `src/workflow/retrofitWorkflow.ts` — five-stage state machine, guarded transitions, rescan invalidation, validation, and export receipts.
- `src/export/buildExportBundle.ts` — deterministic manifest, evidence record, generated registration source, file digests, and bundle hash.
- `src/domain/booking.ts` — fixed catalog, availability, input validation, and reversible draft store.
- `src/webmcp/bookingToolContracts.ts` — shared, reviewable metadata and strict schemas used by approval, preview, export, and registration.
- `src/webmcp/registerBookingTools.ts` — exact tool allowlist, callbacks, revalidation, cancellation, and cleanup.
- `src/quality/responseQuality.ts` — six modes and runtime quality validation.
- `src/quality/promptTemplates.ts` — eight versioned system/developer prompt pairs.
- `src/quality/reviewModes.ts` — mode-to-prompt routing, emphasis, and nine-section presentation order.
- `src/validation/runDeterministicChecks.ts` — eight browser-session checks and their evidence report.
- `src/App.tsx` — connected Scan/Candidates/Preview/Validate/Export interface and lifecycle integration.

## Run locally

Requirements: Node.js 24 is verified locally; another runtime must satisfy the locked dependencies.

```powershell
npm install
npm run dev
```

The app uses no API key and requires no backend.

## Verify

```powershell
npm install
npx --no-install playwright install chromium
npm run verify
```

On a fresh Linux CI runner, install Chromium and its system dependencies with `npx --no-install playwright install --with-deps chromium`. The verifier runs type checking, unit/component tests, coverage, production builds, Playwright E2E, and the dependency audit. The suites cover the booking domain, inert discovery, capability inference, workflow ordering and stale-artifact invalidation, deterministic export, WebMCP registration and cancellation, UI behavior, response-quality contracts, review-mode routing, repository placeholder hygiene, runtime checks, and desktop/mobile browser journeys. `npm run test:e2e` first rebuilds the app, starts a fresh local preview, and saves Playwright evidence under the ignored `test-results/` directory.

## Documentation and design evidence

- [AI response quality framework](docs/ai-response-quality-framework.md)
- [Live WebMCP UAT protocol](docs/live-webmcp-uat.md)
- [Passing local WebMCP UAT receipt](docs/evidence/local-webmcp-uat-2026-09-02.md)
- [Passing public WebMCP UAT receipt](docs/evidence/public-webmcp-uat-2026-09-02.md)
- [Local release-candidate receipt](docs/submission/local-release-candidate-receipt.md)
- [Devpost-ready description](docs/submission/devpost-description.md)
- [Judge testing instructions](docs/submission/testing-instructions.md)
- [Submission checklist](docs/submission/submission-checklist.md)
- [Judge-facing final audit](docs/submission/judge-final-audit.md)
- [Public-release approval packet](docs/submission/public-release-approval-packet.md)
- [Owner attestation packet](docs/submission/owner-attestation-packet.md)
- [Asset provenance inventory](docs/submission/asset-provenance.md)
- [Demo script and storyboard](docs/submission/demo-script-storyboard.md)
- [Design fidelity ledger](docs/design/fidelity-ledger.md)
- Runtime screenshots under `docs/screenshots/` include reviewed local build captures and the hash-bound public Validate UAT capture.

The local accepted/concept PNGs are design references, not runtime proof, and are explicitly excluded from the public repository because their redistribution provenance is not established. See the provenance inventory for the release boundary.

## License

The project is licensed under the [MIT License](LICENSE). The copyright identity is the verified public GitHub login `tygartnexus`; this does not assert a personal or legal name.

## Public-release status

The public source, deployment, and live-client WebMCP gates pass for the tested application revision:

- The [public repository](https://github.com/tygartnexus/webmcp-retrofit-studio) was read back with public visibility, `main` at `291cc98d3efca19e1db9fbdf7493a37d05275902`, and a provider-detected MIT License. Verification run `33640129650` passed.
- The [zero-cost GitHub Pages deployment](https://tygartnexus.github.io/webmcp-retrofit-studio/) was read back signed out over HTTPS with HTTP 200. Deployment run `33640576035` passed.
- The deployed `index-DdYXLZe8.js` SHA-256 is `411cc3305138ff971502f99837577f82219d30591e59866e80e2e64eb81aa82d`, matching the verified local production asset.
- Public WebMCP UAT passed in the Codex In-app Browser on a Chrome 151 engine: Scan and Preview exposed zero tools; Validate exposed exactly `search_services`, `get_availability`, and `stage_booking`; all calls returned the expected synthetic results; the visible Repair draft matched; `finalize_booking` remained absent; and leaving Validate removed the tools.

GitHub Pages supplied HSTS, while response-level `Content-Security-Policy`, `X-Frame-Options`, and `X-Content-Type-Options` were absent at readback. The page itself retains its HTML meta CSP and `no-referrer` policy. See the [public receipt](docs/evidence/public-webmcp-uat-2026-09-02.md) for the complete evidence boundary.

The challenge submission remains blocked by the final public YouTube video and readback, entrant eligibility/ownership/authority/work-period and asset-rights attestations, Devpost authentication and draft preparation, exact final-payload approval, final Submit, and resulting entry readback. The documentation receipt added after the tested revision is not represented as a newly tested application build.
