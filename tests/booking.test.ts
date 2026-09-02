import {
  BOOKING_TOOL_NAMES,
  createBookingStore,
  getAvailability,
  searchServices,
  stageBooking,
} from "../src/domain/booking";

describe("synthetic booking domain", () => {
  it("searches the fixed service catalog without inventing services", () => {
    expect(searchServices("install")).toEqual([
      expect.objectContaining({ id: "installation", name: "Installation" }),
    ]);
    expect(searchServices("unknown service")).toEqual([]);
    expect(searchServices("")).toHaveLength(3);
  });

  it("returns only known availability for a valid service", () => {
    const result = getAvailability({ serviceId: "consultation" });

    expect(result.serviceId).toBe("consultation");
    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-09-03", time: "10:00" }),
      ]),
    );
  });

  it("rejects unknown inputs and unavailable slots", () => {
    expect(() => getAvailability({ serviceId: "not-real" })).toThrow(
      "Unknown service",
    );
    expect(() =>
      stageBooking({
        serviceId: "consultation",
        date: "2026-09-03",
        time: "23:59",
      }),
    ).toThrow("Unavailable booking slot");
  });

  it("rejects prototype-bearing and accessor-backed input objects", () => {
    const inherited = Object.create({ serviceId: "consultation" }) as Record<
      string,
      unknown
    >;
    expect(() => getAvailability(inherited)).toThrow(/plain object/i);

    const accessorInput = {} as Record<string, unknown>;
    Object.defineProperty(accessorInput, "serviceId", {
      enumerable: true,
      get: () => "consultation",
    });
    expect(() => getAvailability(accessorInput)).toThrow(/data property/i);
  });

  it("stages a reversible draft without finalizing it", () => {
    const draft = stageBooking({
      serviceId: "consultation",
      date: "2026-09-03",
      time: "10:00",
    });

    expect(draft).toMatchObject({ status: "draft", serviceId: "consultation" });
    expect(draft).not.toHaveProperty("confirmedAt");
  });

  it("keeps human confirmation outside the agent tool inventory", () => {
    const store = createBookingStore();
    store.stage({
      serviceId: "repair",
      date: "2026-09-05",
      time: "14:30",
    });

    expect(store.getSnapshot().draft?.status).toBe("draft");
    expect(BOOKING_TOOL_NAMES).toEqual([
      "search_services",
      "get_availability",
      "stage_booking",
    ]);
    expect(BOOKING_TOOL_NAMES).not.toContain("finalize_booking");

    store.cancelDraft();
    expect(store.getSnapshot().draft).toBeNull();
  });
});
