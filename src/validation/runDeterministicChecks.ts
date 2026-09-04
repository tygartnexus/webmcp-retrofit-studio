import { createBookingStore } from "../domain/booking";
import {
  BOOKING_TOOL_NAMES,
  registerBookingTools,
  type ModelContextLike,
} from "../webmcp/registerBookingTools";

export const DETERMINISTIC_CHECKS = [
  { id: "inventory", label: "Exact three-tool inventory" },
  { id: "annotations", label: "Read-only hints verified" },
  { id: "schemas", label: "Strict input schemas" },
  { id: "invalid-service", label: "Invalid service rejected" },
  { id: "unavailable-slot", label: "Unavailable slot rejected" },
  { id: "cancellation", label: "Execution cancellation" },
  { id: "postcondition", label: "Visible draft postcondition" },
  { id: "finalization-absent", label: "Finalization tool absent" },
] as const;

export interface DeterministicCheckResult {
  id: (typeof DETERMINISTIC_CHECKS)[number]["id"];
  label: string;
  status: "passed" | "failed";
  detail: string;
}

export interface DeterministicReport {
  checks: readonly DeterministicCheckResult[];
  passed: number;
  total: number;
  executedAt: string;
}

export interface ExpectedRejection {
  name: string;
  message: RegExp;
}

/**
 * Test seams. Production callers pass nothing; the failure-path tests use
 * these to break one tool at a time and prove each check can fail.
 */
export interface DeterministicCheckOptions {
  /** Rewrite or drop (return null) a tool before the mock context stores it. */
  transformTool?: (
    tool: WebMCP.ModelContextTool,
  ) => WebMCP.ModelContextTool | null;
  /** Tools present in the mock context that the adapter did not register. */
  extraTools?: readonly WebMCP.ModelContextTool[];
}

function expectCondition(condition: unknown, failureMessage: string): void {
  if (!condition) throw new Error(failureMessage);
}

export async function assertExpectedRejection(
  action: () => unknown,
  expected: ExpectedRejection,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof Error) && !(error instanceof DOMException)) {
      throw new Error(`Expected ${expected.name}, received a non-Error rejection`);
    }
    if (error.name !== expected.name) {
      throw new Error(`Expected ${expected.name}, received ${error.name}`);
    }
    expected.message.lastIndex = 0;
    if (!expected.message.test(error.message)) {
      throw new Error(
        `Expected ${expected.name} message to match ${expected.message}, received: ${error.message}`,
      );
    }
    return;
  }
  throw new Error("Expected the operation to reject");
}

export function hasExactDeterministicInventory(
  report: Pick<DeterministicReport, "checks" | "passed" | "total">,
): boolean {
  return (
    report.total === DETERMINISTIC_CHECKS.length &&
    report.checks.length === DETERMINISTIC_CHECKS.length &&
    report.checks.every(
      (check, index) => check.id === DETERMINISTIC_CHECKS[index].id,
    ) &&
    report.checks.filter((check) => check.status === "passed").length ===
      report.passed
  );
}

export function isPassingDeterministicReport(
  report: Pick<DeterministicReport, "checks" | "passed" | "total">,
): boolean {
  return (
    hasExactDeterministicInventory(report) &&
    report.passed === DETERMINISTIC_CHECKS.length &&
    report.checks.every((check) => check.status === "passed")
  );
}

function createMockContext(
  tools: Map<string, WebMCP.ModelContextTool>,
  transformTool: NonNullable<DeterministicCheckOptions["transformTool"]>,
): ModelContextLike {
  return {
    async registerTool(tool, options) {
      const stored = transformTool(tool);
      if (stored === null) return;
      tools.set(stored.name, stored);
      options?.signal?.addEventListener(
        "abort",
        () => tools.delete(stored.name),
        { once: true },
      );
    },
  };
}

