# Public WebMCP UAT Receipt — September 2, 2026

## Verdict

**PASS for deployed application revision `291cc98d3efca19e1db9fbdf7493a37d05275902`.** The public GitHub Pages build exposed exactly the three approved WebMCP tools on Validate, executed all three against synthetic browser-local data, produced the declared visible draft postcondition, kept `finalize_booking` absent, and removed the registrations after navigation.

This receipt proves the public source, deployment, and WebMCP behavior described below. It does not prove entrant eligibility, ownership or authority, video publication, Devpost authentication, or challenge submission.

## Revision and public-source binding

| Field | Verified value |
| --- | --- |
| Repository | `https://github.com/tygartnexus/webmcp-retrofit-studio` |
| Visibility | Public |
| Tested source commit | `291cc98d3efca19e1db9fbdf7493a37d05275902` |
| Tested source tree | `c237c6b01f8af32edca1d302afe7e80ff6eb8d15` |
| Branch at readback | `main` |
| Provider-detected license | MIT |
| Verification CI | Run [`33640129650`](https://github.com/tygartnexus/webmcp-retrofit-studio/actions/runs/33640129650), passed |
| Pages deployment | Run [`33640576035`](https://github.com/tygartnexus/webmcp-retrofit-studio/actions/runs/33640576035), passed |
| Public application | `https://tygartnexus.github.io/webmcp-retrofit-studio/` |
| Independent readback | HTTP 200, expected title, no authentication prompt |

The deployed application assets matched the verified production build byte-for-byte:

| Asset | SHA-256 |
| --- | --- |
| `assets/index-DdYXLZe8.js` | `411cc3305138ff971502f99837577f82219d30591e59866e80e2e64eb81aa82d` |
| `assets/index-BSbuUhap.css` | `1a71aa0b3a936c4f257c0ff5d915842d34a2a91bf97add82a8cfd81c6b99cc67` |

## Execution environment

- Client: Codex In-app Browser WebMCP capability
- Browser engine: Chrome 151 (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36`)
- Platform: Windows / Win32
- Workspace class: Codex desktop local task
- Exact model identifier: not exposed by the browser receipt
- Tool execution window: September 2, 2026, 14:17:59–14:20:14 UTC
- Receipt generated: `2026-09-02T14:20:14.711Z`

## Preflight and inventory

- Scan stage: zero WebMCP tools.
- Preview stage: zero WebMCP tools.
- Validate status: `3 live tools registered`.
- Validate inventory: exactly `search_services`, `get_availability`, and `stage_booking`.
- `finalize_booking` and finalization synonyms: absent.
- Read-only hints: true for `search_services` and `get_availability`; false for `stage_booking`.
- Untrusted-content hint: true for all three tools.
- Proposal hash prefix: `dd20ba00e355`.
- Implementation-version hash prefix: `01228a41ec8d`.
- Source-fingerprint prefix: `321a99e3931c`.

## Actual WebMCP calls

### A. `search_services`

- Input: `{"query":"repair"}`
- Result: exactly one `Repair` service with id `repair`, duration 60 minutes, and source `synthetic_catalog`.
- Called at: `2026-09-02T14:17:59.740Z`.
- Verdict: **PASS**.

### B. `get_availability`

- Input: `{"serviceId":"repair"}`
- Result: Repair availability at `2026-09-05 14:30` and `2026-09-07 10:30`, with source `synthetic_schedule`.
- Called at: `2026-09-02T14:18:15.473Z`.
- Verdict: **PASS**.

### C. `stage_booking`

- Input: `{"serviceId":"repair","date":"2026-09-05","time":"14:30"}`
- Result status: `draft_staged`.
- Draft: `draft-repair-2026-09-05-1430`, status `draft`.
- Source: `synthetic_draft`.
- Declared visible postcondition: `booking_draft_updated`.
- Human confirmation required: true.
- Observed visible state: Service `Repair`, Date `2026-09-05`, Time `14:30`, draft status `Staged by tool`, tool activity `Observed`.
- Confirmation control: available but not invoked.
- Called at: `2026-09-02T14:18:26.200Z`.
- Verdict: **PASS**.

### D. Negative finalization inventory

The live inventory contained no `finalize_booking` tool or finalization synonym, so no finalization call was dispatched. The visible Confirm booking control remained outside WebMCP and was not invoked. Verdict: **PASS**.

### E. Lifecycle cleanup

After navigation from Validate to Export, a fresh inventory reported no WebMCP tools. Calling a prior handle failed as stale and required `fetchTools()` again. Verified at `2026-09-02T14:20:14.711Z`. Verdict: **PASS**.

## Supporting checks

- Deterministic browser checks: 8 of 8 passed at `2026-09-02T14:18:59Z`.
- Current-browser UAT attestation: recorded.
- Export bundle SHA-256: `a59e3f95e782dea42b98ca663d545ed7841eb60ac80fe672d421f54eaed15eb2`.
- Console warnings: 0.
- Console errors: 0.
- Network loading failures: 0.
- Successful secure responses: document, stylesheet, and JavaScript asset, all HTTP 200.

## Public-host security readback

- HTTPS is enforced.
- `Strict-Transport-Security: max-age=31556952` was present.
- Content Security Policy and `no-referrer` policy were present as HTML metadata.
- GitHub Pages did not return response-level `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` headers at readback time.

The absent response-level headers are a deployment-hardening limitation of the observed static host configuration. They do not change the functional UAT result, but they remain a documented risk if the prototype is promoted beyond this challenge deployment.

## Preserved evidence

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| [`../screenshots/validate-public-uat.png`](../screenshots/validate-public-uat.png) | 115,927 | `ed5485e44460fb2190a402cb4deb712ea13b1a3433e165fa0d360a95d69ad013` |

The screenshot contains the synthetic visible postcondition and registration status. The call arguments, returned values, timestamps, inventory, lifecycle result, and browser-health observations were captured in the operator's machine-readable execution receipt before this public documentation copy was produced.

## Safety statement

No live booking, credential, payment, external provider request, confirmation, or finalization occurred. All data and state were synthetic and browser-local.

Reviewer role: Codex release operator. Verdict: **PASS**.

## Documentation-only follow-up note

This receipt and its screenshot are documentation-only additions made after the tested/deployed commit `291cc98d3efca19e1db9fbdf7493a37d05275902`. They do not alter the tested JavaScript or CSS bytes, and the evidence commit must not be represented as a newly tested application revision. Any subsequent change to application source, dependencies, build configuration, workflows, or deployed asset bytes invalidates this receipt and requires a new deployment readback and complete public WebMCP UAT.
