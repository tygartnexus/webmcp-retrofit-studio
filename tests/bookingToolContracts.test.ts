import { BOOKING_TOOL_CONTRACTS } from "../src/webmcp/bookingToolContracts";

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) {
    expectDeeplyFrozen(nested);
  }
}

describe("booking tool contract immutability", () => {
  it("deep-freezes every exported schema, annotation, array, and contract", () => {
    expectDeeplyFrozen(BOOKING_TOOL_CONTRACTS);
  });
});
