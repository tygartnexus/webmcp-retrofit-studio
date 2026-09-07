import type { GenericProposal } from "../discovery/inferGenericCapabilities";
import { formOwner } from "../discovery/formOwner";
import type { GenericScanResult } from "../discovery/scanHtml";
import type { HtmlSnapshot } from "../fixtures/genericFixtures";
import {
  createGenericToolDefinitions,
  OUTPUT_BUDGET_CHARS,
  registerGenericTools,
  type StagedChange,
} from "../runtime/genericRuntime";
import { sampleToolInput } from "../runtime/sampleInput";
import type { ModelContextLike } from "../webmcp/registerBookingTools";
import { lintToolContracts, type LintableToolContract } from "./lintToolContracts";
import { assertExpectedRejection } from "./runDeterministicChecks";

/**
 * Deterministic checks for a generic proposal. They register the proposed
 * tools into a mock model context against a fresh inert copy of the page,
 * then prove the properties the owner is about to export: the inventory is
 * exact, nothing binds a finalizing or credential action, every binding
 * resolves to exactly one control on the page, hints match risk, contracts
 * pass lint, undeclared input is rejected, nothing submits, read output stays
 * within budget, cancellation is honoured, and every write stages for a
 * person.
 */

export const GENERIC_CHECKS = [
  { id: "inventory", label: "Registered tools match the proposal exactly" },
  { id: "exclusions-absent", label: "No tool binds a finalizing or credential action" },
  { id: "bindings", label: "Every binding resolves to one control on the page" },
  { id: "annotations", label: "Read-only hints match risk classes" },
  { id: "contracts", label: "Every contract passes the static lint" },
  { id: "undeclared-input", label: "Undeclared input rejected" },
  { id: "no-submit", label: "No tool submits a form" },
  { id: "output-budget", label: `Read outputs within ${OUTPUT_BUDGET_CHARS} characters` },
  { id: "cancellation", label: "Execution cancellation honoured" },
  { id: "staging", label: "Writes stage for human confirmation" },
] as const;

export type GenericCheckId = (typeof GENERIC_CHECKS)[number]["id"];

export interface GenericCheckResult {
  id: GenericCheckId;
  label: string;
  status: "passed" | "failed";
  detail: string;
}

export interface GenericCheckReport {
  scanHash: string;
  proposalHash: string;
  checks: readonly GenericCheckResult[];
  passed: number;
  total: number;
  executedAt: string;
}

export interface GenericCheckInput {
  snapshot: HtmlSnapshot;
  scan: GenericScanResult;
  proposal: GenericProposal;
}

/** Test seams; production callers pass nothing. */
export interface GenericCheckOptions {
  transformTool?: (tool: WebMCP.ModelContextTool) => WebMCP.ModelContextTool | null;
  extraTools?: readonly WebMCP.ModelContextTool[];
  now?: () => string;
}

interface CheckContext {
  input: GenericCheckInput;
  tools: Map<string, WebMCP.ModelContextTool>;
  host: Document;
  staged: StagedChange[];
}

type Check = (context: CheckContext) => Promise<string> | string;

function expectCondition(condition: unknown, failureMessage: string): asserts condition {
  if (!condition) throw new Error(failureMessage);
}

/**
 * The no-submit check swaps HTMLFormElement.prototype.submit/requestSubmit,
 * which are page-global. Concurrent check runs are serialized through this
 * queue so the outermost restore always puts the real originals back.
 */
let submitGuardQueue: Promise<unknown> = Promise.resolve();

