import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";

async function authorize(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }));
}

async function scanFixture(user: ReturnType<typeof userEvent.setup>, fixtureId: string) {
  await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), fixtureId);
  await authorize(user);
  await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
}

describe("generic fixture scan (preview only)", () => {
  it("scans the checkout fixture into a proposal that excludes the finalizing order and offers no approval", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanFixture(user, "synthetic-checkout-v1");

    await screen.findByRole("heading", { name: "Generic candidate capabilities" });
    const tools = screen.getByRole("region", { name: /Proposed tools \(1\)/ });
    expect(within(tools).getByText("apply_coupon")).toBeInTheDocument();
    expect(within(tools).getByText("write")).toBeInTheDocument();

    const excluded = screen.getByRole("region", { name: /Kept off the tool surface \(1\)/ });
    expect(within(excluded).getByText("Place order")).toBeInTheDocument();
    expect(within(excluded).getByText(/presence ceremony/i)).toBeInTheDocument();
    expect(within(excluded).getByText(/1 credential field, 1 hidden field, and 0 file fields excluded/)).toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveTextContent(/Approval applies only to this proposal version/);
    expect(screen.queryByRole("button", { name: "Approve for preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve for runtime" })).toBeEnabled();
  });

  it("proposes nothing for a login page and says why", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanFixture(user, "synthetic-login-v1");

    await screen.findByRole("heading", { name: "Generic candidate capabilities" });
    expect(screen.getByRole("region", { name: /Proposed tools \(0\)/ })).toHaveTextContent(/No tool is proposed/);
    expect(screen.getByRole("region", { name: /Kept off the tool surface \(1\)/ })).toHaveTextContent(/credential/);
  });

  it("returns to the full booking flow when the booking fixture is scanned again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanFixture(user, "synthetic-data-table-v1");
    await screen.findByRole("heading", { name: "Generic candidate capabilities" });

    await user.click(screen.getByRole("button", { name: "Back to scan" }));
    await scanFixture(user, "legacy-booking");

    await screen.findByRole("heading", { name: "Candidate capabilities" });
    expect(screen.getByRole("button", { name: "Approve for preview" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Generic candidate capabilities" })).not.toBeInTheDocument();
  });
});
