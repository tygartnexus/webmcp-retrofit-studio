import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DETERMINISTIC_CHECKS,
  type DeterministicReport,
} from "../src/validation/runDeterministicChecks";

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn<() => Promise<DeterministicReport>>(),
}));

vi.mock("../src/validation/runDeterministicChecks", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../src/validation/runDeterministicChecks")
  >();
  return { ...original, runDeterministicChecks: runMock };
});

import { App } from "../src/App";

function passingReport(): DeterministicReport {
  return {
    checks: DETERMINISTIC_CHECKS.map((check) => ({
      ...check,
      status: "passed",
      detail: "test evidence",
    })),
    passed: DETERMINISTIC_CHECKS.length,
    total: DETERMINISTIC_CHECKS.length,
    executedAt: "2026-09-02T12:00:00.000Z",
  };
}

describe("validation evidence invalidation", () => {
  beforeEach(() => runMock.mockReset());

  it("clears an earlier pass and UAT record before a failed rerun", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { async registerTool() {} },
    });
    runMock
      .mockResolvedValueOnce(passingReport())
      .mockRejectedValueOnce(new Error("second run failed"));

    try {
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
      await screen.findAllByText("3 live tools registered");

      await user.click(screen.getByRole("button", { name: "Run deterministic checks" }));
      expect(await screen.findByText("8/8 passed")).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Record current-browser UAT" }),
      );
      expect(screen.getByText("Operator attestation recorded")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Rerun deterministic checks" }),
      );

      expect(
        await screen.findByText(/checks could not complete/i),
      ).toBeInTheDocument();
      expect(screen.queryByText("8/8 passed")).not.toBeInTheDocument();
      expect(screen.getByText("Not verified")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Continue to export/ }),
      ).toBeDisabled();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
