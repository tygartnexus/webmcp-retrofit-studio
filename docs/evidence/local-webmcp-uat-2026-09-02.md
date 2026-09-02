# Local WebMCP UAT Receipt — 2026-09-02

## Verdict

**Passed for the reviewed local build.** This is real browser-client WebMCP discovery and execution evidence against `http://127.0.0.1:4173/`; it is not evidence that a future public deployment is reachable or identical.

## Environment and version binding

- Client: Codex in-app browser WebMCP capability
- Local URL: `http://127.0.0.1:4173/`
- Local production-build asset served during the passing run: `assets/index-DdYXLZe8.js`
- Source fingerprint prefix: `321a99e3931c`
- Proposal hash prefix: `dd20ba00e355`
- Version hash prefix: `01228a41ec8d`
- Deterministic suite timestamp shown by the app: `2026-09-02T06:01:30Z`
- Export bundle SHA-256: `a59e3f95e782dea42b98ca663d545ed7841eb60ac80fe672d421f54eaed15eb2`

## Discovery evidence

The browser reported exactly these page-defined tools:

1. `search_services` — `readOnlyHint: true`
2. `get_availability` — `readOnlyHint: true`
3. `stage_booking` — `readOnlyHint: false`

`finalize_booking` was absent from the browser inventory and from the deterministic inventory check.

## Execution evidence

| Tool | Input | Observed output or postcondition |
| --- | --- | --- |
| `search_services` | `{ "query": "repair" }` | One synthetic `Repair` service; source `synthetic_catalog` |
| `get_availability` | `{ "serviceId": "repair" }` | Two synthetic slots: `2026-09-05 14:30` and `2026-09-07 10:30`; source `synthetic_schedule` |
| `stage_booking` | `{ "serviceId": "repair", "date": "2026-09-05", "time": "14:30" }` | `status: draft_staged`, `visiblePostcondition: booking_draft_updated`, `requiresHumanConfirmation: true`, source `synthetic_draft`, draft id `draft-repair-2026-09-05-1430` |

Before the validation lock, the browser reported that Preview exposed no WebMCP tools. On Validate, the ordinary interface visibly showed Repair, `2026-09-05`, `14:30`, `Staged by tool`, and an observed tool-activity state. The visible `Confirm booking` control was not registered as a WebMCP site tool.

## Additional gates

- All eight deterministic checks passed in the same browser session.
- The app recorded the separate current-browser UAT attestation only after discovery, execution, and the visible postcondition were observed.
- Leaving Validate for Export removed the page-defined WebMCP tools, confirming registration cleanup.
- Export required approval of the exact bundle hash, reverified the complete canonical bundle before starting the local download, and stated that download performs no deployment or publication.

## Known limits

- This receipt covers a local production-mode build, not the final public revision or public URL.
- Cancellation behavior is regression-tested for supplied, omitted, and explicitly undefined client signals; this UAT did not inspect the browser bridge's internal callback options. The tool handlers remain synchronous, browser-local, narrow, and reversible.
- Public-release UAT must repeat this protocol against the exact deployed commit before the submission can claim a working live URL.