export async function runDeterministicChecks(
  options: DeterministicCheckOptions = {},
): Promise<DeterministicReport> {
  const transformTool = options.transformTool ?? ((tool) => tool);
  const tools = new Map<string, WebMCP.ModelContextTool>();
  const modelContext = createMockContext(tools, transformTool);
  const store = createBookingStore();
  let visibleDraftId: string | null = null;
  const registration = await registerBookingTools({
    modelContext,
    store,
    onDraftStaged(draft) {
      visibleDraftId = draft.id;
    },
  });
  for (const extra of options.extraTools ?? []) tools.set(extra.name, extra);
  const registeredNames = [...tools.keys()].filter((name) =>
    (BOOKING_TOOL_NAMES as readonly string[]).includes(name),
  );
  const execution = { signal: new AbortController().signal };
  const checks: DeterministicCheckResult[] = [];

  const run = async (
    definition: (typeof DETERMINISTIC_CHECKS)[number],
    check: () => unknown,
  ) => {
    try {
      await check();
      checks.push({
        ...definition,
        status: "passed",
        detail: "Executed in this browser session.",
      });
    } catch (error) {
      checks.push({
        ...definition,
        status: "failed",
        detail: error instanceof Error ? error.message : "Unknown check failure",
      });
    }
  };

  await run(DETERMINISTIC_CHECKS[0], () => {
    expectCondition(
      tools.size === BOOKING_TOOL_NAMES.length &&
        registeredNames.join(",") === BOOKING_TOOL_NAMES.join(",") &&
        registration.registeredTools.join(",") === BOOKING_TOOL_NAMES.join(","),
      "Registered inventory did not match the allowlist",
    );
  });
  await run(DETERMINISTIC_CHECKS[1], () => {
    expectCondition(tools.get("search_services")?.annotations?.readOnlyHint, "Search must be read-only");
    expectCondition(tools.get("get_availability")?.annotations?.readOnlyHint, "Availability must be read-only");
    expectCondition(
      tools.get("stage_booking")?.annotations?.readOnlyHint === false,
      "Draft staging must be marked state-changing",
    );
  });
  await run(DETERMINISTIC_CHECKS[2], () => {
    for (const tool of tools.values()) {
      const schema = tool.inputSchema as { additionalProperties?: unknown };
      expectCondition(
        schema.additionalProperties === false,
        `${tool.name} permits undeclared input properties`,
      );
    }
  });
  await run(DETERMINISTIC_CHECKS[3], async () => {
    await assertExpectedRejection(
      () =>
        tools
          .get("get_availability")!
          .execute({ serviceId: "not-real" }, execution),
      { name: "RangeError", message: /Unknown service/ },
    );
  });
  await run(DETERMINISTIC_CHECKS[4], async () => {
    await assertExpectedRejection(
      () =>
        tools.get("stage_booking")!.execute(
          { serviceId: "consultation", date: "2026-09-03", time: "23:59" },
          execution,
        ),
      { name: "RangeError", message: /Unavailable booking slot/ },
    );
  });
  await run(DETERMINISTIC_CHECKS[5], async () => {
    const controller = new AbortController();
    controller.abort("runtime-check");
    await assertExpectedRejection(
      () =>
        tools.get("stage_booking")!.execute(
          { serviceId: "consultation", date: "2026-09-03", time: "10:00" },
          { signal: controller.signal },
        ),
      { name: "AbortError", message: /cancelled/ },
    );
    expectCondition(store.getSnapshot().draft === null, "Cancelled execution changed the draft");
  });
  await run(DETERMINISTIC_CHECKS[6], async () => {
    const result = (await tools.get("stage_booking")!.execute(
      { serviceId: "repair", date: "2026-09-05", time: "14:30" },
      execution,
    )) as { visiblePostcondition?: unknown; draft?: { id?: unknown } };
    expectCondition(
      result.visiblePostcondition === "booking_draft_updated",
      "Postcondition marker was absent",
    );
    expectCondition(
      result.draft?.id === visibleDraftId && visibleDraftId === store.getSnapshot().draft?.id,
      "Visible draft did not match committed state",
    );
  });
  await run(DETERMINISTIC_CHECKS[7], () => {
    expectCondition(!tools.has("finalize_booking"), "Finalization tool was exposed");
  });

  registration.dispose();
  return {
    checks,
    passed: checks.filter((check) => check.status === "passed").length,
    total: checks.length,
    executedAt: new Date().toISOString(),
  };
}
