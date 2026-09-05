import {
  CHECKOUT_FIXTURE,
  CONTACT_FORM_FIXTURE,
  DATA_TABLE_FIXTURE,
  SEARCH_FILTERS_FIXTURE,
  type HtmlSnapshot,
} from "../src/fixtures/genericFixtures";
import { inferGenericCapabilities, type GenericProposal } from "../src/discovery/inferGenericCapabilities";
import { scanHtml, type GenericScanResult } from "../src/discovery/scanHtml";
import {
  createGenericToolDefinitions,
  registerGenericTools,
  type GenericRuntimeOptions,
  type StagedChange,
} from "../src/runtime/genericRuntime";
import type { ModelContextLike } from "../src/webmcp/registerBookingTools";

interface Harness {
  scan: GenericScanResult;
  proposal: GenericProposal;
  host: Document;
  submits: number;
  options: GenericRuntimeOptions;
  staged: StagedChange[];
}

async function harness(fixture: HtmlSnapshot, modelContext?: ModelContextLike): Promise<Harness> {
  const scan = await scanHtml(fixture);
  const proposal = await inferGenericCapabilities(scan);
  const host = new DOMParser().parseFromString(fixture.html, "text/html");
  const staged: StagedChange[] = [];
  const state = { submits: 0 };
  host.addEventListener("submit", () => {
    state.submits += 1;
  });
  return {
    scan,
    proposal,
    host,
    get submits() {
      return state.submits;
    },
    staged,
    options: {
      hostDocument: host,
      scan,
      proposal,
      modelContext,
      onStaged: (change) => staged.push(change),
      now: () => "2026-09-05T10:00:00.000Z",
      nextId: () => "staged-1",
    },
  };
}

function captureContext(): { context: ModelContextLike; tools: Map<string, WebMCP.ModelContextTool>; aborted: string[] } {
  const tools = new Map<string, WebMCP.ModelContextTool>();
  const aborted: string[] = [];
  return {
    tools,
    aborted,
    context: {
      async registerTool(tool, options) {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => aborted.push(tool.name), { once: true });
      },
    },
  };
}

