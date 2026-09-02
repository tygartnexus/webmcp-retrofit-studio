import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";

function installModelContextStub() {
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      async registerTool() {},
    },
  });
}

describe("connected five-step retrofit workflow", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "modelContext");
  });

  it("starts at Scan and requires owner authorization before inspecting the fixture", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Scan owned fixture" }),
    ).toBeInTheDocument();
    const scan = screen.getByRole("button", { name: "Scan owned fixture" });
    expect(scan).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "Bundled synthetic snapshot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No credentials, remote fetches, or scripts"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }),
    );
    expect(scan).toBeEnabled();
  });

  it("connects Scan, Candidates, Preview, Validate, and Export with guarded transitions", async () => {
    installModelContextStub();
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }),
    );
    await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
    expect(
      await screen.findByRole("heading", { name: "Candidate capabilities" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/source fingerprint/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve for preview" }));
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(
      screen.getByRole("heading", { name: "Preview generated retrofit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("search_services")).toBeInTheDocument();
    expect(screen.getByText("get_availability")).toBeInTheDocument();
    expect(screen.getByText("stage_booking")).toBeInTheDocument();
    expect(screen.getByText(/finalize_booking not exposed/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Lock version for validation" }),
    );
    expect(
      screen.getByRole("heading", { name: "Validate generated tools" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Run deterministic checks" }),
    );
    expect(await screen.findByText("8/8 passed")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Record current-browser UAT" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to export" }));

    expect(
      await screen.findByRole("heading", { name: "Export retrofit package" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/export does not deploy or publish/i)).toBeInTheDocument();
    const approval = screen.getByRole("checkbox", {
      name: /approve this exact bundle hash/i,
    });
    const download = screen.getByRole("button", {
      name: "Download retrofit package",
    });
    expect(download).toBeDisabled();
    await user.click(approval);
    expect(download).toBeEnabled();
  });

  it("keeps live-client evidence distinct from deterministic checks", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }),
    );
    await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
    await screen.findByRole("heading", { name: "Candidate capabilities" });
    await user.click(screen.getByRole("button", { name: "Approve for preview" }));
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    await user.click(
      screen.getByRole("button", { name: "Lock version for validation" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Run deterministic checks" }),
    );
    expect(await screen.findByText("8/8 passed")).toBeInTheDocument();

    const liveUat = screen.getByTestId("live-uat-evidence");
    expect(within(liveUat).getByText(/not verified/i)).toBeInTheDocument();
    expect(
      within(liveUat).getByRole("button", { name: "Record current-browser UAT" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue to export" })).toBeDisabled();
  });
});
