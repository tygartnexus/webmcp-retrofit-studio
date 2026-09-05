import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "../extension/shim.js";
import "../extension/popup-logic.js";
import { CONTACT_FORM_FIXTURE } from "../src/fixtures/genericFixtures";
import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import { buildGenericExportBundle } from "../src/export/buildGenericExportBundle";
import { runGenericChecks } from "../src/validation/runGenericChecks";

interface ToolSummary {
  name: string;
  title: string;
  description: string;
  inputSchema: unknown;
  annotations: Record<string, unknown>;
}

interface RegistryContext {
  registerTool(tool: object, options?: { signal?: AbortSignal }): Promise<void>;
  unregisterTool(name: string): void;
  provideContext(options: { tools: object[] }): void;
  clearContext(): void;
}

interface Registry {
  context: RegistryContext;
  list(): ToolSummary[];
  call(name: string, input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  onChange(listener: () => void): () => void;
}

interface Response {
  id: string | null;
  ok: boolean;
  result?: unknown;
  error?: { name: string; message: string };
}

interface Shim {
  createRegistry(): Registry;
  handleRequest(registry: Registry, request: unknown): Promise<Response>;
  mirrorNative(registry: Registry, native: unknown): string[];
}

interface Popup {
  sampleInput(tool: object): string;
  isReadOnly(tool: unknown): boolean;
  statusText(count: number): string;
  describeResponse(response: unknown): { text: string; isError: boolean };
  pageQuery(request: { id: string; type: string; name?: string; input?: unknown }): unknown;
}

const globals = globalThis as unknown as { WebMcpShim: Shim; WebMcpPopup: Popup; __webmcpAgentRegistry?: Registry };
const shim = globals.WebMcpShim;
const popup = globals.WebMcpPopup;
const MAIN_WORLD_SOURCE = readFileSync(resolve(__dirname, "../extension/main-world.js"), "utf8");

function tool(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    title: name,
    description: `Tool ${name}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input: unknown) => ({ echoed: input }),
    ...extra,
  };
}

function runMainWorld() {
  new Function(MAIN_WORLD_SOURCE)();
}

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
  Reflect.deleteProperty(globalThis, "__webmcpAgentRegistry");
});

describe("extension shim registry", () => {
  it("registers, lists summaries without the execute function, and calls tools", async () => {
    const registry = shim.createRegistry();
    await registry.context.registerTool(tool("read_orders"));

    const [summary] = registry.list();
    expect(summary).toEqual({
      name: "read_orders",
      title: "read_orders",
      description: "Tool read_orders",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    });
    expect("execute" in summary).toBe(false);
    expect(await registry.call("read_orders", { page: 1 })).toEqual({ echoed: { page: 1 } });
  });

  it("rejects invalid names, missing execute, non-serializable schemas, and duplicates", async () => {
    const registry = shim.createRegistry();
    expect(() => registry.context.registerTool(tool("bad name"))).toThrow(/Tool name must match/);
    expect(() => registry.context.registerTool(tool("no_exec", { execute: undefined }))).toThrow(/execute function/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => registry.context.registerTool(tool("cyclic", { inputSchema: cyclic }))).toThrow(/JSON-serializable/);
    await registry.context.registerTool(tool("dup"));
    await expect(registry.context.registerTool(tool("dup"))).rejects.toThrow(/already registered/);
    expect(registry.list().map((t) => t.name)).toEqual(["dup"]);
  });

  it("removes a tool when its registration signal aborts and notifies listeners", async () => {
    const registry = shim.createRegistry();
    const changes: number[] = [];
    registry.onChange(() => changes.push(registry.list().length));
    const controller = new AbortController();
    await registry.context.registerTool(tool("scoped"), { signal: controller.signal });
    expect(registry.list()).toHaveLength(1);
    controller.abort();
    expect(registry.list()).toHaveLength(0);
    expect(changes).toEqual([1, 0]);

    const aborted = new AbortController();
    aborted.abort();
    await registry.context.registerTool(tool("never"), { signal: aborted.signal });
    expect(registry.list()).toHaveLength(0);
  });

  it("provideContext is atomic: a bad or duplicate entry leaves the registry unchanged", async () => {
    const registry = shim.createRegistry();
    await registry.context.registerTool(tool("a"));

    expect(() => registry.context.provideContext({ tools: [tool("b"), tool("bad name")] })).toThrow(/Tool name/);
    expect(registry.list().map((t) => t.name)).toEqual(["a"]);
    expect(() => registry.context.provideContext({ tools: [tool("b"), tool("b")] })).toThrow(/Duplicate tool name/);
    expect(registry.list().map((t) => t.name)).toEqual(["a"]);

    registry.context.provideContext({ tools: [tool("b"), tool("c")] });
    expect(registry.list().map((t) => t.name)).toEqual(["b", "c"]);
    registry.context.unregisterTool("b");
    expect(registry.list().map((t) => t.name)).toEqual(["c"]);
    registry.context.clearContext();
    expect(registry.list()).toEqual([]);
  });

  it("answers list, call, unknown, malformed, and failing requests with matched ids", async () => {
    const registry = shim.createRegistry();
    await registry.context.registerTool(
      tool("boom", {
        execute: () => {
          throw new TypeError("nope");
        },
      }),
    );
    await registry.context.registerTool(tool("ok"));

    expect(await shim.handleRequest(registry, { id: "1", type: "list" })).toMatchObject({
      id: "1",
      ok: true,
      result: [{ name: "boom" }, { name: "ok" }],
    });
    expect(await shim.handleRequest(registry, { id: "2", type: "call", name: "ok", input: { x: 1 } })).toEqual({
      id: "2",
      ok: true,
      result: { echoed: { x: 1 } },
    });
    expect(await shim.handleRequest(registry, { id: "3", type: "call", name: "boom" })).toEqual({
      id: "3",
      ok: false,
      error: { name: "TypeError", message: "nope" },
    });
    expect(await shim.handleRequest(registry, { id: "4", type: "call", name: "missing" })).toMatchObject({
      ok: false,
      error: { message: /No tool named missing/ },
    });
    expect(await shim.handleRequest(registry, { id: "5", type: "dance" })).toMatchObject({ ok: false });
    expect(await shim.handleRequest(registry, "garbage")).toMatchObject({ id: null, ok: false });
  });

  it("turns a list failure caused by a schema mutated after registration into an error response", async () => {
    const registry = shim.createRegistry();
    const mutable = tool("shifty");
    await registry.context.registerTool(mutable);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    mutable.inputSchema = cyclic as never;

    const response = await shim.handleRequest(registry, { id: "9", type: "list" });
    expect(response).toMatchObject({ id: "9", ok: false, error: { name: "TypeError" } });
  });
});

describe("native mirror and main-world installer", () => {
  it("mirrors all four methods of a writable native context without blocking the page's calls", async () => {
    const registry = shim.createRegistry();
    const nativeTools: string[] = [];
    const native = {
      registerTool: async (t: { name: string }) => {
        nativeTools.push(t.name);
      },
      unregisterTool: (name: string) => {
        nativeTools.splice(nativeTools.indexOf(name), 1);
      },
      provideContext: (options: { tools: { name: string }[] }) => {
        nativeTools.splice(0, nativeTools.length, ...options.tools.map((t) => t.name));
      },
      clearContext: () => {
        nativeTools.splice(0);
      },
    };

    expect(shim.mirrorNative(registry, native)).toEqual(["registerTool", "unregisterTool", "provideContext", "clearContext"]);
    await native.registerTool(tool("x"));
    await native.registerTool(tool("x"));
    expect(nativeTools).toEqual(["x", "x"]);
    expect(registry.list().map((t) => t.name)).toEqual(["x"]);
    native.unregisterTool("x");
    expect(registry.list()).toEqual([]);
    native.provideContext({ tools: [tool("y")] });
    expect(registry.list().map((t) => t.name)).toEqual(["y"]);
    native.clearContext();
    expect(registry.list()).toEqual([]);
  });

  it("leaves a frozen native context alone and reports nothing mirrored", () => {
    const registry = shim.createRegistry();
    const native = Object.freeze({ registerTool: async () => {} });
    expect(shim.mirrorNative(registry, native)).toEqual([]);
    expect(shim.mirrorNative(registry, null)).toEqual([]);
  });

  it("installs the registry as document.modelContext when the browser has none", async () => {
    runMainWorld();
    const context = (document as unknown as { modelContext: RegistryContext }).modelContext;
    await context.registerTool(tool("from_page"));
    expect(globals.__webmcpAgentRegistry?.list().map((t) => t.name)).toEqual(["from_page"]);
    expect(await popup.pageQuery({ id: "p1", type: "list" })).toMatchObject({ ok: true, result: [{ name: "from_page" }] });
  });

  it("mirrors an existing native context and survives a frozen one", async () => {
    const seen: string[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (t: { name: string }) => {
          seen.push(t.name);
        },
      },
    });
    runMainWorld();
    await (document as unknown as { modelContext: RegistryContext }).modelContext.registerTool(tool("native_tool"));
    expect(seen).toEqual(["native_tool"]);
    expect(globals.__webmcpAgentRegistry?.list().map((t) => t.name)).toEqual(["native_tool"]);

    Reflect.deleteProperty(globalThis, "__webmcpAgentRegistry");
    Object.defineProperty(document, "modelContext", { configurable: true, value: Object.freeze({ registerTool: async () => {} }) });
    expect(() => runMainWorld()).not.toThrow();
    expect(globals.__webmcpAgentRegistry?.list()).toEqual([]);
  });

  it("pageQuery reports a missing shim instead of throwing", () => {
    expect(popup.pageQuery({ id: "q", type: "list" })).toMatchObject({ id: "q", ok: false, error: { message: /not installed/ } });
  });
});

describe("popup helpers", () => {
  it("treats only an explicit readOnlyHint as read-only", () => {
    expect(popup.isReadOnly(tool("r"))).toBe(true);
    expect(popup.isReadOnly({ ...tool("w"), annotations: { readOnlyHint: false } })).toBe(false);
    expect(popup.isReadOnly({ ...tool("w"), annotations: {} })).toBe(false);
    expect(popup.isReadOnly(null)).toBe(false);
  });

  it("builds sample input from required properties and describes responses", () => {
    const t = {
      ...tool("s"),
      inputSchema: {
        type: "object",
        properties: { q: { type: "string" }, n: { type: "integer", minimum: 3 }, e: { type: "string", enum: ["a", "b"] }, b: { type: "boolean" } },
        required: ["q", "n", "e", "b"],
      },
    };
    expect(JSON.parse(popup.sampleInput(t))).toEqual({ q: "", n: 3, e: "a", b: true });
    expect(popup.statusText(0)).toMatch(/No WebMCP tools/);
    expect(popup.statusText(2)).toBe("2 tools registered on this page");
    expect(popup.describeResponse({ ok: true, result: { a: 1 } })).toEqual({ text: '{\n  "a": 1\n}', isError: false });
    expect(popup.describeResponse({ ok: false, error: { name: "TypeError", message: "bad" } })).toEqual({ text: "TypeError: bad", isError: true });
    expect(popup.describeResponse(null)).toMatchObject({ isError: true });
  });
});

describe("studio export into the shim", () => {
  it("lets a studio-exported embed register into the shim and stage a write through it", async () => {
    const snapshot = CONTACT_FORM_FIXTURE;
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;

    const registry = shim.createRegistry();
    Object.defineProperty(document, "modelContext", { configurable: true, value: registry.context });
    const staged: unknown[] = [];
    const onStaged = (event: Event) => staged.push(JSON.parse(JSON.stringify((event as CustomEvent).detail)));
    window.addEventListener("webmcp-retrofit:staged", onStaged);
    try {
      document.body.innerHTML = new DOMParser().parseFromString(snapshot.html, "text/html").body.innerHTML;
      new Function(embed)();
      await Promise.resolve();

      expect(registry.list().map((t) => t.name)).toEqual(["send_message"]);
      const response = await shim.handleRequest(registry, {
        id: "call-1",
        type: "call",
        name: "send_message",
        input: { fullName: "Ann", email: "ann@example.test", message: "Hi", priority: "low" },
      });
      expect(response).toMatchObject({ ok: true, result: { status: "draft_staged", requiresHumanConfirmation: true } });
      expect(staged).toHaveLength(1);
    } finally {
      window.removeEventListener("webmcp-retrofit:staged", onStaged);
    }
  });
});