function withSubmitGuard<T>(work: (record: () => void) => Promise<T>): Promise<{ value: T; submissions: number }> {
  const run = submitGuardQueue.then(async () => {
    const formPrototype = HTMLFormElement.prototype;
    const originals = { submit: formPrototype.submit, requestSubmit: formPrototype.requestSubmit };
    let submissions = 0;
    const record = () => {
      submissions += 1;
    };
    formPrototype.submit = record;
    formPrototype.requestSubmit = record;
    try {
      const value = await work(record);
      return { value, submissions };
    } finally {
      formPrototype.submit = originals.submit;
      formPrototype.requestSubmit = originals.requestSubmit;
    }
  });
  submitGuardQueue = run.catch(() => undefined);
  return run;
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function proposalTool(context: CheckContext, name: string) {
  return context.input.proposal.tools.find((tool) => tool.name === name);
}

const checkInventory: Check = ({ input, tools }) => {
  const expected = input.proposal.tools.map((tool) => tool.name).sort();
  const actual = [...tools.keys()].sort();
  expectCondition(
    expected.length === actual.length && expected.every((name, index) => name === actual[index]),
    `Expected [${expected.join(", ")}], registered [${actual.join(", ")}]`,
  );
  return `${actual.length} tool(s) registered, matching the proposal`;
};

const checkExclusionsAbsent: Check = (context) => {
  const { input, tools } = context;
  // Identity is the capability, not the label: a safe form may share a button label with an excluded one.
  // bind() already refuses an excluded capability before any check runs, so this line is defence in depth.
  const excludedIds = new Set(input.proposal.excluded.map((item) => item.capabilityId));
  for (const name of tools.keys()) {
    const tool = proposalTool(context, name);
    expectCondition(!tool || !excludedIds.has(tool.capabilityId), `"${name}" is bound to an excluded action`);
    const capability = input.scan.capabilities.find((candidate) => candidate.id === tool?.capabilityId);
    expectCondition(capability, `"${name}" is not bound to any scanned capability`);
    expectCondition(
      capability.riskClass !== "finalize" && capability.riskClass !== "credential",
      `"${name}" binds a ${capability.riskClass} action`,
    );
  }
  return `${input.proposal.excluded.length} excluded action(s) stay off the tool surface`;
};

const checkBindings: Check = (context) => {
  const { input, host, tools } = context;
  let fieldSelectors = 0;
  for (const name of tools.keys()) {
    const tool = proposalTool(context, name);
    expectCondition(tool, `"${name}" is not in the proposal`);
    const capability = input.scan.capabilities.find((candidate) => candidate.id === tool.capabilityId);
    expectCondition(capability, `"${name}" is not bound to any scanned capability`);
    const anchors = host.querySelectorAll(capability.selector);
    expectCondition(
      anchors.length === 1,
      `"${name}" selector ${capability.selector} matches ${anchors.length} element(s); expected exactly one`,
    );
    const anchor = anchors[0];
    const scope = capability.kind === "table" ? anchor : (formOwner(anchor) ?? anchor);
    for (const field of capability.fields.filter((candidate) => !candidate.excluded)) {
      const controls = [...host.querySelectorAll(field.selector)];
      expectCondition(controls.length > 0, `"${name}" field ${field.name} does not resolve on the page`);
      // A control belongs to the form that owns it, so one inside the form but naming another does not.
      expectCondition(
        controls.every((control) => formOwner(control) === scope),
        `"${name}" field ${field.name} resolves outside its own form`,
      );
      fieldSelectors += 1;
    }
  }
  return `${tools.size} capability selector(s) and ${fieldSelectors} field selector(s) resolve uniquely`;
};

const checkAnnotations: Check = (context) => {
  for (const [name, tool] of context.tools) {
    const proposed = proposalTool(context, name);
    expectCondition(proposed, `"${name}" is not in the proposal`);
    const annotations = tool.annotations as { readOnlyHint?: boolean; untrustedContentHint?: boolean } | undefined;
    expectCondition(annotations?.untrustedContentHint === true, `"${name}" must mark page content untrusted`);
    const expectedReadOnly = proposed.riskClass === "read";
    expectCondition(
      annotations?.readOnlyHint === expectedReadOnly,
      `"${name}" readOnlyHint should be ${expectedReadOnly} for a ${proposed.riskClass} tool`,
    );
  }
  return "Hints agree with the reviewed risk classes";
};

const checkContracts: Check = ({ tools }) => {
  const report = lintToolContracts([...tools.values()] as unknown as LintableToolContract[]);
  const failures = report.findings.filter((finding) => finding.status === "failed");
  expectCondition(failures.length === 0, failures.map((f) => `${f.toolName}: ${f.detail}`).join("; "));
  return `${report.passed}/${report.total} lint rules passed`;
};

const checkUndeclaredInput: Check = async ({ tools }) => {
  for (const tool of tools.values()) {
    const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    const sample = sampleToolInput({
      type: "object",
      properties: (schema.properties ?? {}) as never,
      required: schema.required,
      additionalProperties: false,
    });
    await assertExpectedRejection(() => tool.execute({ ...sample, undeclaredProperty: true }, { signal: liveSignal() }), {
      name: "TypeError",
      message: /Unexpected input property/,
    });
  }
  return "Every tool rejected an undeclared property";
};

function sampleFor(context: CheckContext, name: string) {
  const proposed = proposalTool(context, name);
  return proposed ? sampleToolInput(proposed.inputSchema) : {};
}

const checkNoSubmit: Check = async (context) => {
  let events = 0;
  const onSubmit = () => {
    events += 1;
  };
  context.host.addEventListener("submit", onSubmit);
  let submissions = 0;
  try {
    const guarded = await withSubmitGuard(async () => {
      for (const [name, tool] of context.tools) {
        try {
          await tool.execute(sampleFor(context, name), { signal: liveSignal() });
        } catch {
          // A tool's own failure is another check's finding; this one only measures submission.
        }
      }
    });
    submissions = guarded.submissions;
  } finally {
    context.host.removeEventListener("submit", onSubmit);
  }
  expectCondition(submissions === 0 && events === 0, `${submissions + events} submission(s) observed`);
  return "No submit() call or submit event during any tool execution";
};

const checkOutputBudget: Check = async (context) => {
  const readTools = [...context.tools].filter(([name]) => proposalTool(context, name)?.riskClass === "read");
  for (const [name, tool] of readTools) {
    const output = await tool.execute(sampleFor(context, name), { signal: liveSignal() });
    const size = JSON.stringify(output ?? null).length;
    expectCondition(size <= OUTPUT_BUDGET_CHARS, `"${name}" produced ${size} characters`);
  }
  return `${readTools.length} read tool(s) within budget`;
};

const checkCancellation: Check = async (context) => {
  for (const [name, tool] of context.tools) {
    const controller = new AbortController();
    controller.abort();
    await assertExpectedRejection(() => tool.execute(sampleFor(context, name), { signal: controller.signal }), {
      name: "AbortError",
      message: /cancelled/,
    });
  }
  return "Every tool rejected an aborted signal";
};

const checkStaging: Check = async (context) => {
  const writeTools = [...context.tools].filter(([name]) => proposalTool(context, name)?.riskClass === "write");
  for (const [name, tool] of writeTools) {
    const before = context.staged.length;
    const result = (await tool.execute(sampleFor(context, name), { signal: liveSignal() })) as
      | { status?: unknown; requiresHumanConfirmation?: unknown }
      | undefined;
    expectCondition(result?.status === "draft_staged", `"${name}" did not report draft_staged`);
    expectCondition(result?.requiresHumanConfirmation === true, `"${name}" did not require human confirmation`);
    expectCondition(context.staged.length === before + 1, `"${name}" did not stage a change on the visible surface`);
    expectCondition(
      context.staged[before].capabilityId === proposalTool(context, name)?.capabilityId,
      `"${name}" staged a change for a different capability`,
    );
  }
  return writeTools.length === 0 ? "No write tools to stage" : `${writeTools.length} write tool(s) staged for confirmation`;
};

const CHECKS: Readonly<Record<GenericCheckId, Check>> = Object.freeze({
  inventory: checkInventory,
  "exclusions-absent": checkExclusionsAbsent,
  bindings: checkBindings,
  annotations: checkAnnotations,
  contracts: checkContracts,
  "undeclared-input": checkUndeclaredInput,
  "no-submit": checkNoSubmit,
  "output-budget": checkOutputBudget,
  cancellation: checkCancellation,
  staging: checkStaging,
});

function createMockContext(
  tools: Map<string, WebMCP.ModelContextTool>,
  transformTool: NonNullable<GenericCheckOptions["transformTool"]>,
): ModelContextLike {
  return {
    async registerTool(tool, options) {
      const stored = transformTool(tool);
      if (stored === null) return;
      tools.set(stored.name, stored);
      options?.signal?.addEventListener("abort", () => tools.delete(stored.name), { once: true });
    },
  };
}

export function isPassingGenericReport(report: GenericCheckReport, proposal?: GenericProposal): boolean {
  return (
    report.total === GENERIC_CHECKS.length &&
    report.checks.length === GENERIC_CHECKS.length &&
    report.checks.every((check, index) => check.id === GENERIC_CHECKS[index].id && check.status === "passed") &&
    report.passed === GENERIC_CHECKS.length &&
    (proposal === undefined || report.proposalHash === proposal.proposalHash)
  );
}

export async function runGenericChecks(
  input: GenericCheckInput,
  options: GenericCheckOptions = {},
): Promise<GenericCheckReport> {
  const { transformTool = (tool) => tool, extraTools = [], now = () => new Date().toISOString() } = options;
  const tools = new Map<string, WebMCP.ModelContextTool>();
  const host = new DOMParser().parseFromString(input.snapshot.html, "text/html");
  const staged: StagedChange[] = [];
  const registration = await registerGenericTools({
    hostDocument: host,
    scan: input.scan,
    proposal: input.proposal,
    modelContext: createMockContext(tools, transformTool),
    onStaged: (change) => staged.push(change),
  });
  for (const extra of extraTools) tools.set(extra.name, extra);
  const context: CheckContext = { input, tools, host, staged };

  const checks: GenericCheckResult[] = [];
  try {
    for (const definition of GENERIC_CHECKS) {
      try {
        const detail = await CHECKS[definition.id](context);
        checks.push(Object.freeze({ ...definition, status: "passed", detail }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        checks.push(Object.freeze({ ...definition, status: "failed", detail }));
      }
    }
  } finally {
    registration.dispose();
  }
  return Object.freeze({
    scanHash: input.scan.scanHash,
    proposalHash: input.proposal.proposalHash,
    checks: Object.freeze(checks),
    passed: checks.filter((check) => check.status === "passed").length,
    total: GENERIC_CHECKS.length,
    executedAt: now(),
  });
}

export { createGenericToolDefinitions };
