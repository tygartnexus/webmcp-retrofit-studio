import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { serializeMock } = vi.hoisted(() => ({
  serializeMock: vi.fn(),
}));

vi.mock("../src/export/buildExportBundle", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../src/export/buildExportBundle")
  >();
  return { ...original, serializeVerifiedExportBundle: serializeMock };
});

import { App } from "../src/App";

async function advanceToExport(user: ReturnType<typeof userEvent.setup>) {
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
  await screen.findByRole("heading", { name: "Export retrofit package" });
  await user.click(
    screen.getByRole("checkbox", { name: /approve this exact bundle hash/i }),
  );
}

describe("export download integrity gate", () => {
  beforeEach(() => serializeMock.mockReset());

  it("does not create a download when final bundle verification fails", async () => {
    serializeMock.mockRejectedValueOnce(new Error("integrity test failure"));
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { async registerTool() {} },
    });

    try {
      const user = userEvent.setup();
      render(<App />);
      await advanceToExport(user);
      await user.click(
        screen.getByRole("button", { name: "Download retrofit package" }),
      );

      await vi.waitFor(() => expect(serializeMock).toHaveBeenCalledTimes(1));
      expect(anchorClick).not.toHaveBeenCalled();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /integrity verification failed/i,
      );
    } finally {
      anchorClick.mockRestore();
      Reflect.deleteProperty(document, "modelContext");
    }
  });

  it("invalidates an in-flight verification when the operator leaves Export", async () => {
    let resolveSerialization!: (value: string) => void;
    serializeMock.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSerialization = resolve;
        }),
    );
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { async registerTool() {} },
    });

    try {
      const user = userEvent.setup();
      render(<App />);
      await advanceToExport(user);
      await user.click(
        screen.getByRole("button", { name: "Download retrofit package" }),
      );
      expect(
        screen.getByRole("checkbox", { name: /approve this exact bundle hash/i }),
      ).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /Candidates/ }));
      await user.click(screen.getByRole("button", { name: /Export/ }));
      expect(
        screen.getByRole("button", { name: "Download retrofit package" }),
      ).toBeEnabled();

      await act(async () => {
        resolveSerialization("{}");
        await Promise.resolve();
      });
      expect(anchorClick).not.toHaveBeenCalled();
    } finally {
      anchorClick.mockRestore();
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
