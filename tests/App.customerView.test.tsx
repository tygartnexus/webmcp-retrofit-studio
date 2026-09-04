import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { PRESENCE_METHOD, type HumanPresenceVerifier, type PresenceReceipt } from "../src/presence/humanPresence";

function resolvingVerifier(): HumanPresenceVerifier & { subjects: string[] } {
  const verifier = {
    method: PRESENCE_METHOD,
    available: true,
    subjects: [] as string[],
    async verify(subject: string): Promise<PresenceReceipt> {
      verifier.subjects.push(subject);
      return Object.freeze({
        method: PRESENCE_METHOD,
        ceremony: "assertion" as const,
        subject,
        rpId: "example.test",
        userPresent: true as const,
        userVerified: true,
        credentialIdSha256: "cd".repeat(32),
        verifiedAt: "2026-09-04T16:00:00.000Z",
      });
    },
  };
  return verifier;
}

function installToolCapture(): Map<string, WebMCP.ModelContextTool> {
  const tools = new Map<string, WebMCP.ModelContextTool>();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      async registerTool(tool: WebMCP.ModelContextTool) {
        tools.set(tool.name, tool);
      },
    },
  });
  return tools;
}

describe("customer view", () => {
  afterEach(() => {
    delete (document as { modelContext?: unknown }).modelContext;
  });

  it("opens on Validate with the reviewed tools live and no owner step rail", async () => {
    installToolCapture();
    render(<App view="customer" presenceVerifier={resolvingVerifier()} />);

    expect(await screen.findByRole("heading", { name: "Validate generated tools" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Customer view/);
    expect(screen.queryByRole("button", { name: /Candidates/ })).not.toBeInTheDocument();
    expect((await screen.findAllByText("3 live tools registered")).length).toBeGreaterThan(0);
  });

  it("lets an agent stage the draft and the person confirm with one gesture", async () => {
    const user = userEvent.setup();
    const tools = installToolCapture();
    const verifier = resolvingVerifier();
    render(<App view="customer" presenceVerifier={verifier} />);
    await screen.findByRole("heading", { name: "Validate generated tools" });
    await screen.findAllByText("3 live tools registered");

    await act(async () => {
      await tools.get("stage_booking")!.execute(
        { serviceId: "repair", date: "2026-09-05", time: "14:30" },
        { signal: new AbortController().signal },
      );
    });

    const dialog = await screen.findByRole("dialog", { name: "Confirm staged booking" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText("Repair")).toBeInTheDocument();
    expect(screen.getByText("Staged by tool")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Confirm with passkey" }));

    expect(verifier.subjects).toEqual(["draft-repair-2026-09-05-1430"]);
    expect(await screen.findByRole("status")).toHaveTextContent("Confirmed with verified human presence");
  });

  it("keeps the explicit click for drafts staged in the visible interface", async () => {
    const user = userEvent.setup();
    installToolCapture();
    render(<App view="customer" presenceVerifier={resolvingVerifier()} />);
    await screen.findByRole("heading", { name: "Validate generated tools" });

    await user.click(screen.getByRole("button", { name: "Stage selected draft" }));

    expect(screen.queryByRole("dialog", { name: "Confirm staged booking" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeEnabled();
  });
});
