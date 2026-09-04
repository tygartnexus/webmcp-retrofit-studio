# Asset and Dependency Provenance Inventory

## Scope and evidence standard

This inventory separates locally observed file/package facts from ownership or redistribution attestations. Presence in the workspace does not prove that the entrant owns every right needed for public release.

## Design and visual assets

| Asset | Repository role | Verified provenance | Rights or release status |
| --- | --- | --- | --- |
| `docs/design/accepted-candidates-desktop.png` | Local Candidate design reference | Existing workspace design reference dated August 30, 2026; exact generator or author is not established by current repository evidence | Excluded from the public release tree by `.gitignore` unless the owner later supplies a rights attestation |
| `docs/design/accepted-candidates-mobile.png` | Local mobile design reference | Existing workspace design reference dated August 30, 2026; exact generator or author is not established by current repository evidence | Excluded from the public release tree by `.gitignore` unless the owner later supplies a rights attestation |
| `docs/design/accepted-validate-desktop.png` | Local Validate design reference | Existing workspace design reference dated August 30, 2026; exact generator or author is not established by current repository evidence | Excluded from the public release tree by `.gitignore` unless the owner later supplies a rights attestation |
| `docs/design/concept-scan-preview-export.png` | Local combined design reference | Generated for this project on September 2, 2026 with OpenAI's built-in ImageGen using project descriptions and local accepted references | Excluded from the public release tree by `.gitignore`; it is not needed for judging or runtime evidence |
| `test-results/fidelity/` captures | Runtime screenshots used for visual comparison | Produced locally by Playwright from the application build; ignored by version control | Can be regenerated; inspect any replacement for personal data and revision drift |
| Local runtime captures in `docs/screenshots/` | Public release screenshots | Copied only from reviewed Playwright output generated from this application | Included in the public repository; hashes are recorded in the local release receipt |
| `docs/screenshots/validate-public-uat.png` | Visible-state evidence from public WebMCP UAT | Captured from the public Pages build in the Codex In-app Browser on September 2, 2026; copied from the ignored operator evidence after inspection | Included as public evidence; 115,927 bytes; SHA-256 `ed5485e44460fb2190a402cb4deb712ea13b1a3433e165fa0d360a95d69ad013` |
| UI icons | Navigation and status glyphs | Imported from `lucide-react` 1.38.0 installed in the lockfile | ISC-licensed dependency; retain required notices in distributed source |
| UI fonts | Text rendering | CSS uses operating-system sans-serif and local monospace fallback stacks; no webfont file or font download is present | No font asset is bundled by the application |

The three accepted PNGs must not be characterized as entrant-owned or AI-generated until the owner confirms their provenance. This release therefore excludes them and the combined local concept from the public repository and submission media while retaining current-runtime screenshots produced from the build.

## Direct runtime dependencies

Versions and license identifiers below were read from the installed package metadata and are locked by `package-lock.json`.

| Package | Version | Declared license | Use |
| --- | ---: | --- | --- |
| `react` | 19.2.8 | MIT | Component runtime |
| `react-dom` | 19.2.8 | MIT | Browser rendering |
| `lucide-react` | 1.38.0 | ISC | UI icons |

`webmcp-types` 0.1.5 is an MIT-licensed development type package used to describe the browser API and is not an external data source or hosted service.

## Direct development dependencies

