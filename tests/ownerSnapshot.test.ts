import { scanHtml } from "../src/discovery/scanHtml";
import { createOwnerSnapshot, OWNER_HTML_MAX_CHARS } from "../src/fixtures/ownerSnapshot";

const PAGE = `<!doctype html><html><head><title>  Parts   desk </title></head>
<body><h1>Find a part</h1><form method="get" action="/parts"><label for="q">Part number</label><input id="q" name="q" type="search"><button>Search</button></form>
<script>alert("never runs")</script></body></html>`;

describe("createOwnerSnapshot", () => {
  it("derives a stable id and revision from the content hash and reads the title inertly", async () => {
    const first = await createOwnerSnapshot(PAGE);
    const second = await createOwnerSnapshot(`  ${PAGE}\n`);

    expect(first).toMatchObject({
      sourceKind: "owner-supplied-html",
      authorization: "owner-authorized",
      title: "Parts desk",
    });
    expect(first.id).toMatch(/^owner-[a-f0-9]{12}$/);
    expect(first.revision).toBe(first.id.slice(6, 14));
    expect(second.id).toBe(first.id);
    expect(Object.isFrozen(first)).toBe(true);
    expect(document.querySelector("form")).toBeNull();
  });

  it("falls back to the first heading, then the owner label, then a default", async () => {
    expect((await createOwnerSnapshot("<h1>Orders</h1><table><tr><th>A</th></tr><tr><td>1</td></tr></table>")).title).toBe("Orders");
    expect((await createOwnerSnapshot("<form><input name='x'></form>", { fallbackTitle: " Intranet form " })).title).toBe(
      "Intranet form",
    );
    expect((await createOwnerSnapshot("<form><input name='x'></form>")).title).toBe("Pasted page");
  });

  it("refuses empty, oversized, and non-HTML input", async () => {
    await expect(createOwnerSnapshot("   ")).rejects.toThrow(/empty/);
    await expect(createOwnerSnapshot("<p>" + "x".repeat(OWNER_HTML_MAX_CHARS))).rejects.toThrow(/too large/);
    await expect(createOwnerSnapshot("just some words")).rejects.toThrow(/does not look like HTML/);
  });

  it("produces a snapshot the generic scanner accepts", async () => {
    const result = await scanHtml(await createOwnerSnapshot(PAGE));

    expect(result.sourceKind).toBe("owner-supplied-html");
    expect(result.capabilities.map((capability) => [capability.kind, capability.riskClass])).toEqual([["search", "read"]]);
    expect(result.safety.scriptsIgnored).toBe(1);
    expect(result.safety.executedScripts).toBe(0);
  });
});
