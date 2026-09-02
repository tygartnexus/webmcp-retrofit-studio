import {
  registerBookingTools,
  type ModelContextLike,
} from "../src/webmcp/registerBookingTools";
import { createBookingStore } from "../src/domain/booking";

class FakeModelContext implements ModelContextLike {
  readonly tools = new Map<string, WebMCP.ModelContextTool>();
  readonly registrationSignals: AbortSignal[] = [];

  async registerTool(
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ): Promise<void> {
    this.tools.set(tool.name, tool);
    if (options?.signal) {
      this.registrationSignals.push(options.signal);
      options.signal.addEventListener("abort", () => this.tools.delete(tool.name));
    }
  }
}

describe("WebMCP booking adapter", () => {
  it("fails safely while preserving the ordinary UI when WebMCP is unavailable", async () => {
    const result = await registerBookingTools({ modelContext: undefined });

    expect(result.supported).toBe(false);
    expect(result.registeredTools).toEqual([]);
    expect(result.dispose).toEqual(expect.any(Function));
  });

  it("treats a partial modelContext without registerTool as unsupported", async () => {
    const result = await registerBookingTools({
      modelContext: {} as ModelContextLike,
    });

    expect(result.supported).toBe(false);
    expect(result.registeredTools).toEqual([]);
  });

  it("registers exactly three top-level tools with narrow annotations", async () => {
    const modelContext = new FakeModelContext();
    const result = await registerBookingTools({ modelContext });

    expect(result.registeredTools).toEqual([
      "search_services",
      "get_availability",
      "stage_booking",
    ]);
    expect([...modelContext.tools]).toHaveLength(3);
    expect(modelContext.tools.has("finalize_booking")).toBe(false);
    expect(modelContext.tools.get("search_services")?.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(modelContext.tools.get("get_availability")?.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(modelContext.tools.get("stage_booking")?.annotations).toMatchObject({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
    const stageSchema = modelContext.tools.get("stage_booking")?.inputSchema as {
      additionalProperties?: unknown;
    };
    expect(stageSchema.additionalProperties).toBe(false);
  });

  it("reuses booking logic and reports visible postconditions", async () => {
    const modelContext = new FakeModelContext();
    const staged = vi.fn();
    await registerBookingTools({ modelContext, onDraftStaged: staged });

    const search = modelContext.tools.get("search_services")!;
    const availability = modelContext.tools.get("get_availability")!;
    const stage = modelContext.tools.get("stage_booking")!;
    const execution = { signal: new AbortController().signal };

    expect(await search.execute({ query: "repair" }, execution)).toMatchObject({
      count: 1,
    });
    expect(
      await availability.execute({ serviceId: "repair" }, execution),
    ).toMatchObject({ serviceId: "repair" });
    expect(
      await stage.execute(
        { serviceId: "repair", date: "2026-09-05", time: "14:30" },
        execution,
      ),
    ).toMatchObject({
      status: "draft_staged",
      visiblePostcondition: "booking_draft_updated",
      requiresHumanConfirmation: true,
      source: "synthetic_draft",
    });
    expect(staged).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "repair", status: "draft" }),
    );
  });

  it("accepts bridge executions that omit the callback options object", async () => {
    const modelContext = new FakeModelContext();
    await registerBookingTools({ modelContext });

    const executeWithoutOptions = modelContext.tools.get("search_services")!
      .execute as unknown as (input: Record<string, unknown>) => unknown;

    await expect(
      Promise.resolve(executeWithoutOptions({ query: "repair" })),
    ).resolves.toMatchObject({ count: 1 });
  });

  it("accepts bridge executions whose callback signal is undefined", async () => {
    const modelContext = new FakeModelContext();
    await registerBookingTools({ modelContext });

    const executeWithUndefinedSignal = modelContext.tools.get("search_services")!
      .execute as unknown as (
      input: Record<string, unknown>,
      options: { signal: undefined },
    ) => unknown;

    await expect(
      Promise.resolve().then(() =>
        executeWithUndefinedSignal(
          { query: "repair" },
          { signal: undefined },
        ),
      ),
    ).resolves.toMatchObject({ count: 1 });
  });

  it("honors execution cancellation separately from registration cleanup", async () => {
    const modelContext = new FakeModelContext();
    const result = await registerBookingTools({ modelContext });
    const stage = modelContext.tools.get("stage_booking")!;
    const executionController = new AbortController();
    executionController.abort("agent-cancelled");

    await expect(
      Promise.resolve().then(() =>
        stage.execute(
          { serviceId: "repair", date: "2026-09-05", time: "14:30" },
          { signal: executionController.signal },
        ),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(modelContext.registrationSignals.every((signal) => !signal.aborted)).toBe(
      true,
    );

    result.dispose();
    expect(modelContext.registrationSignals.every((signal) => signal.aborted)).toBe(
      true,
    );
    expect(modelContext.tools.size).toBe(0);
  });

  it("aborts exposed tools immediately when the owner leaves during registration", async () => {
    const ownerController = new AbortController();
    const observedSignals: AbortSignal[] = [];
    let releaseSecondRegistration!: () => void;
    let calls = 0;
    const modelContext: ModelContextLike = {
      async registerTool(_tool, options) {
        calls += 1;
        if (options?.signal) observedSignals.push(options.signal);
        if (calls === 2) {
          await new Promise<void>((resolve) => {
            releaseSecondRegistration = resolve;
          });
        }
      },
    };

    const registration = registerBookingTools({
      modelContext,
      registrationSignal: ownerController.signal,
    });
    await vi.waitFor(() => expect(calls).toBe(2));

    ownerController.abort("left-validation");
    expect(observedSignals).toHaveLength(2);
    expect(observedSignals.every((signal) => signal.aborted)).toBe(true);

    releaseSecondRegistration();
    await expect(registration).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not commit a draft when the visible-state callback throws", async () => {
    const modelContext = new FakeModelContext();
    const store = createBookingStore();
    await registerBookingTools({
      modelContext,
      store,
      onDraftStaged() {
        throw new Error("visible state unavailable");
      },
    });

    const stage = modelContext.tools.get("stage_booking")!;
    await expect(
      Promise.resolve().then(() =>
        stage.execute(
          { serviceId: "repair", date: "2026-09-05", time: "14:30" },
          { signal: new AbortController().signal },
        ),
      ),
    ).rejects.toThrow("visible state unavailable");
    expect(store.getSnapshot().draft).toBeNull();
  });

  it("does not commit when execution is cancelled at the visible-state boundary", async () => {
    const modelContext = new FakeModelContext();
    const store = createBookingStore();
    const executionController = new AbortController();
    await registerBookingTools({
      modelContext,
      store,
      onDraftStaged() {
        executionController.abort("cancelled-during-visible-update");
      },
    });

    const stage = modelContext.tools.get("stage_booking")!;
    await expect(
      Promise.resolve().then(() =>
        stage.execute(
          { serviceId: "repair", date: "2026-09-05", time: "14:30" },
          { signal: executionController.signal },
        ),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(store.getSnapshot().draft).toBeNull();
  });

  it("cleans up partial registration when one registration fails", async () => {
    let calls = 0;
    const signals: AbortSignal[] = [];
    const modelContext: ModelContextLike = {
      async registerTool(_tool, options) {
        calls += 1;
        if (options?.signal) signals.push(options.signal);
        if (calls === 2) throw new Error("registration failed");
      },
    };

    await expect(registerBookingTools({ modelContext })).rejects.toThrow(
      "registration failed",
    );
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
