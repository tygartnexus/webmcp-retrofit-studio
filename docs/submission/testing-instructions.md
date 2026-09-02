# Testing Instructions for Judges

## Access

The public live URL is pending deployment and independent readback. The final Devpost form must contain the verified URL rather than a provisional address.

The application is designed to require no login, credentials, payment, API key, backend, or real customer data. All services, schedules, snapshots, and booking drafts are synthetic and browser-local.

For WebMCP tool testing, use either:

- the ChatGPT desktop app's in-app browser, which the Official Rules state supports WebMCP by default; or
- Google Chrome 149 or later, with `chrome://flags/#enable-webmcp-testing` enabled, followed by a browser restart.

## Five-step product walkthrough

1. Open the verified public URL.
2. On **Scan owned fixture**, read the safety boundary, attest that the bundled synthetic fixture is authorized for the demo, and start the scan.
3. Confirm the result says the source is a bundled synthetic snapshot and shows a source fingerprint. The scan must not request credentials or fetch an external website.
4. Continue to **Candidate capabilities**. Confirm the eligible tools are exactly:
   - `search_services`
   - `get_availability`
   - `stage_booking`
5. Confirm `finalize_booking` is marked not exposed. Switch among Accuracy, Red Team, CEO, Technical, and Legal Risk modes and verify that all nine truth-contract sections remain present even when their order changes.
6. Approve the proposal and continue to **Preview generated retrofit**. Confirm the three approved tool names, stable hashes, strict schemas, and visible-interface-only finalization boundary. No WebMCP tools should be registered on Preview.
7. Continue to **Validate generated tools** and stay on this stage while testing tools. Registration is intentionally scoped to this stage; navigating away removes the tool group.
8. Click **Run deterministic checks**. A pass result must appear only after execution and should read `8/8 passed`.
9. Use the visible booking form to stage Consultation on 2026-09-03 at 10:00. Click **Confirm booking** and inspect the exact-value confirmation dialog. Closing or cancelling the dialog causes no real transaction.
10. Continue to **Export retrofit package** only after required validation gates are satisfied. Review the manifest, evidence record, tool inventory, and bundle hash. Acknowledge the review boundary to enable the local download. Export does not deploy or publish.

## WebMCP agent journey

While the Validate stage remains open, ask the agent to perform these calls:

1. `Use the site's WebMCP tools to search for repair services.`
   - Expected tool: `search_services`
   - Expected input: `{"query":"repair"}`
   - Expected result: one Repair service from `synthetic_catalog`
   - Expected visible effect: none; this tool is read-only
2. `Use the site's WebMCP tools to get availability for repair.`
   - Expected tool: `get_availability`
   - Expected input: `{"serviceId":"repair"}`
   - Expected result: 2026-09-05 at 14:30 and 2026-09-07 at 10:30 from `synthetic_schedule`
   - Expected visible effect: none; this tool is read-only
3. `Stage the repair slot on 2026-09-05 at 14:30. Do not confirm or finalize anything.`
   - Expected tool: `stage_booking`
   - Expected input: `{"serviceId":"repair","date":"2026-09-05","time":"14:30"}`
   - Expected result: `status` is `draft_staged`, `visiblePostcondition` is `booking_draft_updated`, `requiresHumanConfirmation` is `true`, and `source` is `synthetic_draft`
   - Expected visible effect: the form shows Repair, 2026-09-05, 14:30, and a tool-staged/observed state
4. Ask the agent to call `finalize_booking`.
   - Expected result: the agent cannot select that site tool because it is absent from the registered inventory
   - Expected visible effect: the draft remains unconfirmed until the visible confirmation control is used

The authoritative release procedure and evidence requirements are in [`../live-webmcp-uat.md`](../live-webmcp-uat.md).

## Local source verification

From the repository root, use Node.js 24 and run:

```powershell
npm ci --ignore-scripts
npx --no-install playwright install chromium
npm run verify
```

On a fresh Linux runner, use `npx --no-install playwright install --with-deps chromium` so required browser libraries are installed too.

Expected behaviors:

- TypeScript compilation completes without errors.
- Unit and component suites pass, including discovery, workflow invalidation, deterministic export, WebMCP registration, cancellation, response-quality, and no-unresolved-marker tests.
- Statement coverage remains at or above 80 percent.
- Vite produces the production bundle under `dist/`.
- Playwright exercises desktop and mobile Chromium projects, saves failure traces when applicable, captures fidelity artifacts, and reports no horizontal overflow on mobile.
- `npm audit --audit-level=high` reports no high or critical vulnerabilities.

Run results must be treated as current only when accompanied by the command, timestamp, revision identifier, exit code, and untruncated output or machine-readable report.

## Failure handling

- If no tools are visible, confirm the supported client configuration, restart the browser after enabling the flag, reload the live URL, and return to Validate.
- If tool registration says unsupported, the ordinary visible interface may still be tested, but the WebMCP release gate has failed.
- If any deterministic check fails, do not continue to export or represent the build as validated.
- If the agent answers without a recorded site-tool call, treat the step as not tested.
- If `stage_booking` returns success but the visible form does not change to the same draft, treat the release as blocked.
- If `finalize_booking` appears in the tool inventory, stop testing and block publication.
