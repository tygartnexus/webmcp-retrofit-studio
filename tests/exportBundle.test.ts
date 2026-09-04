import {
  buildExportBundle,
  serializeVerifiedExportBundle,
  type ExportBundle,
} from "../src/export/buildExportBundle";
import { BOOKING_TOOL_NAMES } from "../src/domain/booking";
import { canonicalJson } from "../src/discovery/scanOwnedFixture";
import {
  approveCapabilities,
  createRetrofitPreview,
  createRetrofitWorkflow,
  recordValidation,
  rescanOwnedFixture,
} from "../src/workflow/retrofitWorkflow";
import {
  DETERMINISTIC_CHECKS,
  type DeterministicCheckResult,
} from "../src/validation/runDeterministicChecks";

function validationResult(passed: number = DETERMINISTIC_CHECKS.length) {
  const checks: DeterministicCheckResult[] = DETERMINISTIC_CHECKS.map(
    (check, index) => ({
      ...check,
      status: index < passed ? "passed" : "failed",
      detail: "test evidence",
    }),
  );
  return { checks, passed, total: checks.length };
}

async function createExportReadyWorkflow() {
  let state = await rescanOwnedFixture(createRetrofitWorkflow());
  state = approveCapabilities(state, BOOKING_TOOL_NAMES);
  state = createRetrofitPreview(state);
  return recordValidation(state, validationResult());
}

function mutableClone(bundle: ExportBundle): ExportBundle {
  return JSON.parse(JSON.stringify(bundle)) as ExportBundle;
}

