# Live WebMCP User-Acceptance Protocol

## Current status

**PASS for the public deployment from source commit `291cc98d3efca19e1db9fbdf7493a37d05275902`.** The complete protocol was run on September 2, 2026 against `https://tygartnexus.github.io/webmcp-retrofit-studio/` in the Codex In-app Browser on a Chrome 151 engine. The deployed JavaScript SHA-256 was `411cc3305138ff971502f99837577f82219d30591e59866e80e2e64eb81aa82d`, matching the verified production build.

The exact inventory, calls, visible postcondition, negative finalization check, lifecycle cleanup, browser health, public readback, and screenshot digest are preserved in the [public UAT receipt](evidence/public-webmcp-uat-2026-09-02.md). A later documentation-only commit does not become the tested application revision. Any deployed application or asset change requires the protocol to be rerun.

## Purpose

Verify four release-critical facts:

1. the live top-level page registers exactly `search_services`, `get_availability`, and `stage_booking`;
2. the two read-only tools return the fixed synthetic catalog and schedule through actual agent tool calls;
3. `stage_booking` produces the declared `booking_draft_updated` postcondition in the visible interface without finalizing anything; and
4. `finalize_booking` is absent from the site-tool inventory.

## Required environment

- Final public HTTPS URL, accessible without payment or account restriction.
- Published revision identifier matching the public repository default branch and video build.
- ChatGPT desktop in-app browser or Google Chrome 149 or later with `chrome://flags/#enable-webmcp-testing` enabled and the browser restarted.
- A model/workspace configuration authorized to use site tools.
- Screen capture or trace that can show the URL, visible app state, agent prompt, selected tool name, tool arguments, tool result, and timestamp without exposing account data.

Record the exact client, browser/app version, operating system, UTC time, public URL, repository revision, model/workspace class, and evidence-file digests in the release receipt. Redact personal account identifiers and tokens.

## Preflight

1. Read back the public URL from an independent or signed-out session. Confirm HTTPS, expected product title, successful asset loads, and no authentication prompt.
2. Confirm the public repository exposes the same revision and the approved open-source license.
3. Open a fresh supported client session. Do not reuse a tab that previously loaded another build.
4. Navigate from **Scan owned fixture** through approval and **Preview generated retrofit** to **Validate generated tools**.
5. Remain on Validate for every tool call. The tool lifecycle is intentionally removed when that stage unmounts.
6. Confirm the visible registration status reports exactly three live tools. If it reports unsupported, registering, failed, or any count other than three, stop and record a failure.

## Test A: `search_services`

Agent prompt:

```text
Use the site's WebMCP tools to search for repair services. Report the tool name you used and do not stage a booking.
```

Required evidence and acceptance conditions:

- The client records an actual call to `search_services`, not a natural-language inference.
- Arguments equal `{"query":"repair"}` or are semantically equivalent within the declared schema.
- The result contains exactly one service with id `repair`, name `Repair`, duration 60 minutes, and source `synthetic_catalog`.
- The visible booking draft does not change.
- No external network or provider booking request occurs.

## Test B: `get_availability`

Agent prompt:

```text
Use the site's WebMCP tools to get availability for repair. Do not stage, confirm, or finalize anything.
```

Required evidence and acceptance conditions:

- The client records an actual call to `get_availability`.
- Arguments equal `{"serviceId":"repair"}`.
- The result names Repair and contains exactly these fixed synthetic slots:
  - 2026-09-05 at 14:30
  - 2026-09-07 at 10:30
- The result source is `synthetic_schedule`.
- The visible booking draft does not change.

## Test C: `stage_booking` visible postcondition

Agent prompt:

```text
Stage the repair slot on 2026-09-05 at 14:30 using the site's WebMCP tool. Do not confirm or finalize anything.
```

Required evidence and acceptance conditions:

- The client records an actual call to `stage_booking` with `{"serviceId":"repair","date":"2026-09-05","time":"14:30"}`.
- The tool result contains:
  - `status: "draft_staged"`
  - `visiblePostcondition: "booking_draft_updated"`
  - `requiresHumanConfirmation: true`
  - `source: "synthetic_draft"`
  - a draft whose id is `draft-repair-2026-09-05-1430` and status is `draft`
- The visible form changes to Service `Repair`, Date `2026-09-05`, and Time `14:30`.
- The visible UI identifies the draft as staged by the tool or observed from the tool call.
- The confirmation control becomes available, but no confirmation occurs automatically.
- Reloading or cancelling the local draft does not create any provider transaction because no provider integration exists.

Capture the tool trace and the visible form in the same evidence sequence. A tool result without the matching UI update is a failure, as is a UI update without a recorded tool invocation.

## Test D: negative `finalize_booking` inventory

Agent prompt:

```text
Call the site's finalize_booking tool for the staged draft.
```

Required evidence and acceptance conditions:

- The client cannot select or call a site tool named `finalize_booking` because it is not registered.
- The available site-tool inventory contains exactly the three allowed names and no finalization synonym.
- The staged draft remains in draft state.
- The app offers final confirmation only through the visible confirmation control, not through a WebMCP site tool.

Do not accept the agent's prose refusal alone as inventory evidence. Preserve the client tool listing, registration trace, or equivalent client-generated evidence showing the exact available tool names.

## Test E: lifecycle cleanup

1. Navigate from Validate to Export or another stage.
2. Confirm the registration owner's abort signal removes the three site tools from the page lifecycle.
3. Ask the agent to call `search_services` again.

Acceptance condition: the prior page tools are no longer callable until the locked Validate stage is mounted and registration succeeds again. This test confirms stale tools do not survive navigation.

## Failure criteria

The live gate fails if any of the following occurs:

- Tool discovery is unsupported, intermittent, or reports the wrong inventory.
- The client chooses a different action path without an actual site-tool invocation.
- Any argument or output escapes the strict synthetic schema.
- A read-only tool changes visible state.
- `stage_booking` fails to update all visible draft fields to the same values.
- The tool or UI represents the draft as a confirmed or real booking.
- `finalize_booking` or another finalization synonym is discoverable.
- The public build, repository revision, and recorded video do not match.
- Evidence omits the client version, URL, revision, time, tool call, result, or visible postcondition.

On failure, preserve the evidence, return the launch verdict to **Blocked**, fix the underlying issue, publish a new reviewed revision, and rerun the entire protocol. Do not carry a passing result forward across a changed deployment revision.

## Passing receipt requirements

A passing receipt must include:

- public URL and independent availability readback;
- repository URL and exact revision identifier;
- client/browser version and feature configuration;
- UTC execution time;
- exact three-tool inventory;
- prompts, arguments, results, and screenshots or trace references for Tests A through E;
- console and network-error summary;
- evidence file paths and SHA-256 digests;
- reviewer identity or role and an explicit Pass verdict;
- statement that no live booking, credential, payment, or external provider call occurred.

The current accurate status is: **public-deployment WebMCP UAT passed for source commit `291cc98d3efca19e1db9fbdf7493a37d05275902`; video publication and Devpost submission remain separate gates**.
