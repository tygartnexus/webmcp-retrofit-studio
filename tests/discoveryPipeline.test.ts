import { vi } from "vitest";
import { LEGACY_BOOKING_SNAPSHOT } from "../src/fixtures/legacyBookingSnapshot";
import {
  canonicalJson,
  scanOwnedFixture,
  sha256Hex,
} from "../src/discovery/scanOwnedFixture";
import { inferCapabilities } from "../src/discovery/inferCapabilities";
import { BOOKING_TOOL_NAMES } from "../src/domain/booking";

describe("owned synthetic fixture discovery", () => {
  it("parses the bundled snapshot inertly and retains metadata rather than raw values", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await scanOwnedFixture();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.fixtureId).toBe(LEGACY_BOOKING_SNAPSHOT.id);
    expect(result.scanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.observations.map((observation) => observation.id)).toEqual([
      "service-search-control",
      "service-choice-control",
      "date-control",
      "time-control",
      "stage-control",
      "human-confirmation-control",
    ]);
    expect(result.observations.every((observation) => observation.present)).toBe(true);
    expect(result.safety).toEqual({
      parsedInertly: true,
      externalRequests: 0,
      executedScripts: 0,
      capturedCredentials: false,
      retainedRawValues: false,
    });
    expect(result).not.toHaveProperty("html");
    expect(JSON.stringify(result)).not.toContain("<form");
    expect(JSON.stringify(result)).not.toContain("customer@example.com");
    fetchSpy.mockRestore();
  });

  it("proposes exactly the shared three-tool allowlist with stable proposal and version hashes", async () => {
    const scan = await scanOwnedFixture();

    const first = await inferCapabilities(scan);
    const second = await inferCapabilities(scan);

    expect(first.capabilities.map((capability) => capability.name)).toEqual(
      BOOKING_TOOL_NAMES,
    );
    expect(first.excludedCapabilityNames).toEqual(["finalize_booking"]);
    expect(first.capabilities).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "finalize_booking" })]),
    );
    expect(first.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.versionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toEqual(second);
    expect(first.capabilities.every((capability) => capability.evidenceIds.length > 0)).toBe(
      true,
    );
    expect(first.proposalHash).toBe(
      await sha256Hex(
        canonicalJson({
          scanHash: first.scanHash,
          versionHash: first.versionHash,
          capabilities: first.capabilities,
          excludedCapabilityNames: first.excludedCapabilityNames,
          humanConfirmationBoundary: first.humanConfirmationBoundary,
        }),
      ),
    );
  });

  it("canonicalizes JSON with code-unit key order and rejects unsupported values", () => {
    expect(canonicalJson({ z: 1, a: { y: true, b: null } })).toBe(
      '{"a":{"b":null,"y":true},"z":1}',
    );
    expect(() => canonicalJson(undefined)).toThrow(/JSON-compatible/i);
    expect(() => canonicalJson({ omitted: undefined })).toThrow(
      /JSON-compatible/i,
    );
    expect(() => canonicalJson({ infinite: Number.POSITIVE_INFINITY })).toThrow(
      /finite/i,
    );
    expect(() => canonicalJson(new Date())).toThrow(/plain/i);
  });

  it("fails closed when required discovery evidence is absent", async () => {
    const scan = await scanOwnedFixture();
    const incomplete = {
      ...scan,
      observations: scan.observations.filter(
        (observation) => observation.id !== "human-confirmation-control",
      ),
    };

    await expect(inferCapabilities(incomplete)).rejects.toThrow(
      /required fixture evidence/i,
    );
  });

  it("rejects scan metadata that is not bound to the bundled snapshot", async () => {
    const scan = await scanOwnedFixture();

    await expect(
      inferCapabilities({ ...scan, scanHash: "0".repeat(64) }),
    ).rejects.toThrow(/bundled snapshot/i);
  });

  it("rejects observation metadata that was altered after scanning", async () => {
    const scan = await scanOwnedFixture();
    const altered = {
      ...scan,
      observations: scan.observations.map((observation, index) =>
        index === 0 ? { ...observation, selector: "#unreviewed-control" } : observation,
      ),
    };

    await expect(inferCapabilities(altered)).rejects.toThrow(/bundled snapshot/i);
  });
});
