# AI Response Quality Framework

## Purpose

The response-quality framework prevents unsupported claims from sounding verified. It gives every model-generated review one runtime-validated contract that separates evidence from interpretation and makes the decision boundary visible.

The framework is implemented in `src/quality/responseQuality.ts`. Prompt text is centralized and versioned in `src/quality/promptTemplates.ts`. Mode-to-prompt routing and presentation order are centralized in `src/quality/reviewModes.ts`.

## Response contract

Every mode returns all nine sections:

1. `facts`: observations supported by the supplied material.
2. `evidence`: citations, fixture references, or an explicit statement that direct evidence is unavailable.
3. `assumptions`: inputs accepted for analysis but not independently verified.
4. `unknowns`: questions the available material cannot answer.
5. `confidence`: a score from 0 through 1 plus a written rationale.
6. `risks`: credible ways the conclusion or proposed action could fail.
7. `counterarguments`: the strongest reasonable case against the current conclusion.
8. `recommendation`: the proposed action and its tradeoffs.
9. `changeConditions`: new evidence or conditions that would change the recommendation.

An empty evidence list is invalid. When no direct evidence exists, the model must say that directly, such as: `No direct runtime evidence was available for this claim.` This records the missing-evidence boundary without manufacturing a citation.

The validator accepts `unknown` because model output and network data are not made trustworthy by TypeScript types. It accepts only plain objects with the exact documented own data properties, so inherited values, accessors, and undeclared fields fail closed without invoking getters. Lists are dense plain arrays limited to 20 items, and each text item is limited to 2,000 characters. It also rejects missing sections, empty required lists, out-of-range confidence values, absent confidence rationale, absent tradeoffs, and common unresolved placeholder markers.

## Available modes

| Mode | Intended use | Review emphasis |
| --- | --- | --- |
| Standard | Normal product answers | Concision with a visible evidence boundary |
| Accuracy | Evidence-based recommendations | Full claim-to-evidence separation |
| Red Team | Hostile review | Failure modes, weak claims, and missing proof |
| CEO Review | Executive decisions | Options, opportunity cost, reversibility, and stop conditions |
| Technical Review | Code and architecture decisions | Verified behavior, failure handling, tests, security, and operations |
| Legal Risk Review | Legal or compliance issue spotting | Jurisdiction, source limits, authorization, consent, and counsel escalation |

Legal Risk Review is issue spotting, not legal advice. A legal conclusion remains subject to qualified counsel and the responsible owner's approval.

Each mode routes to a named, versioned prompt and changes which required sections lead the presentation. For example, Accuracy leads with facts and evidence, Red Team leads with risks and unknowns, and CEO Review leads with the recommendation and change conditions. Every mode still renders all nine sections.

## Prompt templates

The registry contains eight versioned system/developer prompt pairs:

| Template | Purpose |
| --- | --- |
| Anti-hallucination check | Audit claims and refuse invented support |
| Hostile red-team review | Find concrete failure paths and overclaims |
| CEO reality check | Expose opportunity cost and the actual decision boundary |
| Evidence-based recommendation | Match recommendation strength to source quality |
| Legal and compliance review | Identify issues and route conclusions appropriately |
| Technical architecture review | Separate implemented behavior from plans and diagrams |
| Bias detection | Find framing, selection, proxy, and incentive bias |
| Executive decision matrix | Compare viable options with explicit criteria and tradeoffs |

All templates share the nine-section output contract. Each template has an `id`, semantic `version`, title, purpose, system instruction, developer instruction, and required-section list.

## Using the framework

```ts
import {
  validateQualityEnvelope,
  type ResponseQualityEnvelope,
} from "./quality/responseQuality";
import { PROMPT_TEMPLATES } from "./quality/promptTemplates";

const prompt = PROMPT_TEMPLATES.technicalArchitectureReview;
const modelOutput: unknown = await requestStructuredReview(prompt);
const validation = validateQualityEnvelope(modelOutput, "technical");

if (!validation.valid) {
  throw new Error(validation.errors.join(" "));
}

const trustedShape = modelOutput as ResponseQualityEnvelope;
renderReview(trustedShape);
```

The cast occurs only after runtime validation. In production, keep the raw output and validation errors available for audit and retry logic.

## Extending the framework

To add a response mode:

1. Add its stable identifier, label, and description to `RESPONSE_MODES`.
2. Add its prompt route, emphasis, and complete nine-section ordering to `REVIEW_MODE_CONFIG`.
3. Keep the nine-section contract unless a reviewed schema migration changes every consumer.
4. Add validator, UI, and prompt-routing tests before implementation.

To add a prompt template:

1. Add its key to `PROMPT_TEMPLATE_IDS`.
2. Register it through `defineTemplate` so version and required sections stay consistent.
3. Write a system instruction that defines the reviewer's role and a developer instruction that defines its evidence behavior.
4. Add or update tests that assert the registry size, semantic version, required sections, and absence of unresolved placeholders.

Increase a template version whenever its interpretation or output expectations change. A wording-only correction that does not change behavior may keep the current version.

## Good and bad outputs

Bad output:

> The generated tool is safe and production-ready, so you should deploy it now.

This mixes an unsupported fact, a risk conclusion, and a recommendation. It names no evidence, uncertainty, tradeoff, or change condition.

Good output:

```json
{
  "facts": ["The synthetic fixture test passed for reversible draft staging."],
  "evidence": ["Test report: stage_booking updates only local draft state."],
  "assumptions": ["The fixture represents the reviewed owner-authorized workflow."],
  "unknowns": ["Behavior on a production website has not been verified."],
  "confidence": {
    "score": 0.78,
    "rationale": "Fixture evidence is deterministic, but no production runtime was tested."
  },
  "risks": ["A site change could invalidate selectors or validation rules."],
  "counterarguments": ["The narrow synthetic flow does not prove broad retrofit coverage."],
  "recommendation": {
    "text": "Keep the tool in reviewed preview until an owner-authorized staging test passes.",
    "tradeoffs": ["This delays broad deployment in exchange for a smaller authorization and safety risk."]
  },
  "changeConditions": ["A passing owner-authorized staging test and security review would support a broader pilot."]
}
```

The good output supports a deliberately narrower claim: the fixture behavior passed. It does not relabel that result as production readiness.
