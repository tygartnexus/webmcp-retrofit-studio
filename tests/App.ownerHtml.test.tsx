import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";

const PAGE = `<!doctype html><html><head><title>Parts desk</title></head><body>
<h1>Find a part</h1>
<form method="get" action="/parts"><label for="q">Part number</label><input id="q" name="q" type="search"><button>Search</button></form>
<form id="rfq" method="post" action="/rfq"><label for="n">Quantity</label><input id="n" name="qty" type="number" min="1" required><button>Request quote</button></form>
<form method="post" action="/login"><input name="u"><input name="p" type="password"><button>Log in</button></form>
<script>document.write("never runs")</script>
</body></html>`;

async function chooseOwnerSource(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), "owner-html");
}

describe("owner-supplied HTML", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "modelContext");
  });

  it("scans pasted markup inertly into a generic proposal and keeps the login form off the surface", async () => {
    const user = userEvent.setup();
    render(<App />);
    await chooseOwnerSource(user);

    expect(screen.getByRole("button", { name: "Scan pasted page" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /own or am authorized to analyze this page/i }));
    expect(screen.getByRole("button", { name: "Scan pasted page" })).toBeDisabled();
    await user.click(screen.getByRole("textbox", { name: "Page HTML" }));
    await user.paste(PAGE);
    await user.click(screen.getByRole("button", { name: "Scan pasted page" }));

    await screen.findByRole("heading", { name: "Generic candidate capabilities" });
    expect(screen.getByText(/Proposed from an inert scan of “Parts desk”/)).toBeInTheDocument();
    const tools = screen.getByRole("region", { name: /Proposed tools \(2\)/ });
    expect(within(tools).getByText("search_part_number")).toBeInTheDocument();
    expect(within(tools).getByText("request_quote")).toBeInTheDocument();
    const excluded = screen.getByRole("region", { name: /Kept off the tool surface \(1\)/ });
    expect(within(excluded).getByText("Log in")).toBeInTheDocument();
    expect(screen.getByText(/Parsed inertly, 1 script ignored/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("never runs");
  });

  it("uses the owner label when the markup has no title and surfaces helper errors in the decision bar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await chooseOwnerSource(user);
    await user.click(screen.getByRole("checkbox", { name: /own or am authorized/i }));
    await user.type(screen.getByRole("textbox", { name: "Page label" }), "Intranet request form");
    await user.click(screen.getByRole("textbox", { name: "Page HTML" }));
    await user.paste("plain words, no markup");
    await user.click(screen.getByRole("button", { name: "Scan pasted page" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/does not look like HTML/);
    expect(screen.getByRole("heading", { name: "Scan your page" })).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Page HTML" }));
    await user.click(screen.getByRole("textbox", { name: "Page HTML" }));
    await user.paste('<form method="post"><label for="a">Note</label><input id="a" name="note"><button>Save note</button></form>');
    await user.click(screen.getByRole("button", { name: "Scan pasted page" }));

    await screen.findByRole("heading", { name: "Generic candidate capabilities" });
    expect(screen.getByText(/Proposed from an inert scan of “Intranet request form”/)).toBeInTheDocument();
  });

  it("clears the attestation and any error when the source changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }));
    await chooseOwnerSource(user);

    expect(screen.getByRole("checkbox", { name: /own or am authorized/i })).not.toBeChecked();
    expect(screen.getByRole("heading", { name: "Scan your page" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /own or am authorized/i }));
    await user.click(screen.getByRole("textbox", { name: "Page HTML" }));
    await user.paste("no markup here");
    await user.click(screen.getByRole("button", { name: "Scan pasted page" }));
    await screen.findByRole("alert");

    await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), "legacy-booking");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Scan owned fixture" })).toBeDisabled();
  });

  it("takes a pasted page through approval into the live runtime", async () => {
    const tools = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { async registerTool(tool: WebMCP.ModelContextTool) { tools.set(tool.name, tool); } },
    });
    const user = userEvent.setup();
    render(<App />);
    await chooseOwnerSource(user);
    await user.click(screen.getByRole("checkbox", { name: /own or am authorized/i }));
    await user.click(screen.getByRole("textbox", { name: "Page HTML" }));
    await user.paste(PAGE);
    await user.click(screen.getByRole("button", { name: "Scan pasted page" }));
    await screen.findByRole("heading", { name: "Generic candidate capabilities" });

    await user.click(screen.getByRole("button", { name: "Approve for runtime" }));
    await screen.findByRole("heading", { name: "Generic tools live" });
    await screen.findByText("2 live tools registered");
    expect([...tools.keys()].sort()).toEqual(["request_quote", "search_part_number"]);
  });
});
