# Devpost Description

## Project title

WebMCP Retrofit Studio

## Tagline

Turn an owner-authorized legacy website workflow into narrow, reviewable WebMCP tools with finalization kept outside the site-tool surface.

## Copy-ready description

WebMCP Retrofit Studio explores a practical bridge between websites built for people and agents that need explicit, dependable capabilities. It demonstrates the idea on a bundled synthetic booking fixture: the owner authorizes an inert scan, reviews the observed goals and evidence, approves a narrow tool set, inspects the generated contract, validates the behavior, and downloads a clean-room evidence and code package. It does not crawl arbitrary third-party sites, request credentials, deploy code, or create a real booking.

### Why this use case is a strong fit for WebMCP

Many useful websites expose their workflows only through buttons, forms, and page text. An agent must repeatedly infer those controls, and that inference becomes especially risky around state-changing actions. WebMCP gives the site owner a structured contract for the actions they intentionally expose. Retrofit Studio makes that contract visible and reviewable before it reaches an agent.

The synthetic booking example registers exactly three top-level imperative tools: `search_services`, `get_availability`, and `stage_booking`. Search and availability are marked read-only. Draft staging is explicitly state-changing, returns the visible postcondition `booking_draft_updated`, and creates only a reversible local draft. `finalize_booking` is deliberately absent from the WebMCP inventory; the visible interface contains the separate final-confirmation control.

### How it creates a better user experience

The five-step flow makes the evidence, approval state, and finalization boundary inspectable:

1. **Scan owned fixture** inertly parses a bundled synthetic snapshot after an ownership authorization check. It makes no external request and retains observations and hashes instead of raw form content.
2. **Candidate capabilities** shows the evidence behind every proposed tool, the excluded final action, assumptions, unknowns, risks, counterarguments, confidence, and recommendation.
3. **Preview generated retrofit** shows the exact hashed three-tool allowlist and the shared contract that will be registered.
4. **Validate generated tools** activates the reviewed tool group only after the version is locked, executes eight deterministic checks, and provides an ordinary booking form. A successful `stage_booking` call updates every visible draft field for inspection before confirmation through the UI.
5. **Export retrofit package** creates a deterministic clean-room bundle containing generated registration code, a manifest, and an evidence record. Downloading the bundle does not deploy or publish anything.

If WebMCP is unavailable, the ordinary visible booking interface still works. The app does not pretend that a local deterministic check proves live agent discovery. A separate public-client receipt records discovery, execution, visible-state verification, and registration cleanup against the deployed build.

### What people and agents can do together that was difficult before

An agent can search the known synthetic service catalog, retrieve only known availability, and stage an exact reversible draft through structured inputs. The visible interface displays the postcondition, service, date, and time; finalization is not exposed as a WebMCP site tool. The website owner can also inspect why each capability was proposed and export the reviewed implementation evidence.

Before this contract, the agent would need to infer the same workflow from presentation-layer controls on each visit. The demonstrated collaboration replaces that repeated inference with an explicit tool inventory while preserving the person’s existing visual context and approval boundary.

### How WebMCP was implemented

The app is a React, TypeScript, and Vite client with no backend or API key. On the Validate screen it feature-detects the top-level `document.modelContext` and registers the three imperative tools with `registerTool`. The approval view and runtime registration use the same frozen contract objects, which prevents the displayed contract from drifting from the executed one.

Every schema rejects undeclared properties. Inputs are validated again inside each handler. Tool outputs identify their synthetic source, and annotations distinguish read-only operations from draft staging while marking returned page-derived content as untrusted. Registration cleanup and supplied client execution-cancellation signals are separate; leaving Validate removes the tool group. The deterministic suite verifies the exact inventory, annotations, strict schemas, invalid input rejection, unavailable-slot rejection, cancellation, visible draft postcondition, and absence of finalization.

The app also includes an Accuracy, Evidence, and Honest Feedback framework. Six selectable review modes route to centralized versioned prompts while preserving nine required sections: facts, assumptions, unknowns, confidence, evidence, risks, counterarguments, recommendation with tradeoffs, and what would change the recommendation.

### Judging-criteria fit

- **WebMCP Leverage:** The project uses three non-trivial imperative tools, explicit annotations, strict schemas, lifecycle cleanup, visible postconditions, and a deliberate finalization boundary outside the WebMCP tool surface.
- **Execution:** Scan, review, preview, validation, visible draft staging, and deterministic export form one guarded product flow rather than an isolated API example. The live URL and public-client WebMCP behavior have been independently read back for the tested application revision.
- **Potential Impact:** The target audience is website owners and product teams with useful legacy workflows but no agent contract. The prototype shows a bounded retrofit path; it does not claim universal compatibility or production readiness.
- **Creativity and Ambition:** The project treats retrofit generation as an evidence and governance problem, not only a code-generation problem. It combines source fingerprints, approval hashes, stale-artifact invalidation, truth-contract review modes, deterministic validation, and a clean-room export boundary.

## Submission field status

| Required field | Status at packaging time |
| --- | --- |
| Text description | Ready for owner review |
| Working live URL | Verified: `https://tygartnexus.github.io/webmcp-retrofit-studio/` |
| Public open-source repository URL | Verified: `https://github.com/tygartnexus/webmcp-retrofit-studio` with provider-detected MIT License |
| Public YouTube demo URL | Published Public and read back signed out: `https://youtu.be/SgSKDHcvb88` |
| Live WebMCP UAT evidence | Passed against application commit `291cc98d3efca19e1db9fbdf7493a37d05275902`; see `docs/evidence/public-webmcp-uat-2026-09-02.md` |

The designated private candidate is `artifacts/demo-v4/exports/webmcp-retrofit-launch-v4.mp4` (SHA-256 `8227bb22efcbde2743cb3cfd1461b07456759b1213d01f7cb2a656edf15cbf46`). V2 and v3 are superseded historical candidates. The remaining video status is a release fact, not a missing text field: v4 is not publish-ready until the listed rights, human review, exact-payload approval, upload, and public readback gates pass. The verified application and repository URLs must be copied exactly, and the public YouTube URL must be added only after signed-out playback and audio readback.

Devpost entry submitted September 3, 2026: `https://devpost.com/software/webmcp-retrofit-studio`.
