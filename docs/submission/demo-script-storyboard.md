# Demonstration Video Script and Storyboard

## Recording target

- Current candidate runtime: **151.708 seconds (about 2 minutes 32 seconds)**. Hard stop: **less than 3 minutes**.
- Format: eight edited 1920 x 1080 scenes with spoken audio, using only reviewed public-build captures and an explicitly labeled postproduction live-trace panel.
- Capture only the public live build after live WebMCP UAT passes.
- Show the app and captured agent interaction only. Exclude browser bookmarks, account names, notifications, tokens, terminal history, and unrelated tabs.
- Use owner-approved narration. Do not add music. Do not show third-party logos or other third-party media.
- Record at 1920 × 1080 or 2560 × 1440 with browser zoom chosen so hashes, tool names, and status labels remain readable.

## Edited public-capture storyboard

| Scene | Public-build picture and evidence | Narration focus |
| ---: | --- | --- |
| 1 | Scan page and five-step rail; panel identifies the public URL and tested application revision. | Product purpose, owner-authorized scope, and bundled synthetic fixture. |
| 2 | Completed inert scan with source fingerprint. | No external fetch, credentials, or retained private values. |
| 3 | Candidate review with exactly three eligible tools and excluded finalization. | Evidence-first review modes and required truth-contract fields. |
| 4 | Preview with proposal and implementation hashes. | Version-bound approval and shared contract objects. |
| 5 | Validate inventory and 8-of-8 deterministic result. | Exactly two read-only tools plus one state-changing draft tool; `finalize_booking` absent. |
| 6 | Visible Repair draft plus a postproduction panel explicitly labeled **Captured live WebMCP client trace**. | Exact real client calls, inputs, synthetic results, and visible postcondition. |
| 7 | Exact confirmation dialog opened and canceled. | Final confirmation remains outside the WebMCP site-tool surface in the ordinary visible interface; no claim that all computer-use agents are technically blocked. |
| 8 | Export stage with manifest and bundle hash. | Deterministic local package; no deployment or publication. |

## Agent prompts used in the recording

Use these short prompts exactly so the capture is reproducible:

1. `Use the site's WebMCP tools to search for repair services.`
2. `Use the site's WebMCP tools to get availability for repair.`
3. `Stage the repair slot on 2026-09-05 at 14:30. Do not confirm or finalize anything.`

The agent must visibly invoke the named WebMCP tools. A natural-language answer without a recorded tool call is not sufficient evidence.

## Render gates

The submission candidate may be rendered only after all of the following are true:

- The live public URL has passed availability, content, and HTTPS readback.
- `docs/live-webmcp-uat.md` has a passing receipt from the intended live client.
- The build shown is the same revision published in the public repository.
- Captures and trace contain no personal or confidential information, browser chrome, unrelated tabs, or unlabeled simulated evidence.
- The encoded video is shorter than three minutes and has intelligible audio.

## Publication gates

Rendering does not authorize upload. Before publication:

- The entrant approves the exact encoded file SHA-256, selected narration voice, thumbnail, title, description, channel, audience, disclosure answer, and Public visibility.
- The entrant confirms content ownership, acceptable voice-output use, and absence of unauthorized third-party material.
- After upload, the YouTube watch page is publicly visible and plays with working audio in a signed-out readback.

## Suggested YouTube metadata

- Title: **WebMCP Retrofit Studio — Evidence-First Tools for Legacy Websites**
- Visibility: **Public**
- Category: **Science & Technology**
- Audience: **Not made for kids**
- Music: **None**
- Thumbnail: A project-owned screenshot of the Validate screen with the product name and the three-tool count; no third-party logos.

The public upload remains pending until the owner approves the exact rendered file, voice, channel, metadata, audience/disclosure settings, and Public visibility.