describe("deterministic export bundle", () => {
  it("emits a deterministic manifest, evidence record, and generated registration source", async () => {
    const state = await createExportReadyWorkflow();

    const first = await buildExportBundle(state);
    const second = await buildExportBundle(state);

    expect(first).toEqual(second);
    expect(first.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.manifest.toolNames).toEqual(BOOKING_TOOL_NAMES);
    expect(first.manifest.validation.checkIds).toEqual(
      DETERMINISTIC_CHECKS.map((check) => check.id),
    );
    expect(first.files.map((file) => file.path)).toEqual([
      "webmcp-retrofit.manifest.json",
      "webmcp-retrofit.evidence.json",
      "webmcp-retrofit.generated.js",
    ]);
    expect(first.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(
      true,
    );
    expect(first.generatedJavaScript).toContain(
      "document.modelContext.registerTool",
    );
    expect(first.generatedJavaScript).toContain(
      "export async function registerWebMcpRetrofit",
    );
    expect(first.generatedJavaScript).toContain("registrationSignal");
    expect(first.generatedJavaScript).toContain("new AbortController()");
    expect(first.generatedJavaScript).toContain(
      "signal: registrationController.signal",
    );
    expect(first.generatedJavaScript).toContain("dispose()");
    expect(first.generatedJavaScript).toContain("registrationController.abort");
    expect(first.generatedJavaScript).toContain("client?.signal?.aborted");
    for (const toolName of BOOKING_TOOL_NAMES) {
      expect(first.generatedJavaScript).toContain(`"${toolName}"`);
    }
  });

  it("contains no raw HTML, credentials, forbidden finalization, network, or deployment behavior", async () => {
    const bundle = await buildExportBundle(await createExportReadyWorkflow());
    const serialized = JSON.stringify(bundle);

    expect(serialized).not.toMatch(/<\/?(?:html|form|script)\b/i);
    expect(serialized).not.toMatch(/password|authorization:\s*bearer|api[_-]?key/i);
    expect(serialized).not.toContain("finalize_booking");
    expect(bundle.generatedJavaScript).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\b/,
    );
    expect(serialized).not.toMatch(/\b(?:deploy|publish)\s*\(/i);
  });

  it("serializes only a fully verified canonical bundle", async () => {
    const bundle = await buildExportBundle(await createExportReadyWorkflow());

    const serialized = await serializeVerifiedExportBundle(bundle);

    expect(serialized).toBe(canonicalJson(bundle));
    expect(JSON.parse(serialized)).toEqual(bundle);
  });

  it.each([
    [
      "file content",
      (bundle: ExportBundle) => {
        (bundle.files as ExportBundle["files"] & { 1: { content: string } })[1]
          .content += " ";
      },
    ],
    [
      "top-level evidence",
      (bundle: ExportBundle) => {
        (bundle.evidence as { sourceFixtureId: string }).sourceFixtureId =
          "tampered-fixture";
      },
    ],
    [
      "top-level manifest",
      (bundle: ExportBundle) => {
        (bundle.manifest as { sourceFixtureId: string }).sourceFixtureId =
          "tampered-fixture";
      },
    ],
    [
      "generated source",
      (bundle: ExportBundle) => {
        (bundle as { generatedJavaScript: string }).generatedJavaScript +=
          "\n// tampered";
      },
    ],
  ])("rejects mutated %s before serialization", async (_label, mutate) => {
    const bundle = mutableClone(
      await buildExportBundle(await createExportReadyWorkflow()),
    );
    mutate(bundle);

    await expect(serializeVerifiedExportBundle(bundle)).rejects.toThrow(
      /integrity/i,
    );
  });

  it("refuses export before a complete passing validation", async () => {
    let state = await rescanOwnedFixture(createRetrofitWorkflow());
    state = approveCapabilities(state, BOOKING_TOOL_NAMES);
    state = createRetrofitPreview(state);

    await expect(buildExportBundle(state)).rejects.toThrow(/passing validation/i);

    const failed = recordValidation(state, validationResult(7));
    await expect(buildExportBundle(failed)).rejects.toThrow(/passing validation/i);
  });

  it("rejects a proposal whose reviewed capability inventory was mutated", async () => {
    const state = await createExportReadyWorkflow();
    const tampered = {
      ...state,
      proposal: {
        ...state.proposal!,
        capabilities: [
          ...state.proposal!.capabilities,
          {
            ...state.proposal!.capabilities[0],
            name: "finalize_booking",
          },
        ],
      },
    } as unknown as typeof state;

    await expect(buildExportBundle(tampered)).rejects.toThrow(
      /current reviewed proposal/i,
    );
  });

  it("rejects tampered duplicate or reordered approved tool inventories", async () => {
    const state = await createExportReadyWorkflow();
    const duplicate = {
      ...state,
      approvedToolNames: [
        "search_services",
        "get_availability",
        "stage_booking",
        "stage_booking",
      ],
    } as unknown as typeof state;
    const reordered = {
      ...state,
      approvedToolNames: [
        "stage_booking",
        "get_availability",
        "search_services",
      ],
    } as unknown as typeof state;

    await expect(buildExportBundle(duplicate)).rejects.toThrow(
      /current reviewed proposal/i,
    );
    await expect(buildExportBundle(reordered)).rejects.toThrow(
      /current reviewed proposal/i,
    );
  });

  it("rejects a forged one-of-one passing validation", async () => {
    const state = await createExportReadyWorkflow();
    const forged = {
      ...state,
      validation: {
        ...state.validation!,
        passed: 1,
        total: 1,
        checkIds: ["inventory"],
      },
    } as unknown as typeof state;

    await expect(buildExportBundle(forged)).rejects.toThrow(
      /passing validation/i,
    );
  });

  it("emits executable registration source with owner cleanup and execution cancellation", async () => {
    const bundle = await buildExportBundle(await createExportReadyWorkflow());
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(
      bundle.generatedJavaScript,
    ).toString("base64")}`;
    const generated = (await import(moduleUrl)) as {
      registerWebMcpRetrofit(options: {
        adapter: {
          execute(name: string, input: unknown): Promise<unknown>;
        };
        registrationSignal: AbortSignal;
      }): Promise<{
        registeredTools: readonly string[];
        dispose(): void;
      }>;
    };
    const tools = new Map<string, WebMCP.ModelContextTool>();
    const registrationSignals: AbortSignal[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          tool: WebMCP.ModelContextTool,
          options?: WebMCP.ModelContextRegisterToolOptions,
        ) {
          tools.set(tool.name, tool);
          if (options?.signal) {
            registrationSignals.push(options.signal);
            options.signal.addEventListener(
              "abort",
              () => tools.delete(tool.name),
              { once: true },
            );
          }
        },
      },
    });
    const owner = new AbortController();

    try {
      const registration = await generated.registerWebMcpRetrofit({
        adapter: {
          async execute(name, input) {
            return { name, input };
          },
        },
        registrationSignal: owner.signal,
      });
      expect(registration.registeredTools).toEqual(BOOKING_TOOL_NAMES);
      expect(tools.size).toBe(3);

      const execution = new AbortController();
      execution.abort("test cancellation");
      await expect(
        tools.get("search_services")!.execute(
          { query: "repair" },
          { signal: execution.signal },
        ),
      ).rejects.toMatchObject({ name: "AbortError" });

      registration.dispose();
      expect(registrationSignals.every((signal) => signal.aborted)).toBe(true);
      expect(tools.size).toBe(0);
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("does not relabel an in-flight adapter outcome when registration is disposed", async () => {
    const bundle = await buildExportBundle(await createExportReadyWorkflow());
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(
      bundle.generatedJavaScript,
    ).toString("base64")}`;
    const generated = (await import(moduleUrl)) as {
      registerWebMcpRetrofit(options: {
        adapter: { execute(): Promise<unknown> };
      }): Promise<{ dispose(): void }>;
    };
    const tools = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
    });
    let resolveAdapter!: (value: unknown) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    try {
      const registration = await generated.registerWebMcpRetrofit({
        adapter: {
          execute() {
            markStarted();
            return new Promise((resolve) => {
              resolveAdapter = resolve;
            });
          },
        },
      });
      const execution = tools.get("stage_booking")!.execute(
        { serviceId: "repair", date: "2026-09-05", time: "14:30" },
        { signal: new AbortController().signal },
      );
      await started;
      registration.dispose();
      resolveAdapter({ status: "adapter_committed" });

      await expect(execution).resolves.toEqual({ status: "adapter_committed" });
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
