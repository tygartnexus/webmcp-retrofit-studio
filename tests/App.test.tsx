import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { STAGE_BOOKING_TOOL_CONTRACT } from "../src/webmcp/bookingToolContracts";

async function scanToCandidates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }),
  );
  await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
  await screen.findByRole("heading", { name: "Candidate capabilities" });
}

async function advanceToValidate(user: ReturnType<typeof userEvent.setup>) {
  await scanToCandidates(user);
  await user.click(screen.getByRole("button", { name: "Approve for preview" }));
  await user.click(screen.getByRole("button", { name: /Preview/ }));
  await user.click(
    screen.getByRole("button", { name: "Lock version for validation" }),
  );
}

describe("Retrofit Studio workbench", () => {
  it("renders the approved candidate review hierarchy and all response modes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    expect(
      screen.getByRole("heading", { name: "Candidate capabilities" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accuracy Mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Red Team Mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CEO Review Mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Technical Review Mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Legal Risk Review Mode" })).toBeInTheDocument();
  });

  it("switches review modes while preserving the evidence contract", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    const redTeam = screen.getByRole("button", { name: "Red Team Mode" });
    await user.click(redTeam);

    expect(redTeam).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Red Team Mode")).toBeInTheDocument();
    const quality = screen.getByTestId("quality-evidence");
    expect(quality).toBeInTheDocument();
    expect(within(quality).getByText(/Hostile red-team review · v1.0.0/)).toBeInTheDocument();
    const headings = [...quality.querySelectorAll(".evidence-section h3")].map(
      (heading) => heading.textContent?.trim(),
    );
    expect(headings[0]).toBe("Risks");
  });

  it("routes CEO mode to its prompt and decision-first presentation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    await user.click(screen.getByRole("button", { name: "CEO Review Mode" }));
    const quality = screen.getByTestId("quality-evidence");
    expect(within(quality).getByText(/CEO reality check · v1.0.0/)).toBeInTheDocument();
    expect(quality.querySelector(".evidence-section h3")?.textContent).toContain(
      "Recommendation",
    );
  });

  it("shows facts, uncertainty, counterarguments, recommendation, and change conditions", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    const quality = screen.getByTestId("quality-evidence");
    for (const heading of [
      "Facts",
      "Evidence",
      "Assumptions",
      "Unknowns",
      "Confidence",
      "Risks",
      "Counterarguments",
      "Recommendation",
      "What would change it",
    ]) {
      expect(within(quality).getByText(heading)).toBeInTheDocument();
    }
  });

  it("marks final booking as visible-UI-only and absent from the tool contract", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    expect(screen.getAllByText("finalize_booking")).toHaveLength(2);
    expect(screen.getByText("Not exposed")).toBeInTheDocument();
    expect(screen.getByText(/visible UI only/i)).toBeInTheDocument();
  });

  it("shows the fixed handler binding and required postcondition tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    await user.click(screen.getByRole("tab", { name: "Binding" }));
    expect(screen.getByText("booking.stageBooking")).toBeInTheDocument();
    expect(screen.getByText("Fixed local binding")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tests" }));
    expect(screen.getByText("booking_draft_updated")).toBeInTheDocument();
    expect(screen.getByText("Final submission absent")).toBeInTheDocument();
  });

  it("renders the exact shared stage_booking contract that is registered", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    const renderedContract = JSON.parse(
      screen.getByLabelText("Generated tool contract").querySelector("pre")!
        .textContent!,
    );
    expect(renderedContract).toEqual(STAGE_BOOKING_TOOL_CONTRACT);
  });

  it("runs the deterministic validation checks before reporting passes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await advanceToValidate(user);

    expect(
      screen.getByRole("heading", { name: "Validate generated tools" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not run")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Run deterministic checks" }),
    );
    expect(await screen.findByText("8/8 passed")).toBeInTheDocument();
    expect(screen.getByText(/final booking remains outside WebMCP/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeInTheDocument();
  });

  it("requires a staged draft, exact visible confirmation, and a presence ceremony", async () => {
    const user = userEvent.setup();
    const verifier = {
      method: "webauthn-user-presence" as const,
      available: true,
      async verify(subject: string) {
        return {
          method: "webauthn-user-presence" as const,
          ceremony: "registration" as const,
          subject,
          rpId: "example.test",
          userPresent: true as const,
          userVerified: false,
          credentialIdSha256: "cd".repeat(32),
          verifiedAt: "2026-09-04T15:00:00.000Z",
        };
      },
    };
    render(<App presenceVerifier={verifier} />);
    await advanceToValidate(user);
    const confirm = screen.getByRole("button", { name: "Confirm booking" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Stage selected draft" }));
    expect(confirm).toBeEnabled();
    expect(screen.queryByText("Observed")).not.toBeInTheDocument();
    await user.click(confirm);
    const dialog = screen.getByRole("dialog", { name: "Confirm staged booking" });
    expect(within(dialog).getByText("Consultation")).toBeInTheDocument();
    expect(within(dialog).getByText("2026-09-03 at 10:00")).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm with passkey" }),
    );
    expect(await screen.findByText(/Confirmed with verified human presence/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("presence only");
  });

  it("closes confirmation with Escape and restores focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<App />);
    await advanceToValidate(user);
    await user.click(screen.getByRole("button", { name: "Stage selected draft" }));
    const trigger = screen.getByRole("button", { name: "Confirm booking" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Confirm staged booking" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Confirm staged booking" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("updates every visible booking field when stage_booking executes", async () => {
    const user = userEvent.setup();
    const tools = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
    });

    try {
      render(<App />);
      await advanceToValidate(user);
      await screen.findAllByText("3 live tools registered");

      await act(async () => {
        await tools.get("stage_booking")!.execute(
          { serviceId: "installation", date: "2026-09-04", time: "11:00" },
          { signal: new AbortController().signal },
        );
      });

      expect(await screen.findByLabelText("Service")).toHaveValue("installation");
      expect(screen.getByLabelText("Date")).toHaveValue("2026-09-04");
      expect(screen.getByLabelText("Time")).toHaveValue("11:00");
      expect(screen.getByText("Staged by tool")).toBeInTheDocument();
      expect(screen.getByText("Observed")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("registers tools only in Validate and aborts their lifecycle on exit", async () => {
    const user = userEvent.setup();
    const toolNames: string[] = [];
    const registrationSignals: AbortSignal[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          tool: WebMCP.ModelContextTool,
          options?: WebMCP.ModelContextRegisterToolOptions,
        ) {
          toolNames.push(tool.name);
          if (options?.signal) registrationSignals.push(options.signal);
        },
      },
    });

    try {
      render(<App />);
      expect(toolNames).toEqual([]);
      await scanToCandidates(user);
      expect(toolNames).toEqual([]);
      await user.click(screen.getByRole("button", { name: "Approve for preview" }));
      await user.click(screen.getByRole("button", { name: /Preview/ }));

      expect(screen.getAllByText("Registration deferred to Validate")).toHaveLength(2);
      expect(toolNames).toEqual([]);

      await user.click(
        screen.getByRole("button", { name: "Lock version for validation" }),
      );
      expect(await screen.findAllByText("3 live tools registered")).toHaveLength(2);
      expect(toolNames).toEqual([
        "search_services",
        "get_availability",
        "stage_booking",
      ]);

      await user.click(screen.getByRole("button", { name: /Candidates/ }));
      expect(registrationSignals).toHaveLength(3);
      expect(registrationSignals.every((signal) => signal.aborted)).toBe(true);
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("aborts registration immediately when the Validate runtime is left mid-registration", async () => {
    const user = userEvent.setup();
    const registrationSignals: AbortSignal[] = [];
    let calls = 0;
    let releaseSecondRegistration!: () => void;
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          _tool: WebMCP.ModelContextTool,
          options?: WebMCP.ModelContextRegisterToolOptions,
        ) {
          calls += 1;
          if (options?.signal) registrationSignals.push(options.signal);
          if (calls === 2) {
            await new Promise<void>((resolve) => {
              releaseSecondRegistration = resolve;
            });
          }
        },
      },
    });

    try {
      render(<App />);
      await scanToCandidates(user);
      await user.click(screen.getByRole("button", { name: "Approve for preview" }));
      await user.click(screen.getByRole("button", { name: /Preview/ }));
      expect(calls).toBe(0);
      await user.click(
        screen.getByRole("button", { name: "Lock version for validation" }),
      );
      await vi.waitFor(() => expect(calls).toBe(2));

      await user.click(screen.getByRole("button", { name: /Candidates/ }));
      expect(registrationSignals).toHaveLength(2);
      expect(registrationSignals.every((signal) => signal.aborted)).toBe(true);
      releaseSecondRegistration();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("treats a partial modelContext as unsupported instead of a failed registration", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {},
    });

    try {
      render(<App />);
      await advanceToValidate(user);
      expect(await screen.findAllByText("Live discovery unavailable")).toHaveLength(2);
      expect(screen.queryByText("Registration failed closed")).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("keeps an approved version and its validation evidence stable when revisited", async () => {
    const user = userEvent.setup();
    const tools = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
    });

    try {
      render(<App />);
      await advanceToValidate(user);
      await screen.findAllByText("3 live tools registered");
      await user.click(screen.getByRole("button", { name: "Run deterministic checks" }));
      expect(await screen.findByText("8/8 passed")).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Record current-browser UAT" }),
      );

      await user.click(screen.getByRole("button", { name: /Candidates/ }));
      const approvedButton = screen.getByRole("button", {
        name: "Approved for preview",
      });
      expect(approvedButton).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /Validate/ }));
      expect(screen.getByText("8/8 passed")).toBeInTheDocument();
      expect(screen.getByText("Operator attestation recorded")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("clears staged and confirmed state when capabilities are rejected", async () => {
    const user = userEvent.setup();
    const tools = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
    });

    try {
      render(<App />);
      await advanceToValidate(user);
      await screen.findAllByText("3 live tools registered");
      await act(async () => {
        await tools.get("stage_booking")!.execute(
          { serviceId: "repair", date: "2026-09-05", time: "14:30" },
          { signal: new AbortController().signal },
        );
      });
      expect(await screen.findByText("Observed")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Candidates/ }));
      await user.click(screen.getByRole("button", { name: "Reject" }));
      await user.click(screen.getByRole("button", { name: "Approve for preview" }));
      await user.click(screen.getByRole("button", { name: /Preview/ }));
      await user.click(
        screen.getByRole("button", { name: "Lock version for validation" }),
      );

      expect(screen.queryByText("Observed")).not.toBeInTheDocument();
      expect(screen.queryByText("Staged by tool")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm booking" })).toBeDisabled();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
