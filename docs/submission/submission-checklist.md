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

- [ ] Owner approves the repository name, public visibility, copyright identity, and open-source license.
- [ ] An approved open-source `LICENSE` file is at the repository root and detected on the repository page.
- [ ] The public repository contains all source, assets, lockfile, setup instructions, testing instructions, and submission documentation needed to run the project.
- [ ] Repository history documents work created during the August 25 to September 3 submission period, or the entrant supplies equivalent dated evidence.
- [ ] The published source visibly contains the actual top-level `document.modelContext.registerTool` integration or an unambiguous route to the wrapper that invokes it.
- [ ] The default branch revision matches the revision used for deployment and video recording.
- [ ] A signed-out public readback confirms the repository URL, license badge/detection, file visibility, and setup instructions.

Current status: **pending owner license decision, public repository creation, push, and public readback**.

## Live application

- [ ] Owner approves the no-cost hosting target and public URL.
- [ ] Production build deploys successfully with no credentials or paid dependency.
- [ ] HTTPS, title, favicon behavior, asset loading, deep-link behavior, and security headers have been checked from outside the deployment session.
- [ ] The app remains free and accessible without restrictions through the judging period ending September 21, 2026 at 5:00 PM Pacific Time.
- [ ] The live URL works in the ChatGPT in-app browser or Google Chrome 149 or later with `chrome://flags/#enable-webmcp-testing` enabled and the browser restarted.
- [ ] The live WebMCP UAT protocol passes for all three allowed tools, the visible draft postcondition, and negative finalization inventory.
- [ ] The live build functions exactly as depicted in the final video and described in the submission text.

Current status: **pending deployment, public readback, and live-client UAT**.

## Demonstration video

- [ ] Final recording follows `demo-script-storyboard.md` and shows the live project functioning.
- [ ] Runtime is less than three minutes; target runtime is 2:40.
- [ ] Audio clearly explains what was built and how WebMCP is used.
- [ ] The recording contains no credentials, personal information, unauthorized trademarks, copyrighted music, or unrelated content.
- [ ] The agent's actual WebMCP tool calls and the visible `stage_booking` postcondition are legible.
- [ ] Owner approves the exact rendered video, narration voice, title, description, thumbnail, and target YouTube channel.
- [ ] YouTube visibility is Public, and a signed-out readback plays the video with working audio.

Current status: **pending recording, owner approval, public upload, and public readback**.

## Devpost form and entrant attestations

- [ ] Entrant is registered for the challenge and has access to the submission form.
- [ ] Entrant confirms eligibility, age of majority, supported location, and absence of a disqualifying conflict.
- [ ] If entering as a team or organization, the named representative confirms authority to submit on its behalf.
- [ ] Entrant confirms the submission is original work, solely owned by the entrant/team/organization, and does not violate another party's intellectual-property, privacy, publicity, contract, or other rights.
- [ ] Entrant confirms authorization and license compliance for every third-party dependency and asset.
- [ ] Project title and tagline match `devpost-description.md`.
- [ ] The description answers all four required points: WebMCP fit, improved experience, new human-agent collaboration, and implementation.
- [ ] Working live URL, public repository URL, and public YouTube URL each pass readback before entry.
- [ ] English testing instructions from `testing-instructions.md` are included.
- [ ] Images are project-owned or approved for submission and accurately depict the current build.
- [ ] All submission claims match the public build, source revision, and video.
- [ ] The entrant reviews the Official Rules and explicitly approves the final Devpost payload.
- [ ] Final Submit is completed before the official deadline, and the resulting submission page/status is read back after submission.

Current status: **pending entrant attestations, verified public URLs, exact final-payload approval, and submission readback**.

## Stop conditions

Do not publish or submit if any of these conditions remains true:

- A required public URL is missing, private, inaccessible, or points to a different revision.
- Live WebMCP discovery or the visible draft postcondition fails.
- The license, entrant identity, representative authority, ownership, asset rights, narration voice, or public release has not been approved by the owner.
- The video exceeds the time limit, lacks audio, or depicts behavior the public build does not perform.
- Any claim implies arbitrary-site compatibility, real booking, deployment by the export bundle, production readiness, adoption, revenue, or live UAT without evidence.
