# Demonstration Video Script and Storyboard

## Recording target

- Planned runtime: **2 minutes 40 seconds**. Hard stop: **2 minutes 45 seconds**.
- Required format: one continuous, legible product demonstration with spoken audio.
- Record only the public live build after live WebMCP UAT passes.
- Show the app and agent interaction only. Exclude browser bookmarks, account names, notifications, tokens, terminal history, and unrelated tabs.
- Use owner-approved narration. Do not add music. Do not show third-party logos or other third-party media.
- Record at 1920 × 1080 or 2560 × 1440 with browser zoom chosen so hashes, tool names, and status labels remain readable.

## Timed storyboard

| Time | Picture | Narration |
| --- | --- | --- |
| 0:00-0:13 | Open on the product title and five-step rail. | “WebMCP Retrofit Studio helps a website owner turn an existing human workflow into narrow, reviewable tools for agents. This demo uses only a bundled synthetic booking fixture.” |
| 0:13-0:31 | On **Scan owned fixture**, show the ownership authorization, no-credentials notice, and start the scan. Pause on the source fingerprint. | “The owner must authorize the fixture before scanning. The scan parses an inert local snapshot, makes no external request, retains no raw form values, and produces a source fingerprint for the review chain.” |
| 0:31-0:51 | Continue to **Candidate capabilities**. Point to the three eligible tools, `finalize_booking` exclusion, and Accuracy/Red Team mode switch. | “The evidence review proposes search, availability, and reversible draft staging. Final booking is excluded. Review modes can challenge the proposal, but every mode preserves facts, assumptions, unknowns, evidence, risk, confidence, tradeoffs, and change conditions.” |
| 0:51-1:07 | Approve, then open **Preview generated retrofit**. Show the proposal/version hashes and exact contract names. | “Approval produces a hashed preview of the exact allowlist. The contract shown here comes from the same shared objects used for runtime registration, reducing display-to-execution drift.” |
| 1:07-1:23 | Continue to **Validate generated tools**. Show three live tools registered, then run the deterministic checks. | “On Validate, the top-level page registers exactly three imperative WebMCP tools. Eight checks execute in this browser session; the app does not display a pass score before they run.” |
| 1:23-1:43 | In the agent panel, ask for repair services and repair availability. Keep tool-call evidence visible. | “The agent can call `search_services` and `get_availability` through strict schemas. Both are read-only and return only fixed synthetic catalog and schedule data.” |
| 1:43-2:05 | Ask the agent to stage repair on 2026-09-05 at 14:30. Show the tool result and the visible form update to Repair, date, and time. | “`stage_booking` is explicitly state-changing, but it creates only a reversible draft. Its `booking_draft_updated` postcondition updates the visible interface, so the person sees exactly what the agent staged.” |
| 2:05-2:20 | Click **Confirm booking**, show the exact confirmation dialog, then cancel or close without implying a real transaction. | “Final confirmation is not exposed as a WebMCP site tool. It stays in the visible interface with the exact draft values. This synthetic demo never contacts a booking service or creates a real transaction.” |
| 2:20-2:34 | Continue to **Export retrofit package**. Show the manifest, hashes, file list, and enabled download after acknowledging the review boundary. | “After validation, the owner can download deterministic generated code, a manifest, and the evidence record. Export never deploys or publishes the retrofit.” |
| 2:34-2:40 | Return to the five-step completion state and product title. | “That is the bridge: explicit tools for the agent, observable state for the person, and evidence for the website owner.” |

## Agent prompts used in the recording

Use these short prompts exactly so the capture is reproducible:

1. `Use the site's WebMCP tools to search for repair services.`
2. `Use the site's WebMCP tools to get availability for repair.`
3. `Stage the repair slot on 2026-09-05 at 14:30. Do not confirm or finalize anything.`

The agent must visibly invoke the named WebMCP tools. A natural-language answer without a recorded tool call is not sufficient evidence.

## Recording gates

The final take is blocked until all of the following are true:

- The live public URL has passed availability, content, and HTTPS readback.
- `docs/live-webmcp-uat.md` has a passing receipt from the intended live client.
- The build shown is the same revision published in the public repository.
- The entrant has approved use of the selected narration voice and confirmed that no personal or confidential information is visible.
- The final encoded video is shorter than three minutes and has intelligible audio.
- The uploaded YouTube video is publicly visible in a signed-out readback.

## Suggested YouTube metadata

- Title: **WebMCP Retrofit Studio — Evidence-First Tools for Legacy Websites**
- Visibility: **Public**
- Category: **Science & Technology**
- Audience: **Not made for kids**
- Music: **None**
- Thumbnail: A project-owned screenshot of the Validate screen with the product name and the three-tool count; no third-party logos.

The public upload remains pending until the owner approves the final rendered file and metadata.
