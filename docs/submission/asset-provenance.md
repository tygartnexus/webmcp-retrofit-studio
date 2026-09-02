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
| `test-results/fidelity/` captures | Runtime screenshots used for visual comparison | Produced locally by Playwright from the current application build; ignored by version control | Can be regenerated; release only after checking for personal data and matching the public revision |
| `docs/screenshots/` captures | Public release screenshots | Copied only from reviewed Playwright output generated from this application | Release candidates; bind them to the final revision and inspect before submission |
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

This table is not a complete legal opinion on transitive dependencies. Before public release, retain the lockfile, run the package manager's license/dependency checks, preserve required notices, and investigate any package whose metadata or license is missing or incompatible with the chosen project license.

## Code, copy, data, and audio

| Category | Current evidence | Release condition |
| --- | --- | --- |
| Application source and documentation | Authored or assembled in this local project during the challenge work; repository timestamps and future commit history provide technical provenance but not legal ownership proof | Entrant must attest original work, sole ownership, and authority to publish |
| Synthetic booking catalog and schedule | Fixed fictional service names, descriptions, dates, and times in local source; no customer or provider API is used | Verify no value was copied from a real customer system |
| Bundled scan fixture | Intended as a synthetic local snapshot with no credentials or external fetch | Verify generated fixture contains no personal data, secrets, or third-party page content before publication |
| Devpost description and testing copy | Project-specific draft in `docs/submission/` | Owner must approve factual claims and entrant identity context |
| Demonstration narration | A local draft WAV was generated from `demo-narration.txt` with the installed Microsoft David Desktop voice; it contains no private information and is ignored by version control | Owner must approve the exact narration voice and final rendered file before public upload |
| Internal demonstration draft | The ignored local MP4 is rendered from the current app with an injected WebMCP test double and carries a persistent `DRAFT | TEST DOUBLE | NOT PUBLIC UAT` watermark | Never use as live-client or public-submission evidence; regenerate the final video from the approved public revision and real WebMCP calls |
| Music | No music asset is planned or authorized | Keep the final video music-free unless separately licensed and approved |
| Video thumbnail | A runtime screenshot from this build is the planned source; no external image is required | Bind the chosen screenshot to the final revision and owner approval |

## Release gate

The unverified design references and the watermarked internal demo are excluded from the public release tree. The remaining release gate is owner attestation for application ownership plus approval of the exact narration voice, final video, and selected runtime screenshot. The public-release receipt must record the final included asset list and confirm that each item is owned, licensed, or excluded.
