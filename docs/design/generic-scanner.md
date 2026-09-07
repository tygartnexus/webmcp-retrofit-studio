# Generic scanner (preview slice)

Status: full flow. Generic proposals are reviewed, approved, registered,
exercised through a tool console, validated by ten deterministic checks, and
exported as a hash-bound package. The booking fixture keeps its original
hand-modelled flow alongside.

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

Files: `src/fixtures/genericFixtures.ts`, `src/discovery/scanHtml.ts` (with
`scanVocabulary.ts`, `scanSelectors.ts`, and `scanText.ts` beside it),
`src/discovery/inferGenericCapabilities.ts`,
`src/screens/GenericCandidates.tsx`. The booking flow's screens live in
`src/screens/booking/` and shared chrome in `src/components/`; `src/App.tsx`
is orchestration only.

### Observation

Each `<form>` yields one primary capability plus extra capabilities for
embedded search inputs and for `type="button"` controls, so a compound legacy
form becomes several reviewable actions. No search extra is derived from a
form whose primary action is credential or finalize; the booking page thus
yields the final submit (excluded) and the review step. Each `<table>` with a header row
yields a table capability with headers, row count, and previous or next
pagination links.

Fields keep name, selector, input type, kind, required, label (label-for,
wrapping label, or aria-label), placeholder, pattern, min, max, maxlength,
and select options. Field values are never read. Same-name radios collapse
into one enum field; two or more same-name checkboxes collapse into one
multi-select enum field whose value is an array of option keys, labelled by
the fieldset legend. A lone checkbox stays boolean; a checkbox without a value attribute has the
option key "on", as the browser would submit, and an empty value attribute
is the empty key. Repeated names inside one
form get numeric suffixes so schema keys stay distinct. A control with no
name and no id can never be a parameter, but when it is a password, hidden,
file, or payment control it is still recorded as excluded, so it still
counts in the envelope and still classifies its form.

Tables: the header comes from `thead` cells, else the first row made only of
`th` cells; a table with neither is not modelled. Pagination is read from
the table's own neighbourhood (its container when it holds one table,
otherwise the siblings up to the next table) and only from links with
`rel="prev"`/`rel="next"` or whose whole text is previous/next wording
("Next page", "Zurück"); never from "the first link", never from a
"Back to dashboard" style link, and never from a bare page number ("Page 2"),
which is neither direction. A lone table (no other table anywhere in its
container) sees its neighbouring siblings on both sides; between two tables
a pager belongs to the table above it.

