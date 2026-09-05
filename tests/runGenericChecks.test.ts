import { CHECKOUT_FIXTURE, CONTACT_FORM_FIXTURE, DATA_TABLE_FIXTURE, GENERIC_FIXTURES, type HtmlSnapshot } from "../src/fixtures/genericFixtures";
import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import {
  GENERIC_CHECKS,
  isPassingGenericReport,
  runGenericChecks,
  type GenericCheckId,
  type GenericCheckInput,
  type GenericCheckOptions,
} from "../src/validation/runGenericChecks";

async function inputFor(snapshot: HtmlSnapshot): Promise<GenericCheckInput> {
  const scan = await scanHtml(snapshot);
  const proposal = await inferGenericCapabilities(scan);
  return { snapshot, scan, proposal };
}

async function failing(snapshot: HtmlSnapshot, options: GenericCheckOptions): Promise<GenericCheckId[]> {
  const report = await runGenericChecks(await inputFor(snapshot), { now: () => "2026-09-05T00:00:00.000Z", ...options });
  return report.checks.filter((check) => check.status === "failed").map((check) => check.id);
}

function withExecute(
  tool: WebMCP.ModelContextTool,
  execute: WebMCP.ModelContextTool["execute"],
): WebMCP.ModelContextTool {
  return { ...tool, execute };
}

describe("generic deterministic checks", () => {
  it("passes all nine checks for every bundled fixture and binds the report to the proposal", async () => {
    for (const fixture of GENERIC_FIXTURES) {
      const input = await inputFor(fixture);
      const report = await runGenericChecks(input, { now: () => "2026-09-05T00:00:00.000Z" });

      expect(report.checks.map((check) => check.id)).toEqual(GENERIC_CHECKS.map((check) => check.id));
      expect(report.checks.filter((check) => check.status === "failed")).toEqual([]);
      expect(report.passed).toBe(9);
      expect(report.proposalHash).toBe(input.proposal.proposalHash);
      expect(isPassingGenericReport(report, input.proposal)).toBe(true);
      expect(Object.isFrozen(report)).toBe(true);
    }
  });

  it("does not disturb the caller's documents or leave tools registered", async () => {
    const input = await inputFor(CONTACT_FORM_FIXTURE);
    const before = document.body.innerHTML;
    await runGenericChecks(input);
    expect(document.body.innerHTML).toBe(before);
  });

  it("fails inventory when a tool is dropped and exclusions when an excluded action sneaks in", async () => {
    expect(await failing(CONTACT_FORM_FIXTURE, { transformTool: () => null })).toContain("inventory");

    const placeOrder: WebMCP.ModelContextTool = {
      name: "place_order",
      description: "Places the order immediately for the agent.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: () => ({}),
    };
    const ids = await failing(CHECKOUT_FIXTURE, { extraTools: [placeOrder] });
    expect(ids).toContain("inventory");
    expect(ids).toContain("exclusions-absent");
  });

  it("fails annotations when a write tool claims to be read-only", async () => {
    const ids = await failing(CONTACT_FORM_FIXTURE, {
      transformTool: (tool) => ({ ...tool, annotations: { readOnlyHint: true, untrustedContentHint: true } }),
    });
    expect(ids).toContain("annotations");
  });

  it("fails contracts when a description shrinks below the lint minimum", async () => {
    const ids = await failing(CONTACT_FORM_FIXTURE, { transformTool: (tool) => ({ ...tool, description: "short" }) });
    expect(ids).toContain("contracts");
  });

  it("fails undeclared-input when a tool accepts unknown properties", async () => {
    const ids = await failing(DATA_TABLE_FIXTURE, {
      transformTool: (tool) => withExecute(tool, () => ({ columns: [], rows: [] })),
    });
    expect(ids).toContain("undeclared-input");
  });

  it("fails no-submit when a tool submits the bound form", async () => {
    const ids = await failing(CONTACT_FORM_FIXTURE, {
      transformTool: (tool) =>
        withExecute(tool, (input, options) => {
          const form = document.createElement("form");
          form.requestSubmit();
          return tool.execute(input, options);
        }),
    });
    expect(ids).toContain("no-submit");
  });

  it("fails output-budget when a read tool returns too much", async () => {
    const ids = await failing(DATA_TABLE_FIXTURE, {
      transformTool: (tool) =>
        withExecute(tool, (input, options) => {
          if (Object.keys(input as object).length > 0 && "undeclaredProperty" in (input as object)) return tool.execute(input, options);
          return { blob: "x".repeat(2000) };
        }),
    });
    expect(ids).toContain("output-budget");
  });

  it("fails cancellation when a tool ignores an aborted signal", async () => {
    const ids = await failing(DATA_TABLE_FIXTURE, {
      transformTool: (tool) => withExecute(tool, (input) => tool.execute(input, { signal: new AbortController().signal })),
    });
    expect(ids).toContain("cancellation");
  });

  it("fails staging when a write tool skips the visible staging step", async () => {
    const ids = await failing(CONTACT_FORM_FIXTURE, {
      transformTool: (tool) =>
        withExecute(tool, (input, options) => {
          const result = tool.execute(input, options) as Record<string, unknown>;
          return { ...result, requiresHumanConfirmation: false };
        }),
    });
    expect(ids).toContain("staging");
  });

  it("serializes concurrent runs so the form prototype is always restored to the real original", async () => {
    const originalSubmit = HTMLFormElement.prototype.submit;
    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    const contact = await inputFor(CONTACT_FORM_FIXTURE);
    const table = await inputFor(DATA_TABLE_FIXTURE);

    const [a, b] = await Promise.all([runGenericChecks(contact), runGenericChecks(table)]);

    expect(a.passed).toBe(9);
    expect(b.passed).toBe(9);
    expect(HTMLFormElement.prototype.submit).toBe(originalSubmit);
    expect(HTMLFormElement.prototype.requestSubmit).toBe(originalRequestSubmit);
  });

  it("refuses to call a report passing when it belongs to another proposal", async () => {
    const contact = await inputFor(CONTACT_FORM_FIXTURE);
    const table = await inputFor(DATA_TABLE_FIXTURE);
    const report = await runGenericChecks(contact);
    expect(isPassingGenericReport(report, table.proposal)).toBe(false);
  });
});
