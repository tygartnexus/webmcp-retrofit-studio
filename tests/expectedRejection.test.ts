import { assertExpectedRejection } from "../src/validation/runDeterministicChecks";

describe("deterministic rejection assertions", () => {
  it("requires the expected error name and message", async () => {
    await expect(
      assertExpectedRejection(
        () => {
          throw new RangeError("Unknown service: not-real");
        },
        { name: "RangeError", message: /Unknown service/ },
      ),
    ).resolves.toBeUndefined();

    await expect(
      assertExpectedRejection(
        () => {
          throw new TypeError("different failure");
        },
        { name: "RangeError", message: /Unknown service/ },
      ),
    ).rejects.toThrow(/Expected RangeError/);

    await expect(
      assertExpectedRejection(() => Promise.resolve(), {
        name: "AbortError",
        message: /cancelled/,
      }),
    ).rejects.toThrow(/Expected the operation to reject/);
  });
});
