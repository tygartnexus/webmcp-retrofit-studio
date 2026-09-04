import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import {
  PRESENCE_METHOD,
  PresenceVerificationError,
  type HumanPresenceVerifier,
  type PresenceReceipt,
} from "../src/presence/humanPresence";

const RECEIPT: PresenceReceipt = Object.freeze({
  method: PRESENCE_METHOD,
  ceremony: "registration",
  subject: "draft-consultation-2026-09-03-1000",
  rpId: "example.test",
  userPresent: true,
  userVerified: true,
  credentialIdSha256: "ab".repeat(32),
  verifiedAt: "2026-09-04T15:00:00.000Z",
});

function verifierThat(
  behavior: (subject: string) => Promise<PresenceReceipt>,
  available = true,
): HumanPresenceVerifier & { calls: number; subjects: string[] } {
  const verifier = {
    method: PRESENCE_METHOD,
    available,
    calls: 0,
    subjects: [] as string[],
    async verify(subject: string) {
      verifier.calls += 1;
      verifier.subjects.push(subject);
      return behavior(subject);
    },
  };
  return verifier;
}

function receiptFor(subject: string): PresenceReceipt {
  return Object.freeze({ ...RECEIPT, subject });
}

async function stageOnValidate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }),
  );
  await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
  await screen.findByRole("heading", { name: "Candidate capabilities" });
  await user.click(screen.getByRole("button", { name: "Approve for preview" }));
  await user.click(screen.getByRole("button", { name: /Preview/ }));
  await user.click(screen.getByRole("button", { name: "Lock version for validation" }));
  await user.click(screen.getByRole("button", { name: "Stage selected draft" }));
  await user.click(screen.getByRole("button", { name: "Confirm booking" }));
  return screen.getByRole("dialog", { name: "Confirm staged booking" });
}

describe("human presence gate on finalization", () => {
  it("confirms only after a presence ceremony succeeds and shows a PII-free receipt", async () => {
    const user = userEvent.setup();
    const verifier = verifierThat(async (subject) => receiptFor(subject));
    render(<App presenceVerifier={verifier} />);
    const dialog = await stageOnValidate(user);

    expect(screen.queryByText(/Confirmed with verified human presence/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Verify presence and confirm" }));

    expect(verifier.calls).toBe(1);
    expect(verifier.subjects).toEqual(["draft-consultation-2026-09-03-1000"]);
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Confirmed with verified human presence");
    expect(status).toHaveTextContent("WebAuthn registration");
    expect(status).toHaveTextContent("user verified");
    expect(status).toHaveTextContent("abababababab");
    expect(status).not.toHaveTextContent("ab".repeat(32));
    expect(screen.queryByRole("dialog", { name: "Confirm staged booking" })).not.toBeInTheDocument();
  });

  it("stays unconfirmed with a visible reason when the ceremony fails", async () => {
    const user = userEvent.setup();
    const verifier = verifierThat(async () => {
      throw new PresenceVerificationError("cancelled", "cancelled");
    });
    render(<App presenceVerifier={verifier} />);
    const dialog = await stageOnValidate(user);

    await user.click(within(dialog).getByRole("button", { name: "Verify presence and confirm" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/cancelled/i);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/stays unconfirmed/i);
    expect(screen.queryByText(/Confirmed with verified human presence/)).not.toBeInTheDocument();
    expect(dialog).toBeVisible();
  });

  it("cannot confirm when presence verification is unavailable", async () => {
    const user = userEvent.setup();
    const verifier = verifierThat(async (subject) => receiptFor(subject), false);
    render(<App presenceVerifier={verifier} />);
    const dialog = await stageOnValidate(user);

    expect(within(dialog).getByRole("alert")).toHaveTextContent(/unavailable/i);
    expect(within(dialog).getByRole("button", { name: "Verify presence and confirm" })).toBeDisabled();
    expect(verifier.calls).toBe(0);
  });

  it("uses a fail-closed default verifier when none is supplied", async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await stageOnValidate(user);

    expect(within(dialog).getByRole("button", { name: "Verify presence and confirm" })).toBeDisabled();
  });

  it("clears the receipt when the draft changes", async () => {
    const user = userEvent.setup();
    render(<App presenceVerifier={verifierThat(async (subject) => receiptFor(subject))} />);
    const dialog = await stageOnValidate(user);
    await user.click(within(dialog).getByRole("button", { name: "Verify presence and confirm" }));
    await screen.findByRole("status");

    await user.selectOptions(screen.getByLabelText("Service"), "repair");

    expect(screen.queryByText(/Confirmed with verified human presence/)).not.toBeInTheDocument();
  });

  it("rejects a gesture completed after an agent re-staged a different draft", async () => {
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
    let release: (subject: string) => void = () => {};
    const verifier = verifierThat(
      (subject) => new Promise<PresenceReceipt>((resolve) => {
        release = () => resolve(receiptFor(subject));
      }),
    );

    try {
      render(<App presenceVerifier={verifier} />);
      const dialog = await stageOnValidate(user);
      await user.click(within(dialog).getByRole("button", { name: "Verify presence and confirm" }));
      expect(verifier.subjects).toEqual(["draft-consultation-2026-09-03-1000"]);

      await act(async () => {
        await tools.get("stage_booking")!.execute(
          { serviceId: "repair", date: "2026-09-05", time: "14:30" },
          { signal: new AbortController().signal },
        );
      });
      await act(async () => {
        release("draft-consultation-2026-09-03-1000");
      });

      expect(screen.queryByText(/Confirmed with verified human presence/)).not.toBeInTheDocument();
      expect(screen.getByText("Staged by tool")).toBeInTheDocument();
    } finally {
      delete (document as { modelContext?: unknown }).modelContext;
    }
  });
});