Buttons: `type="button"` controls whose whole label is step-navigation
wording (next, back, previous, continue, skip and their translations,
optionally with a step or page number) are skipped and counted in the
safety envelope; "Next of kin" is an action, "Next step" is navigation.
Other `type="button"` controls and every submit button beyond the first
become their own capability, classified by their own label, and a submit
button's `formaction` and `formmethod` override the form's for that
capability, including the first submit button. The primary action is the
first submitting control (a submit button or an image button, labelled by
its alt text); a plain button never stands in for it, and a form with no
submitting control keeps the default "Submit" action. `input type="button"`
counts like a `button type="button"`. A GET submit button keeps the form's
search fields. Excluded controls are counted once per form even when
several capabilities share the form's fields. A form inside a table row or a repeated container carries a row
label taken from visible text only, clipped to 60 characters: the first
non-form cell, or the block's heading outside the form, or its first visible
text. The same visible-text rule applies to headings, button labels, labels, and
legends, so hidden text never reaches a tool name, description, or the
export. Hidden means the hidden attribute, aria-hidden, inline display:none
or visibility:hidden, common hiding classes (sr-only, visually-hidden,
hidden, d-none), and script, style, template, textarea, and select content.
Stylesheets are not evaluated, so text hidden only by an external rule under
another class name is still visible to the scan; owners should check names
and labels in the proposal.

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
form with a search box is still excluded, and no search tool is derived from
a credential or finalize form. One narrowing applies before the exclusion
vocabulary: an ambiguous verb followed by an explicit read or neutral object
from a fixed list ("Remove filter", "Acceder al catálogo", "Entrar em
contato") is not an exclusion, and on a GET form it counts as a read signal.
The phrase must be the whole label: the verb alone ("Remove", "Acceder",
"Entrar") still excludes, and so does anything longer ("Remove filter and
delete account", "Cancel search subscription").

Finalize, credential, and search vocabulary covers English, German, French,
Spanish, Italian, Portuguese, Dutch, Japanese, and Simplified Chinese action
labels; Latin terms match on word boundaries and CJK terms as substrings.
Read-navigation verbs (next, previous, sort, refresh) are Latin-script only,
so a Japanese or Chinese GET form without a search term stages as a write. A term that is finalizing in one
language and neutral in another errs toward exclusion, which is the safe
direction. Other languages fall through to the default classification, so an
owner reviewing a page in another language should read the proposal list
before approving.

### Selectors

An element's id is used only when it is well formed and unique in the
document. Otherwise the selector is a structural path from the nearest
uniquely identified ancestor (or body) with one nth-of-type step per level,
so it resolves to exactly that element even when the form lives in a
different container from its siblings. Attribute values in selectors are
CSS-escaped. Capability ids derive from these selectors and are suffixed if
they ever collide.

Residual risk: a structural path is still positional. If the live page
reorders same-type siblings between scan and use without changing their
count, the selector resolves to exactly one element, but a different one.
The bindings check proves resolution and uniqueness, not identity. Owners
should give retrofitted forms and controls stable ids; the scan prefers them
whenever they are unique.

### Proposal

Tool names follow the contract lint budget (30 characters, lowercase,
underscore) and are made unique with numeric suffixes. Per-row tools fold
the row label into name, title, and description; every description,
including search and table descriptions built from a heading, is clipped to
the lint budget. Read-only names never carry write words, whatever the
page heading said ("Orders to cancel" reads as `read_orders_to`). A search
tool whose only label is the word "Search" is named after its heading. A label with no Latin
letters gets a deterministic stem from a short hash of the label
(`write_1a2b3c`, `search_…`, `read_…`); the original-script label stays in
the title and description. Schemas set
`additionalProperties: false`, mark `required` from the HTML attribute, and
map field kinds to JSON Schema types, enums, formats, and patterns. Every
proposal is run through `lintToolContracts` in tests.

## Runtime adapter

`src/runtime/genericRuntime.ts` binds each proposed tool to the capability
the scanner observed and registers it with the page's model context using
the same fail-closed rollback as the booking adapter: if any registration
fails, every tool from that scope is aborted.

- Table tools read rows from the bound table with `page` and `limit`. Cells
  are clipped to a shared 200-character budget with an ellipsis, rows are
  trimmed to fit the 1.5K-character output budget, and a single wide row has
  its cells shrunk further until it fits; `truncated` covers all three. A
  table with so many columns that even eight-character cells cannot fit
  throws "too many columns" rather than returning over-budget output.
- Staged changes and the embed's `webmcp-retrofit:staged` event carry the
  capability's action label, identical in studio and embed.
- A search or write tool whose form is missing from the page throws rather
  than preparing or staging with a null action.
- Search tools validate input, apply it to the bound controls, and return
  `{ status: "query_prepared", performed: false, request }`. They never
  submit.
- Write tools validate input, apply it, and stage a change through
  `onStaged`; the response says `requiresHumanConfirmation: true` and names
  the visible interface as the only place confirmation can happen. They
  never submit either.
- A forged proposal that points a tool at a finalize or credential
  capability is refused at binding time.

In this build the host document is the inert DOMParser copy of the snapshot,
so the console shows exactly what an agent would see without a network. On a
live page the same adapter runs against `window.document`.

Input validation (`src/runtime/validateToolInput.ts`) enforces the schema an
agent was shown: plain object, no undeclared keys (symbols and accessor
properties included), required keys, and per-property type, enum, range,
length, pattern, and format.

## Deterministic checks

`src/validation/runGenericChecks.ts` registers the tools into a mock model
context against a fresh inert copy of the page and runs ten checks. The
safety envelope reports credential, hidden, and file exclusions and skipped
navigation buttons. Each
has a failure-path test that breaks one tool through the `transformTool` or
`extraTools` seam.

| Check | Proves |
|---|---|
| inventory | registered names equal the proposal exactly |
| exclusions-absent | no tool binds a finalize or credential action, and no name matches an excluded action |
| bindings | every capability selector matches exactly one element and every field selector resolves inside that element's form (or table) |
| annotations | readOnlyHint matches the risk class; untrustedContentHint set |
| contracts | every contract passes the static lint |
| undeclared-input | every tool rejects an undeclared property |
| no-submit | no submit() call and no submit event during any execution |
| output-budget | read tools stay within 1.5K characters |
| cancellation | every tool rejects an aborted signal |
| staging | every write reports draft_staged and stages on the visible surface |

The report carries the scan and proposal hashes; a report for another
proposal never counts as passing.

## Export

`src/export/buildGenericExportBundle.ts` refuses to build unless the report
passed for this exact proposal and scan. The bundle holds four hashed files:

- `webmcp-retrofit.manifest.json`: hashes, tool names, excluded actions,
  validation summary, artifact hashes.
- `webmcp-retrofit.tools.json`: contracts plus page bindings (selectors,
  method, field selectors, input types).
- `webmcp-retrofit.evidence.json`: safety envelope, capability list, and
  any PII-free presence receipts. Never field values.
- `webmcp-retrofit.generated.js`: a standalone embed.

### What the embed does and does not do

The embed registers the reviewed tools with `document.modelContext` on the
live page. It applies validated input to the bound controls, reads tables,
prepares search requests, and dispatches `webmcp-retrofit:staged` for
writes. It never submits. Its input validator implements the same rules as
the studio runtime (`validateToolInput`): plain object with an ordinary
prototype, no undeclared keys including symbols, own data properties only,
required keys, and per-property type, integer, range, length, pattern, and
format. The two implementations are kept in step by
`tests/embedConformance.test.ts`, which runs one table of inputs through
both and fails on any difference in outcome or message. The manifest records
`embedValidation: "same-rules-as-studio-runtime"`. The host page should
still keep its own server-side validation, which it needs regardless of
agents. Receipts in the evidence must name a staged change recorded in the
session for a capability of this proposal; the export refuses anything else.

## Screens

Candidates approves for runtime. Preview shows the registration badge, the
tool console, and staged changes with a passkey confirmation per change.
Validate runs the ten checks. Export shows the four files and their hashes
behind an exact-hash approval before a local download.

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

## Owner-supplied HTML

The Scan screen's source picker includes "Paste your own page HTML".
`createOwnerSnapshot` trims the markup, refuses empty, oversized (over two
million characters), or non-HTML input, derives the snapshot id and revision
from the content hash, and reads the title from an inert DOMParser copy,
falling back to the first heading, then the owner's label. The markup is
never inserted into the live document. The same generic flow then applies.
Choosing a different source clears the authorization tick and any scan
error, because the attestation wording differs per source. Pasted text stays
in the textarea across source switches; it lives only in this tab and is
never stored.

## Agent-side companion

`extension/` holds an MV3 shell that installs a clean-room registry as
`document.modelContext` in browsers without native WebMCP, mirrors native
registrations when present, and lets a person list and call a page's tools.
Its README states the trust model: tool lists and hints are page claims.

## Next slices

1. Confirmation drift check: at confirm time, compare a staged change's
   fields with the live control values and refuse on mismatch, in addition
   to the current supersede-on-later-write rule.
2. Widen the extension's injection scope deliberately, with the trust model
   in view.

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