| Package | Version | Declared license |
| --- | ---: | --- |
| `@playwright/test` | 1.62.1 | Apache-2.0 |
| `@testing-library/jest-dom` | 7.0.1 | MIT |
| `@testing-library/react` | 16.3.3 | MIT |
| `@testing-library/user-event` | 14.6.6 | MIT |
| `@types/node` | 26.4.0 | MIT |
| `@types/react` | 19.2.18 | MIT |
| `@types/react-dom` | 19.2.5 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| `@vitest/coverage-v8` | 4.1.11 | MIT |
| `jsdom` | 29.0.0 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vite` | 8.2.2 | MIT |
| `vitest` | 4.1.11 | MIT |

This table is not a complete legal opinion on transitive dependencies. For continued public distribution, retain the lockfile, run the package manager's license/dependency checks, preserve required notices, and investigate any package whose metadata or license is missing or incompatible with the chosen project license.

## Code, copy, data, and audio

| Category | Current evidence | Release condition |
| --- | --- | --- |
| Application source and documentation | Authored or assembled in this local project during the challenge work; repository timestamps and future commit history provide technical provenance but not legal ownership proof | Entrant must attest original work, sole ownership, and authority to publish |
| Synthetic booking catalog and schedule | Fixed fictional service names, descriptions, dates, and times in local source; no customer or provider API is used | Verify no value was copied from a real customer system |
| Bundled scan fixture | Automated tests and repository scans found no personal data, credential, external fetch, or unexpected third-party page content in the published fixture | Entrant must still attest that the fixture is original/synthetic and does not copy protected or private source material |
| Devpost description and testing copy | Project-specific draft in `docs/submission/` | Owner must approve factual claims and entrant identity context |
| Internal draft narration | A local draft WAV was generated from `demo-narration.txt` with the installed Microsoft David Desktop voice; it contains no private information and is ignored by version control | Rejected for the launch film; never use as final submission narration |
| Internal demonstration draft | The ignored local MP4 is rendered from the current app with an injected WebMCP test double and carries a persistent `DRAFT | TEST DOUBLE | NOT PUBLIC UAT` watermark | Never use as live-client or public-submission evidence |
| Rejected prior public-video candidate | The ignored 151.708-second MP4 used reviewed public-build captures, a captured-trace panel, and Microsoft Mark synthetic narration; its recorded SHA-256 is `acea84d72834dbb711740a0132944b74675e36ede38e4a075e8eb31813961379` | Rejected by the owner and excluded from submission; its narration, pacing, and edit must not be reused as the approved launch film |
| ElevenLabs launch narration | One continuous take uses the ElevenLabs direct API with model `eleven_v3` and the premade George voice (`JBFqnCBsd6RMkjVDRZzb`); source SHA-256 `87c0105c2601c61ccaf453e0427a21f25d7426f9403f58a47c533ab04b434eb4`; the 179-word transcript exactly matches `artifacts/demo-v4/creative/launch-film-voiceover-v4.txt`; no avatar, lip-sync, time stretching, or narration splice is used | Objectively verified in the exact v4 render. ElevenLabs output-rights attestation and owner end-to-end headphone approval of the exact final track remain required |
| Higgsfield abstract motion | Private Seedance 1.5 clips generated from project-specific abstract styleframes are used only as connective footage; every generated segment in v4 carries a visible generated-transition disclosure | Never present these clips as product UI, tool output, or live evidence. Confirm provider-output rights, rendered-font rights, the disclosure setting, and owner approval before public use |
| Public-build product captures | Eight 2560 x 1376 still captures were recorded from `https://tygartnexus.github.io/webmcp-retrofit-studio/` on September 2, 2026 | Used only for product-state views; stills are not represented as invocation proof |
| Continuous public-page WebMCP capture | A 15.5-second 1920 x 1080 CDP screencast records the public app while `search_services`, `get_availability`, and `stage_booking` execute; the synchronized receipt and 881 source frames are preserved under `artifacts/demo-v2/live-capture/`; SHA-256 `f32ab0807ad2431eba001995e2ad21f1a80220b961c316b41cce90a0b87fee4f` | Reused as source evidence and verified in the exact v4 launch film. The shot preserves genuine motion with 28 unique sampled frame hashes, includes no fabricated cursor, labels the synchronized receipt, and shows the staged draft postcondition |
| Superseded v2 launch-film candidate | `artifacts/demo-v2/exports/webmcp-retrofit-launch-v2.mp4`; SHA-256 `66b3434fcbc7f10813f3d7dddc7966c573a74d3e161d723e33e9fda8957121a4` | Superseded after owner feedback; do not upload because it contains moving screenshot crops, stitched Ainsley segments, and the removed procedural bed |
| Rejected v2 procedural ambient bed | The v2 render synthesized filtered noise and sine tones in FFmpeg with fixed noise seed `20260902` | Removed from v3 after owner feedback; the v3 mix is narration only |
| Superseded private v3 launch-film candidate | `artifacts/demo-v3/exports/webmcp-retrofit-launch-v3.mp4`; 3,322 frames; 110.74-second container duration; 1920 x 1080 H.264/AAC with embedded English subtitles; SHA-256 `e761200be7734c97d450cce5e6f9abac80cd276145ecf943ad1558b37649e7bc` | Superseded by v4; retain only as historical evidence and do not upload as the current candidate |
| Superseded v3 narration-only mix | One continuous George narration take; no music, generated noise, tones, or clip joins | Historical evidence only; superseded by the shorter v4 narration and edit |
| Current private v4 launch-film candidate | `artifacts/demo-v4/exports/webmcp-retrofit-launch-v4.mp4`; 17,208,163 bytes; 2,806 frames; 93.533333 seconds; true-CFR 30 fps; 1920 x 1080 H.264 yuv420p, SAR 1:1, TV-range BT.709; AAC stereo at 48 kHz; SHA-256 `8227bb22efcbde2743cb3cfd1461b07456759b1213d01f7cb2a656edf15cbf46` | Objective checks pass, and independent full-timeline review scored the exact file 92/100 with no release-blocking MP4 defect found. It remains a private candidate, not publish-ready: rights attestations, owner end-to-end headphone review, exact upload approval, public readback, and submission approval remain pending |
| Superseded pre-fix v4 render | Video SHA-256 `22577c6803f26af411b7aaf6ae3845c52a612f6f6dd14eb2a45026820f545ffb` (17,208,553 bytes), clean master `8901048796d1a68c8b478e001614a4ed941321a19d2ac7b8d7f33985ac51c5ce`, receipt bundle `2f5984700ea3930875ddd71bdf1c11114822d7c5839ce9ef2bd22c4c2132d5bf`; shot 18 subtitle read `2 30 PM`; retained under `artifacts/demo-v4/superseded-2026-09-03-title-typo/` | Superseded on September 3, 2026 by the subtitle-colon re-render; historical evidence only, do not upload |
| V4 clean master | `artifacts/demo-v4/exports/webmcp-retrofit-launch-v4-clean.mp4`; 30,949,872 bytes; SHA-256 `18035ab1b7d59a851846818b4d6f77ba1bceeff35a1d1002465ccda1a79e1145` | Preserved as the uncaptioned private master; it is not the designated public-upload payload |
| V4 narration-only mix | One continuous George narration take; no music, generated noise, tones, or clip joins | Objectively measured at -16.5 LUFS integrated, -4.4 dBTP true peak, and 2.6 LU loudness range. Subjective naturalness requires the pending owner end-to-end headphone review |
| V4 burned captions | `artifacts/demo-v4/captions/launch-film-v4.srt`; 45 sentence-case cues covering the exact 179-word transcript; SHA-256 `dad7d3f6b511c474ccc4a8db29c8389233b928a979a97e9e07cbf76b7e2cfb3d`; alignment score `0.9187675`; maximum measured drift `0.628` seconds; no single-word cues | Captions are burned into the designated v4 video. The MP4 intentionally contains no separate subtitle stream; retain the SRT and alignment evidence as sidecars |
| V4 render receipts | `artifacts/demo-v4/exports/webmcp-retrofit-launch-v4-receipts.zip`; 262,841 bytes; SHA-256 `6c1223f520f59f4c3e3dd40c81a54987d07edc9bc2c6f04ef2de4f07689d1eff` | Private objective evidence bundle; retain with the exact candidate and do not characterize it as public-provider readback |
| V4 independent review report | `artifacts/demo-v4/qc/independent-video-review.md`; 5,057 bytes; SHA-256 `7170604b1935f5fbca011250333309c0b0a3286c853200df5548518426512f5b` | Exact-file review verdict is 92/100, internal-review-ready, not publish-ready; owner subjective headphone review and release gates remain separate |
| Launch-film typography | The render script names Metropolis ExtraBold and Montserrat ExtraBold files installed in the Higgsfield media sandbox | License metadata is not recorded in this repository. Confirm the provider permits commercial rendered output using those fonts, or replace them with verified licensed fonts before public upload |
| Rejected prior thumbnail candidate | The ignored 1920 x 1080 PNG associated with the rejected prior video has recorded SHA-256 `6eb24173637ffe990436ae99de2a0b5a8b9e84d1b7cdd1865995d4180d16c2e5` | Excluded from submission |
| Superseded v3 launch thumbnail | `artifacts/demo-v3/exports/webmcp-retrofit-launch-v3-thumbnail.jpg`; 1920 x 1080; SHA-256 `49b93a30b7c8a5586e8dc087c43bddb7726d52d73078e2bd33ff18aa5ba81b6b` | Superseded with the v3 candidate; retain only as historical evidence |
| Current v4 launch thumbnail | `artifacts/demo-v4/exports/webmcp-retrofit-launch-v4-thumbnail.jpg`; 127,930 bytes; SHA-256 `f38f8d746b08b7d4039eadf93c3deec6e82d4fa18a60c2ea4f4ebe78203ef2a1` | Built from genuine product imagery, hash-bound, and privately reviewed; exact owner approval and provider/font rights attestation remain required |
| V4 contact sheet | `artifacts/demo-v4/exports/webmcp-retrofit-launch-v4-contact-sheet.jpg`; 67,893 bytes; SHA-256 `81af5225c38f92978f59d51041b1137c4ac82119a028088a310f9ecd16117260` | Private visual-review evidence only; not part of the public upload payload |

## Release gate

The unverified design references, watermarked internal demo, rejected prior video, superseded v2/v3 candidates, rejected v2 audio bed, and superseded thumbnails are excluded from the current v4 public-upload payload. The public repository, MIT detection, Pages deployment, and public WebMCP UAT are verified for source commit `291cc98d3efca19e1db9fbdf7493a37d05275902`; the current private film contains the separate hash-bound continuous public-page invocation recording.

The v4 launch film remains **private and externally blocked**, not publish-ready. Objective production checks pass: exact duration and true-CFR frame count, normalized SAR/color metadata, narration loudness, exact burned captions, static-shot verification (minimum SSIM `0.994867`, minimum PSNR `46.116`), genuine live-motion verification, contact-sheet/key-frame inspection, and exact hashes for the final, clean master, thumbnail, contact sheet, and receipt bundle. The entrant must still attest application and media ownership or license rights, including ElevenLabs/Higgsfield outputs and rendered-font use. The owner must complete an end-to-end headphone review and approve the exact video hash, narration voice, thumbnail hash, metadata, channel, visibility, and upload payload. After upload, signed-out playback readback is required before the video may be called public. Entrant attestations and approval of the final Devpost payload remain separate pending gates.
