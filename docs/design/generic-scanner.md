# Generic scanner (preview slice)

Status: preview only. Generic proposals are reviewed on screen and never
registered, executed, validated, or exported in this build. The booking
fixture still drives the full retrofit flow.

## Why

The submitted app retrofits one hand-modelled booking page. The owner's goal
is a WebMCP retrofit tool that works for any owner-authorized page: forms,
searches, tables, checkouts, and logins, with an agent doing the routine work
and a person doing only the gesture that finalizes. This slice adds the
owner-side engine that turns arbitrary HTML into reviewable tool proposals
while keeping every boundary the submission already had.

## Boundaries kept

- Inert parsing only. `DOMParser` never executes scripts or fetches
  subresources. The scan records a safety envelope: scripts ignored,
  credential and hidden fields excluded, zero executed scripts, zero external
  requests, no raw values retained.
- Owner authorization only. Every snapshot carries
  `authorization: "owner-authorized"`; bundled fixtures are synthetic.
- No finalizing tool. Actions that place orders, pay, confirm, delete, or
  submit credentials never become tools. They are listed as exclusions with
  the reason, and finalization stays on the visible page behind the WebAuthn
  presence ceremony.
- Hash-bound proposals. `scanHash` fingerprints the snapshot,
  `versionHash` fingerprints the inference output, and `proposalHash` binds
  both, matching the booking workflow's chain.

## Pipeline

```
HtmlSnapshot ──scanHtml──▶ GenericScanResult ──inferGenericCapabilities──▶ GenericProposal
  (owner html)              (capabilities,                                   (tools, excluded,
                             fields, safety)                                  hashes)
```

Files: `src/fixtures/genericFixtures.ts`, `src/discovery/scanHtml.ts`,
`src/discovery/inferGenericCapabilities.ts`,
`src/screens/GenericCandidates.tsx`.

### Observation

Each `<form>` yields one primary capability plus extra capabilities for
embedded search inputs and for `type="button"` controls, so a compound legacy
form such as the booking page becomes three reviewable actions: the final
submit, the search, and the review step. Each `<table>` with a header row
yields a table capability with headers, row count, and previous or next
pagination links.

Fields keep name, selector, input type, kind, required, label (label-for,
wrapping label, or aria-label), placeholder, pattern, min, max, maxlength,
and select options. Field values are never read.

### Classification

| Signal | Kind | Risk class | Tool? |
|---|---|---|---|
| password field, or action label like "Log in" | form | credential | no |
| payment-shaped field (`autocomplete="cc-*"`, card, cvv, expiry), or action label like "Place order", "Pay", "Confirm", "Delete" | form | finalize | no |
| GET form with a search role, a search input, or a search-like label | search | read | read-only tool |
| GET form with a read verb (go, sort, next, page, export) | search | read | read-only tool |
| any other form | form | write | state-changing tool, staged |
| table | table | read | read-only tool with `page` and `limit` |

Credential wins over finalize, and finalize wins over search, so a checkout
form with a search box is still excluded.

### Proposal

Tool names follow the contract lint budget (30 characters, lowercase,
underscore) and are made unique with numeric suffixes. Schemas set
`additionalProperties: false`, mark `required` from the HTML attribute, and
map field kinds to JSON Schema types, enums, formats, and patterns. Every
proposal is run through `lintToolContracts` in tests.

## What the screen does

Scan offers a fixture picker. Choosing a generic fixture scans it and opens
the Generic candidates screen: proposed tools with parameter tables, the
exclusions with reasons, the safety envelope, and both fingerprints. The only
action is Back to scan. Choosing the booking fixture restores the full flow.

## Gaps closed before the runtime slice

- GET forms classify as read only when they carry a read signal: a search
  role, a search input, a search-like label, or a read verb in the action
  label (go, search, find, filter, sort, show, view, list, browse, next,
  previous, page, refresh, load more, export). Any other GET form is staged
  as a write. "Log out" and "Sign out" join the credential boundary;
  deactivate, close account, terminate, unsubscribe, erase, and wipe join
  finalize.
- Same-name radios collapse into one enum field whose options are the static
  value attributes, labelled by the fieldset legend, required if any option
  is required.
- The step rail treats a generic scan as a completed scan.

## Decision: no pre-parse content filter in the generic scanner

`scanOwnedFixture` rejects markup containing scripts, iframes, or images
before parsing because the booking fixture is hand-authored and should never
contain them. The generic scanner deliberately accepts such markup: real
pages contain scripts, DOMParser never runs them, and the count of ignored
scripts is part of the safety envelope the owner reviews. The runtime slice
never injects scanned HTML into the live document, so the guard is not
needed there either. Revisit if a future slice renders scanned HTML.

## Next slices

1. Runtime adapter: register proposed read and write tools against a live
   page through a small element binding layer, with the same fail-closed
   rollback the booking registration has.
2. Generic validation: run the deterministic checks over proposed tools,
   including a finalize-exclusion oracle.
3. Export: manifest and embed for generic proposals with per-file hashes.
4. Owner-supplied HTML: paste or upload a page instead of a bundled fixture,
   still parsed inertly.
5. Agent-side companion (option B): a browser extension that discovers and
   calls tools on retrofitted pages.

## Related work and attribution

The scanner and inference are clean-room implementations. No code was copied.
Reading the following MIT-licensed projects during the 2026-09-03 competitor
study informed the design:

- keak-ai/webmcp-core (MIT, Copyright (c) 2025 Keak): the idea of a DOM
  capture step feeding a schema inferrer, and lint rules over tool names.
- r0bertini/latch (MIT, Copyright (c) 2026 Latch): label resolution order for
  form controls.
- mcpland/webpage-mcp (MIT, Copyright (c) 2026 MCP Land): a risk model that
  separates reversible actions from finalizing ones.

Differences that matter: those projects either register tools on load, crawl
arbitrary sites, or still emit a tool for dangerous actions. This app scans
only owner-authorized snapshots, proposes for review, and keeps finalizing and
credential actions off the tool surface by construction.
