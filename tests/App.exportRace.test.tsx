import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExportBundle } from "../src/export/buildExportBundle";

const { buildMock } = vi.hoisted(() => ({
  buildMock: vi.fn(),
}));

vi.mock("../src/export/buildExportBundle", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../src/export/buildExportBundle")
  >();
  return { ...original, buildExportBundle: buildMock };
});

import { App } from "../src/App";

describe("async export invalidation", () => {
  beforeEach(() => buildMock.mockReset());

  it("discards an older export build after upstream navigation and rescan", async () => {
    const user = userEvent.setup();
    let resolveBuild!: (bundle: ExportBundle) => void;
    buildMock.mockImplementationOnce(
      () =>
        new Promise<ExportBundle>((resolve) => {
          resolveBuild = resolve;
        }),
    );
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { async registerTool() {} },
    });

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
      await screen.findByText("8/8 passed");
      await user.click(
        screen.getByRole("button", { name: "Record current-browser UAT" }),
      );
      await user.click(screen.getByRole("button", { name: /Continue to export/ }));
      expect(buildMock).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: /Scan/ }));
      await user.click(screen.getByRole("button", { name: "Scan owned fixture" }));
      await screen.findByRole("heading", { name: "Candidate capabilities" });

      await act(async () => {
        resolveBuild({
          bundleHash: "d".repeat(64),
          manifest: {
            proposalHash: "stale-proposal",
          },
        } as unknown as ExportBundle);
      });

      expect(
        screen.getByRole("heading", { name: "Candidate capabilities" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Export retrofit package" }),
      ).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
