import { runDeterministicChecks } from "../src/validation/runDeterministicChecks";

describe("runtime deterministic checks", () => {
  it("executes all eight checks instead of returning a hard-coded score", async () => {
    const report = await runDeterministicChecks();

    expect(report.checks).toHaveLength(8);
    expect(report.checks.every((check) => check.status === "passed")).toBe(true);
    expect(report.passed).toBe(8);
    expect(report.total).toBe(8);
    expect(report.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
