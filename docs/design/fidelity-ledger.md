# Design Fidelity Ledger

Accepted references and implementation screenshots were reviewed at native size after the latest browser run.

| Area | Accepted reference | Implemented result | Status |
| --- | --- | --- | --- |
| Information hierarchy | White product header, five-step rail, focused workbench, persistent decision bar | Same header/rail/workbench/decision sequence across all five implemented screens | Matched |
| Candidate workbench | Candidate list, central evidence review, contract panel in one bordered surface | Joined three-column surface with selected `stage_booking` and excluded `finalize_booking` | Matched |
| Color and state | Navy text, teal active/approved state, amber reversible risk, red exclusion | Same semantic palette and state distinctions | Matched |
| Typography and spacing | Dense technical workbench with restrained headings and compact metadata | System typography and compact grid tuned to the same 1586 × 992 viewport | Close; font family is platform-native |
| Candidate copy | “Candidate capabilities” and “Review what was observed before tools are generated.” | Exact above-the-fold title and description | Matched |
| Validate copy | “Validate generated tools” and postcondition-oriented supporting sentence | Exact above-the-fold title and description | Matched |
| Mobile behavior | Mode picker, selected candidate summary, evidence-first continuation, sticky decision actions | Mode select, collapsed selected candidate, evidence immediately below, three sticky actions | Matched in flow; horizontal step rail replaces “View steps” disclosure |
| Evidence content | Concept contains illustrative DOM/network evidence | Implementation uses only deterministic fixture evidence and explicitly names production unknowns | Intentional correctness change |
| Browser status | Concept illustrates registered-tool success | Implementation says live discovery is unavailable unless all registrations really succeed | Intentional honesty change |
| Validation score | Concept illustrates a completed deterministic suite | Implementation starts at “Not run” and shows a score only after eight checks execute in the current browser session | Intentional evidence change |
| Confirmation | Concept shows one visible confirmation button | Implementation requires a staged draft and shows exact values in a second confirmation step | Intentional safety change |
| Review modes | Concept shows selectable review modes | Implementation routes each mode to a versioned prompt and changes section emphasis/order while preserving all nine required fields | Expanded behavior |
| Scan | Generated reference board shows an owned-fixture intake, authorization, snapshot boundary, and retained evidence summary | Implementation starts at Scan, disables action until owner authorization, parses only the bundled fixture, makes no remote request, and binds evidence to SHA-256 | Matched with a narrower, verified boundary |
| Preview | Generated reference board shows exact inventory, generated registration code, version hash, excluded finalization, and stale-approval warning | Implementation renders the three shared contracts, literal top-level `document.modelContext.registerTool`, proposal/version hashes, explicit exclusion, and rescan invalidation | Matched |
| Export | Generated reference board shows readiness evidence, package manifest, integrity, and a local download gate | Implementation requires eight checks, current-browser UAT attestation, exact bundle-hash approval, and downloads a clean-room JSON envelope containing three hashed files | Matched with no unsupported signing claim |
| UAT evidence | Generated reference board illustrates browser UAT as complete | Implementation labels deterministic harness evidence and operator-recorded live-client UAT separately; registration alone never appears as selection proof | Intentional honesty change |
| Native comparison sizes | Desktop 1586 × 992; mobile asset 853 × 1844 | Desktop captured at 1586 × 992; mobile captured at 426 × 922 CSS pixels with 2× scale (852 × 1844 output) | Matched within one mobile output pixel |

The three accepted PNGs and `concept-scan-preview-export.png` are local design specifications, not proof of runtime behavior. Their redistribution provenance is not established, so `.gitignore` excludes all four from the public release tree. The Playwright captures in `test-results/fidelity/` are regenerated from the current production build; reviewed release candidates are copied to `docs/screenshots/`. The latest native-size review compared accepted Candidate/Validate screens directly with the current Candidate/Validate captures, then inspected Scan/Preview/Export against the generated reference board.
