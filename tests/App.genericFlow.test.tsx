import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import type { HumanPresenceVerifier, PresenceReceipt } from "../src/presence/humanPresence";

function resolvingVerifier(): HumanPresenceVerifier {
  return {
    method: "webauthn-user-presence",
    available: true,
    async verify(subject: string): Promise<PresenceReceipt> {
      return {
        method: "webauthn-user-presence",
        ceremony: "assertion",
        subject,
        rpId: "localhost",
        userPresent: true,
        userVerified: false,
        credentialIdSha256: "cd".repeat(32),
        verifiedAt: "2026-09-05T12:00:00.000Z",
      };
    },
  };
}

function installToolCapture(): Map<string, WebMCP.ModelContextTool> {
  const tools = new Map<string, WebMCP.ModelContextTool>();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      async registerTool(tool: WebMCP.ModelContextTool, options?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
      },
    },
  });
  return tools;
}

async function scanGeneric(user: ReturnType<typeof userEvent.setup>, fixtureId: string) {
  await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), fixtureId);
  await user.click(screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }));
  await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
  await screen.findByRole("heading", { name: "Generic candidate capabilities" });
}

describe("generic retrofit flow", () => {
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const createObjectURL = vi.fn(() => "blob:generic-test");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    anchorClick.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Reflect.deleteProperty(document, "modelContext");
  });

  it("approves, registers, invokes, stages, confirms, validates, and exports a contact form retrofit", async () => {
    const tools = installToolCapture();
    const user = userEvent.setup();
    render(<App presenceVerifier={resolvingVerifier()} />);
    await scanGeneric(user, "synthetic-contact-form-v1");

    await user.click(screen.getByRole("button", { name: "Approve for runtime" }));
    await screen.findByRole("heading", { name: "Generic tools live" });
    await waitFor(() => expect([...tools.keys()]).toEqual(["send_message"]));
    expect(screen.getByText("1 live tool registered")).toBeInTheDocument();

    const consoleRegion = screen.getByRole("region", { name: "Tool console" });
    expect(within(consoleRegion).getByRole("textbox", { name: "Input JSON" })).toHaveValue(
      JSON.stringify({ fullName: "sample", email: "person@example.test", message: "sample", priority: "low" }, null, 2),
    );
    await user.click(within(consoleRegion).getByRole("button", { name: "Invoke" }));
    await within(consoleRegion).findByText(/"status": "draft_staged"/);

    const stagedRegion = screen.getByRole("region", { name: "Staged changes" });
    expect(within(stagedRegion).getByText("Send message")).toBeInTheDocument();
    await user.click(within(stagedRegion).getByRole("button", { name: "Confirm with passkey" }));
    await within(stagedRegion).findByText(/Confirmed · WebAuthn assertion/);

    await user.click(screen.getByRole("button", { name: /Continue to validate/ }));
    await screen.findByRole("heading", { name: "Validate generic tools" });
    expect(screen.getByRole("button", { name: /Continue to export/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Run deterministic checks" }));
    await screen.findByRole("heading", { name: "9/9 passed" });
    expect(screen.getByText(/1 of 1 staged change confirmed/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Continue to export/ }));
    await screen.findByRole("heading", { name: "Export generic retrofit package" });
    await screen.findByText("webmcp-retrofit.generated.js");
    expect(screen.getByText("1 human confirmation receipt(s) attached")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download package" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /approve this exact bundle hash/i }));
    await user.click(screen.getByRole("button", { name: "Download package" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:generic-test");
  });

  it("keeps the rail closed until approval and until the checks pass, and clears everything on rescan", async () => {
    installToolCapture();
    const user = userEvent.setup();
    render(<App presenceVerifier={resolvingVerifier()} />);
    await scanGeneric(user, "synthetic-data-table-v1");

    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(screen.getByRole("heading", { name: "Generic candidate capabilities" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve for runtime" }));
    await screen.findByRole("heading", { name: "Generic tools live" });
    await user.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByRole("heading", { name: "Generic tools live" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Scan/ }));
    await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
    await screen.findByRole("heading", { name: "Generic candidate capabilities" });
    expect(screen.getByRole("button", { name: "Approve for runtime" })).toBeEnabled();
  });

  it("supersedes an unconfirmed staged change when a later write hits the same form", async () => {
    installToolCapture();
    const user = userEvent.setup();
    render(<App presenceVerifier={resolvingVerifier()} />);
    await scanGeneric(user, "synthetic-contact-form-v1");
    await user.click(screen.getByRole("button", { name: "Approve for runtime" }));
    await screen.findByRole("heading", { name: "Generic tools live" });

    const consoleRegion = screen.getByRole("region", { name: "Tool console" });
    await user.click(within(consoleRegion).getByRole("button", { name: "Invoke" }));
    await within(consoleRegion).findByText(/"status": "draft_staged"/);
    await user.click(within(consoleRegion).getByRole("button", { name: "Invoke" }));

    const stagedRegion = screen.getByRole("region", { name: "Staged changes" });
    await waitFor(() => expect(within(stagedRegion).getAllByRole("listitem")).toHaveLength(2));
    const [first, second] = within(stagedRegion).getAllByRole("listitem");
    expect(within(first).getByText(/Superseded by a later change/)).toBeInTheDocument();
    expect(within(first).queryByRole("button", { name: "Confirm with passkey" })).not.toBeInTheDocument();
    await user.click(within(second).getByRole("button", { name: "Confirm with passkey" }));
    await within(second).findByText(/Confirmed · WebAuthn assertion/);
  });

  it("reports invalid console input without touching the staged list", async () => {
    installToolCapture();
    const user = userEvent.setup();
    render(<App presenceVerifier={resolvingVerifier()} />);
    await scanGeneric(user, "synthetic-contact-form-v1");
    await user.click(screen.getByRole("button", { name: "Approve for runtime" }));
    await screen.findByRole("heading", { name: "Generic tools live" });

    const consoleRegion = screen.getByRole("region", { name: "Tool console" });
    const input = within(consoleRegion).getByRole("textbox", { name: "Input JSON" });
    await user.clear(input);
    await user.type(input, '{{"fullName": "A", "email": "x", "message": "m", "priority": "low"}');
    await user.click(within(consoleRegion).getByRole("button", { name: "Invoke" }));

    await within(consoleRegion).findByText(/TypeError: email must be an email address/);
    expect(screen.getByRole("region", { name: "Staged changes" })).toHaveTextContent(/Nothing staged yet/);
  });
});
