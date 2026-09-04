import {
  DETERMINISTIC_CHECKS,
  runDeterministicChecks,
  type DeterministicCheckResult,
  type DeterministicCheckOptions,
} from "../src/validation/runDeterministicChecks";

type CheckId = DeterministicCheckResult["id"];

async function statusOf(
  id: CheckId,
  options: DeterministicCheckOptions,
): Promise<DeterministicCheckResult> {
  const report = await runDeterministicChecks(options);
  const result = report.checks.find((check) => check.id === id);
  if (!result) throw new Error(`check ${id} missing from report`);
  return result;
}

function passthrough<T extends WebMCP.ModelContextTool>(tool: T): T {
  return tool;
}

describe("deterministic checks fail on broken inputs", () => {
  it("keeps the eight-check inventory when options are supplied", async () => {
    const report = await runDeterministicChecks({ transformTool: passthrough });
    expect(report.checks.map((check) => check.id)).toEqual(
      DETERMINISTIC_CHECKS.map((check) => check.id),
    );
    expect(report.passed).toBe(8);
  });

  it("inventory fails when a tool is missing from registration", async () => {
    const result = await statusOf("inventory", {
      transformTool: (tool) => (tool.name === "get_availability" ? null : tool),
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/inventory/i);
  });

  it("annotations fail when a read tool is not marked read-only", async () => {
    const result = await statusOf("annotations", {
      transformTool: (tool) =>
        tool.name === "search_services"
          ? { ...tool, annotations: { ...tool.annotations, readOnlyHint: false } }
          : tool,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/read-only/i);
  });

  it("schemas fail when a tool permits undeclared properties", async () => {
    const result = await statusOf("schemas", {
      transformTool: (tool) =>
        tool.name === "stage_booking"
          ? { ...tool, inputSchema: { ...tool.inputSchema, additionalProperties: true } }
          : tool,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/undeclared/i);
  });

  it("invalid-service fails when an unknown service is accepted", async () => {
    const result = await statusOf("invalid-service", {
      transformTool: (tool) =>
        tool.name === "get_availability"
          ? { ...tool, execute: () => ({ serviceId: "not-real", slots: [] }) }
          : tool,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/reject/i);
  });

  it("unavailable-slot fails when an unlisted slot is staged", async () => {
    const result = await statusOf("unavailable-slot", {
      transformTool: (tool) =>
        tool.name === "stage_booking"
          ? { ...tool, execute: () => ({ status: "draft_staged" }) }
          : tool,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/reject/i);
  });

  it("cancellation fails when an aborted execution still runs", async () => {
    const result = await statusOf("cancellation", {
      transformTool: (tool) =>
        tool.name === "stage_booking"
          ? {
              ...tool,
              execute: (input) => ({ status: "draft_staged", draft: input }),
            }
          : tool,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/reject|cancel/i);
  });

  it("postcondition fails when the visible draft marker is absent", async () => {
    const result = await statusOf("postcondition", {
      transformTool: (tool) =>
        tool.name === "stage_booking"
          ? { ...tool, execute: () => ({ status: "draft_staged" }) }
          : tool,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/postcondition/i);
  });

  it("finalization-absent fails when a finalize tool is registered", async () => {
    const result = await statusOf("finalization-absent", {
      transformTool: passthrough,
      extraTools: [
        {
          name: "finalize_booking",
          description: "Should never be registered.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          execute: () => ({ status: "confirmed" }),
        },
      ],
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/finalization/i);
  });
});

describe("deterministic inventory rejects unexpected tools", () => {
  it("inventory fails when an extra tool with an unexpected name is registered", async () => {
    const report = await runDeterministicChecks({
      extraTools: [
        {
          name: "delete_booking",
          description: "Should never be registered.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          execute: () => ({ status: "deleted" }),
        },
      ],
    });
    const inventory = report.checks.find((check) => check.id === "inventory");
    expect(inventory?.status).toBe("failed");
  });
});
