import {
  CHECKOUT_FIXTURE,
  CONTACT_FORM_FIXTURE,
  DATA_TABLE_FIXTURE,
  GENERIC_FIXTURES,
  LOGIN_FIXTURE,
  SEARCH_FILTERS_FIXTURE,
  type HtmlSnapshot,
} from "../src/fixtures/genericFixtures";
import { scanHtml } from "../src/discovery/scanHtml";
import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { lintToolContracts } from "../src/validation/lintToolContracts";

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

describe("generic capability inference", () => {
  it("proposes one read-only search tool from a GET form with a strict schema", async () => {
    const proposal = await inferGenericCapabilities(await scanHtml(SEARCH_FILTERS_FIXTURE));
    const [tool] = proposal.tools;

    expect(proposal.tools).toHaveLength(1);
    expect(tool.name).toBe("search_products");
    expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(tool.riskClass).toBe("read");
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.inputSchema.properties.category).toMatchObject({
      type: "string",
      enum: ["tools", "parts", "safety"],
    });
    expect(tool.inputSchema.properties.minPrice).toMatchObject({ type: "number", minimum: 0, maximum: 5000 });
    expect(tool.inputSchema.properties.inStock).toMatchObject({ type: "boolean" });
    expect(tool.inputSchema.required).toBeUndefined();
    expect(tool.description).toMatch(/^Search /);
  });

  it("proposes a state-changing tool for a POST form and keeps the finalizing order form off the tool surface", async () => {
    const proposal = await inferGenericCapabilities(await scanHtml(CHECKOUT_FIXTURE));

    expect(proposal.tools.map((tool) => tool.name)).toEqual(["apply_coupon"]);
    expect(proposal.tools[0].annotations.readOnlyHint).toBe(false);
    expect(proposal.tools[0].riskClass).toBe("write");
    expect(proposal.excluded).toEqual([
      expect.objectContaining({
        capabilityId: expect.stringContaining("order-form"),
        riskClass: "finalize",
        reason: expect.stringMatching(/presence/i),
      }),
    ]);
  });

  it("never proposes a tool for a credential capability", async () => {
    const proposal = await inferGenericCapabilities(await scanHtml(LOGIN_FIXTURE));

    expect(proposal.tools).toHaveLength(0);
    expect(proposal.excluded[0]).toMatchObject({ riskClass: "credential" });
  });

  it("proposes a read tool for a table with page and limit parameters", async () => {
    const proposal = await inferGenericCapabilities(await scanHtml(DATA_TABLE_FIXTURE));
    const [tool] = proposal.tools;

    expect(tool.name).toBe("read_recent_orders");
    expect(tool.riskClass).toBe("read");
    expect(tool.inputSchema.properties.page).toMatchObject({ type: "integer", minimum: 1 });
    expect(tool.outputColumns).toEqual(["Order", "Status", "Total", "Placed"]);
  });

  it("derives parameter descriptions from labels and keeps every field name as given", async () => {
    const proposal = await inferGenericCapabilities(await scanHtml(CONTACT_FORM_FIXTURE));
    const [tool] = proposal.tools;

    expect(tool.name).toBe("send_message");
    expect(tool.inputSchema.required).toEqual(["fullName", "email", "message"]);
    expect(tool.inputSchema.properties.email).toMatchObject({ type: "string", format: "email", description: "Email address" });
    expect(tool.inputSchema.properties.fullName).toMatchObject({ maxLength: 80 });
    expect(tool.evidenceIds.length).toBeGreaterThan(0);
  });

  it("passes the contract lint for every bundled fixture and keeps names unique and within budget", async () => {
    for (const fixture of GENERIC_FIXTURES) {
      const proposal = await inferGenericCapabilities(await scanHtml(fixture));
      const names = proposal.tools.map((tool) => tool.name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(NAME_PATTERN);
        expect(name.length).toBeLessThanOrEqual(30);
      }
      const report = lintToolContracts(proposal.tools);
      expect(report.passed).toBe(report.total);
    }
  });

  it("keeps names unique and within budget when long single-word labels collide, without hanging", async () => {
    const label = "acceptthetermsandconditionsrightnowplease";
    const form = (id: string) =>
      `<form id="${id}" method="post"><label for="${id}-n">Note</label><input id="${id}-n" name="note"><button>${label}</button></form>`;
    const snapshot: HtmlSnapshot = {
      id: "collision",
      revision: "1",
      sourceKind: "owner-supplied-html",
      authorization: "owner-authorized",
      title: "Colliding labels",
      html: `<h1>Forms</h1>${form("a")}${form("b")}${form("c")}`,
    };
    const proposal = await inferGenericCapabilities(await scanHtml(snapshot));
    const names = proposal.tools.map((tool) => tool.name);

    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(30);
      expect(name).toMatch(NAME_PATTERN);
    }
    expect(names[1]).toMatch(/_2$/);
  });

  it("binds deterministic proposal and version hashes to the scan", async () => {
    const scan = await scanHtml(CONTACT_FORM_FIXTURE);
    const first = await inferGenericCapabilities(scan);
    const second = await inferGenericCapabilities(scan);
    const other = await inferGenericCapabilities(await scanHtml(SEARCH_FILTERS_FIXTURE));

    expect(first.proposalHash).toBe(second.proposalHash);
    expect(first.versionHash).toBe(second.versionHash);
    expect(first.scanHash).toBe(scan.scanHash);
    expect(first.proposalHash).not.toBe(other.proposalHash);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
