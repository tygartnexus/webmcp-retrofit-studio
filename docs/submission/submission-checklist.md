# WebMCP Challenge Submission Checklist

## Official timing and source

The official deadline is **September 3, 2026 at 1:00 PM PDT**, which is **4:00 PM EDT**. The official submission period, project requirements, and judging criteria are published in the [WebMCP Challenge Official Rules](https://webmcp.devpost.com/rules/). The [challenge resources](https://webmcp.devpost.com/resources) are supporting material; the Official Rules control if there is any conflict.

Do not rely on a local clock alone. Reopen the official rules and Devpost submission page immediately before the final submit action.

## Current evidence classes

- **Built locally:** implemented in the workspace and inspectable in source.
- **Tested locally:** backed by a fresh local command result or browser artifact.
- **Verified public:** backed by signed-out or independent readback from the final URL.
- **Owner attestation:** identity, eligibility, authority, ownership, rights, and release facts only the entrant can confirm.

## Product and local verification

- [x] The local release-candidate flow renders all five named stages: Scan owned fixture, Candidate capabilities, Preview generated retrofit, Validate generated tools, and Export retrofit package.
- [x] Scan requires owner authorization and makes no external website request.
- [x] Candidate review proposes exactly `search_services`, `get_availability`, and `stage_booking`.
- [x] `finalize_booking` is excluded everywhere the agent tool inventory is shown.
- [x] The flow displays a stable source fingerprint plus proposal/version hashes and the exact approved allowlist.
- [x] The locked Validate runtime registers tools only from the top-level page and removes them when Validate is left.
- [x] `stage_booking` updates the visible draft and final confirmation remains a visible-interface action.
- [x] Export produces a deterministic clean-room evidence/code package and does not deploy or publish.
- [x] Accuracy, Red Team, CEO, Technical, and Legal Risk controls all preserve the nine-field truth contract.
- [x] Typecheck, unit tests, coverage, production build, E2E suite, and dependency audit have fresh passing receipts.
- [x] Desktop and mobile screenshots have been inspected at native output size with no fixable layout defects.
- [x] Repository scan contains no secrets, credentials, personal data, unresolved markers, or unexpected public binary assets.

## Public repository

- [x] Owner approved public `tygartnexus/webmcp-retrofit-studio`, copyright identity `tygartnexus` (verified public GitHub login), and the MIT License.
- [x] An approved open-source `LICENSE` file is at the repository root and detected by GitHub as MIT.
- [x] The public repository contains the application source, public assets, lockfile, setup instructions, testing instructions, and submission documentation needed to run the project.
- [x] Repository history records both current commits on September 2, 2026, inside the August 25 to September 3 submission period.
- [ ] Entrant confirms that this is new challenge-period work, or identifies and documents any pre-existing work and qualifying WebMCP extension.
- [x] The published source visibly contains the actual top-level `document.modelContext.registerTool` integration or an unambiguous route to the wrapper that invokes it.
- [x] At publication readback, `main` was `291cc98d3efca19e1db9fbdf7493a37d05275902`, the source revision used for deployment and public UAT.
- [x] The prepared local video candidate is explicitly bound to the tested source revision and deployed public captures; its upload remains unapproved.
- [x] A signed-out public readback confirmed the repository URL, public visibility, provider-detected MIT license, file visibility, and setup instructions.

Current status: **public repository, source visibility, MIT detection, verification CI run `33640129650`, and signed-out readback pass for application revision `291cc98d3efca19e1db9fbdf7493a37d05275902`; entrant work-period attestation and final-video binding remain separate gates**.

## Live application

- [x] Owner approved zero-cost GitHub Pages at `https://tygartnexus.github.io/webmcp-retrofit-studio/`.
- [x] Production build deployed successfully with no credentials or paid dependency in Pages run `33640576035`.
- [x] Signed-out readback confirmed HTTPS, HTTP 200, the expected title, and successful JavaScript and CSS loading with matching SHA-256 digests.
- [x] Security headers were read back: HSTS was present; response-level CSP, X-Frame-Options, and X-Content-Type-Options were absent; HTML meta CSP and `no-referrer` remain present.
- [x] No favicon or client-side deep-link route is declared; the submission and testing instructions use the verified root URL only.
- [ ] The app remains free and accessible without restrictions through the judging period ending September 21, 2026 at 5:00 PM Pacific Time.
- [x] The live URL worked in the Codex In-app Browser on a Chrome 151 engine.
- [x] The live WebMCP UAT protocol passed for all three allowed tools, the visible draft postcondition, negative finalization inventory, and lifecycle cleanup.
- [ ] The live build functions exactly as depicted in the final approved video and described in the final submission text.

Current status: **deployment, signed-out readback, asset binding, and public live-client UAT pass for commit `291cc98d3efca19e1db9fbdf7493a37d05275902`; continued availability and final-video alignment remain pending**.

## Demonstration video

- [x] A submission-candidate recording uses public-build captures and a labeled captured-live-trace panel to show the project functioning.
- [x] Measured runtime is 151.708 seconds, below the three-minute limit.
- [x] AAC narration explains what was built and how WebMCP is used; measured integrated loudness is -16.44 LUFS and true peak is -1.93 dBFS.
- [x] Visual review found no credentials, personal information, private browser chrome, copyrighted music, third-party media, or unrelated content.
- [ ] Entrant confirms rights and acceptable use for all final video content, including the synthetic narration output and nominative platform references.
- [x] The actual WebMCP tool calls and visible `stage_booking` postcondition are legible.
- [ ] Owner approves the exact rendered video, narration voice, title, description, thumbnail, and target YouTube channel.
- [ ] YouTube visibility is Public, and a signed-out readback plays the video with working audio.

Current status: **a technically passing local candidate exists and is bound to the public build, but exact owner approval, public YouTube upload, and signed-out playback readback remain pending; the local file is not public evidence**.

## Devpost form and entrant attestations

- [ ] Entrant is registered for the challenge and has access to the submission form.
- [ ] Entrant confirms eligibility, age of majority, supported location, and absence of a disqualifying conflict.
- [ ] Entrant confirms no real/apparent conflict or discloses any Sponsor, Administrator, promotion-entity, judge, affiliate, family/household, employment, or agency relationship for review.
- [ ] If entering as a team or organization, the named representative confirms authority to submit on its behalf.
- [ ] Entrant confirms the submission is original work, solely owned by the entrant/team/organization, and does not violate another party's intellectual-property, privacy, publicity, contract, or other rights.
- [ ] Entrant confirms authorization and license compliance for every third-party dependency and asset.
- [ ] Entrant states whether any Sponsor/Administrator funding, investment, development contract, project-specific commercial license, or preferential support applied.
- [ ] Entrant identifies any outside contributors/contractors and ownership evidence, or confirms there were none.
- [ ] Entrant identifies any other challenge submissions and substantial differences, or confirms there were none.
- [ ] Entrant personally reviews and accepts the current Official Rules, Devpost Terms, and Privacy Policy; no acceptance is inferred from implementation approval.
- [x] The exact owner-only facts and acknowledgement fields are centralized in `owner-attestation-packet.md`.
- [x] Draft project title and tagline match `devpost-description.md`.
- [x] The draft description answers all four required points: WebMCP fit, improved experience, new human-agent collaboration, and implementation.
- [x] Working live application and public repository URLs pass independent readback.
- [ ] The public YouTube URL passes signed-out playback and audio readback.
- [x] English testing instructions are prepared in `testing-instructions.md`.
- [ ] Images are project-owned or approved for submission and accurately depict the current build.
- [ ] All submission claims match the public build, source revision, and video.
- [ ] The entrant reviews the Official Rules and explicitly approves the final Devpost payload.
- [ ] Final Submit is completed before the official deadline, and the resulting submission page/status is read back after submission.

Current status: **public source and application URLs pass; entrant/legal attestations, Devpost authentication/join and draft state, public video URL, exact final-payload approval, final Submit, and submission readback remain pending**.

## Stop conditions

Do not publish or submit if any of these conditions remains true:

- A required public URL is missing, private, inaccessible, or points to a different revision.
- Live WebMCP discovery or the visible draft postcondition fails.
- The license, entrant identity, representative authority, ownership, asset rights, narration voice, or public release has not been approved by the owner.
- The video exceeds the time limit, lacks audio, or depicts behavior the public build does not perform.
- Any claim implies arbitrary-site compatibility, real booking, deployment by the export bundle, production readiness, adoption, revenue, or live UAT without evidence.