function toolNamed(defs: WebMCP.ModelContextTool[], name: string): WebMCP.ModelContextTool {
  const tool = defs.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe("generic runtime adapter", () => {
  const submitSpy = vi.spyOn(HTMLFormElement.prototype, "submit");
  const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");

  afterEach(() => {
    submitSpy.mockClear();
    requestSubmitSpy.mockClear();
  });

  it("registers exactly the proposed tool names and disposes them", async () => {
    const capture = captureContext();
    const h = await harness(CONTACT_FORM_FIXTURE, capture.context);
    const registration = await registerGenericTools(h.options);

    expect(registration.supported).toBe(true);
    expect(registration.registeredTools).toEqual(h.proposal.tools.map((tool) => tool.name));
    expect([...capture.tools.keys()]).toEqual(["send_message"]);
    registration.dispose();
    expect(capture.aborted).toEqual(["send_message"]);
  });

  it("reports unsupported when there is no model context", async () => {
    const h = await harness(CONTACT_FORM_FIXTURE, undefined);
    const registration = await registerGenericTools(h.options);
    expect(registration).toMatchObject({ supported: false, registeredTools: [] });
  });

  it("rolls back every registration when one fails", async () => {
    const capture = captureContext();
    let calls = 0;
    const failing: ModelContextLike = {
      async registerTool(tool, options) {
        calls += 1;
        if (calls === 2) throw new Error("registry full");
        return capture.context.registerTool(tool, options);
      },
    };
    const h = await harness(CHECKOUT_FIXTURE, failing);
    // Give the checkout proposal a second tool by scanning a page with two writable forms.
    const twoForms: HtmlSnapshot = {
      ...CONTACT_FORM_FIXTURE,
      id: "two-forms",
      html: `${CONTACT_FORM_FIXTURE.html}<form id="f2" method="post"><label for="n">Nickname</label><input id="n" name="nickname"><button>Save nickname</button></form>`,
    };
    const h2 = await harness(twoForms, failing);
    expect(h.proposal.tools).toHaveLength(1);
    await expect(registerGenericTools(h2.options)).rejects.toThrow(/registry full/);
    expect(capture.aborted).toEqual(["send_message"]);
  });

  it("search tools apply parameters to the page controls and prepare, never perform, the request", async () => {
    const h = await harness(SEARCH_FILTERS_FIXTURE);
    const [search] = createGenericToolDefinitions(h.options);

    const result = (await search.execute({ q: "drill", category: "tools", minPrice: 10, inStock: true }, {
      signal: new AbortController().signal,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      status: "query_prepared",
      performed: false,
      request: { method: "GET", query: "q=drill&category=tools&minPrice=10&inStock=true" },
    });
    expect((h.host.querySelector('[name="q"]') as HTMLInputElement).value).toBe("drill");
    expect((h.host.querySelector('[name="category"]') as HTMLSelectElement).value).toBe("tools");
    expect((h.host.querySelector('[name="inStock"]') as HTMLInputElement).checked).toBe(true);
    expect(h.submits).toBe(0);
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();
  });

  it("table tools read rows with paging and stay inside the output budget", async () => {
    const h = await harness(DATA_TABLE_FIXTURE);
    const [read] = createGenericToolDefinitions(h.options);

    const all = (await read.execute({}, { signal: new AbortController().signal })) as Record<string, unknown>;
    expect(all).toMatchObject({ columns: ["Order", "Status", "Total", "Placed"], totalRows: 3, hasMore: false, truncated: false });
    expect((all.rows as string[][]).length).toBe(3);

    const paged = (await read.execute({ page: 2, limit: 2 }, { signal: new AbortController().signal })) as Record<string, unknown>;
    expect((paged.rows as string[][]).length).toBe(1);
    expect(paged.hasMore).toBe(false);
    expect(JSON.stringify(all).length).toBeLessThanOrEqual(1500);
  });

  it("table tools truncate rows rather than exceed the output budget", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `<tr><td>${"x".repeat(40)}${i}</td><td>${"y".repeat(40)}</td></tr>`).join("");
    const big: HtmlSnapshot = {
      ...DATA_TABLE_FIXTURE,
      id: "big-table",
      html: `<h2>Big list</h2><table id="big"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
    const h = await harness(big);
    const [read] = createGenericToolDefinitions(h.options);
    const result = (await read.execute({ limit: 100 }, { signal: new AbortController().signal })) as Record<string, unknown>;

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500);
    expect(result.truncated).toBe(true);
    expect(result.hasMore).toBe(true);
    expect((result.rows as string[][]).length).toBeGreaterThan(0);
  });

  it("write tools apply values, stage a change for human confirmation, and never submit", async () => {
    const h = await harness(CONTACT_FORM_FIXTURE);
    const send = toolNamed(createGenericToolDefinitions(h.options), "send_message");
    const input = { fullName: "Ann Example", email: "ann@example.test", message: "Hello", priority: "high" };

    const result = (await send.execute(input, { signal: new AbortController().signal })) as Record<string, unknown>;

    expect(result).toMatchObject({
      status: "draft_staged",
      requiresHumanConfirmation: true,
      humanConfirmation: { surface: "visible-interface", method: "webauthn-user-presence", toolAvailable: false },
      staged: { id: "staged-1", actionLabel: "Send message", fields: input },
    });
    expect(h.staged).toEqual([
      expect.objectContaining({
        id: "staged-1",
        toolName: "send_message",
        actionLabel: "Send message",
        heading: "Contact us",
        method: "post",
        fields: input,
        stagedAt: "2026-09-05T10:00:00.000Z",
      }),
    ]);
    expect((h.host.querySelector("#full-name") as HTMLInputElement).value).toBe("Ann Example");
    const radios = [...h.host.querySelectorAll('[name="priority"]')] as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).toEqual([false, true]);
    expect(h.submits).toBe(0);
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching any control", async () => {
    const h = await harness(CONTACT_FORM_FIXTURE);
    const send = toolNamed(createGenericToolDefinitions(h.options), "send_message");
    const signal = new AbortController().signal;

    expect(() => send.execute({ fullName: "A", email: "x", message: "m", priority: "high" }, { signal })).toThrow(
      /email must be an email address/,
    );
    expect(() => send.execute({ fullName: "A", email: "a@b.co", message: "m", priority: "urgent" }, { signal })).toThrow(
      /priority must be one of/,
    );
    expect(() => send.execute({ fullName: "A", email: "a@b.co", message: "m" }, { signal })).toThrow(/priority is required/);
    expect(() =>
      send.execute({ fullName: "A", email: "a@b.co", message: "m", priority: "low", cartToken: "x" }, { signal }),
    ).toThrow(/Unexpected input property: cartToken/);
    expect((h.host.querySelector("#full-name") as HTMLInputElement).value).toBe("");
    expect(h.staged).toEqual([]);
  });

  it("honours an aborted execution signal", async () => {
    const h = await harness(DATA_TABLE_FIXTURE);
    const [read] = createGenericToolDefinitions(h.options);
    const controller = new AbortController();
    controller.abort();

    let caught: unknown;
    try {
      read.execute({}, { signal: controller.signal });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DOMException);
    expect((caught as DOMException).name).toBe("AbortError");
  });

  it("never binds a tool to the finalizing order form or a credential form", async () => {
    const h = await harness(CHECKOUT_FIXTURE);
    const defs = createGenericToolDefinitions(h.options);

    expect(defs.map((tool) => tool.name)).toEqual(["apply_coupon"]);
    const forged: GenericProposal = {
      ...h.proposal,
      tools: [
        {
          ...h.proposal.tools[0],
          name: "place_order",
          capabilityId: h.scan.capabilities.find((c) => c.selector === "#order-form")!.id,
        },
      ],
    };
    expect(() => createGenericToolDefinitions({ ...h.options, proposal: forged })).toThrow(/finalize action; refusing/);
  });

  it("fails clearly when a bound control has drifted off the page", async () => {
    const h = await harness(CONTACT_FORM_FIXTURE);
    h.host.querySelector("#email")?.remove();
    const send = toolNamed(createGenericToolDefinitions(h.options), "send_message");

    expect(() =>
      send.execute({ fullName: "A", email: "a@b.co", message: "m", priority: "low" }, { signal: new AbortController().signal }),
    ).toThrow(/control for email is missing/);
  });
});
