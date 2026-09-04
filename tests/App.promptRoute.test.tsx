import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";

async function scanToCandidates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", { name: /authorized to analyze this fixture/i }),
  );
  await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
  await screen.findByRole("heading", { name: "Candidate capabilities" });
}

describe("prompt route display", () => {
  it("shows the supplementary lens for Red Team and CEO modes only", async () => {
    const user = userEvent.setup();
    render(<App />);
    await scanToCandidates(user);

    const quality = () => screen.getByTestId("quality-evidence");
    expect(within(quality()).queryByText(/Bias detection/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Red Team Mode" }));
    expect(
      within(quality()).getByText(/Hostile red-team review · v1\.0\.0 \+ Bias detection · v/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "CEO Review Mode" }));
    expect(
      within(quality()).getByText(/CEO reality check · v1\.0\.0 \+ Executive decision matrix · v/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accuracy Mode" }));
    expect(within(quality()).queryByText(/ \+ /)).not.toBeInTheDocument();
  });
});
