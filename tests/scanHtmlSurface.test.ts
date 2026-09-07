import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";

/**
 * Regressions R59 onward from the 2026-09-07 round-nine sweep: risk judged
 * on every button name, the disabled default button, class case, and
 * zero-width characters.
 */

async function scanOwner(html: string) {
  return scanHtml(await createOwnerSnapshot(html, { fallbackTitle: "QA page" }));
}

const post = (button: string) => `<form method="post" action="/x"><input name="a" aria-label="A"><button>${button}</button></form>`;

describe("R59: an ARIA override cannot hide a finalizing or credential action", () => {
  it("judges risk on the visible content behind an aria-label or aria-labelledby", async () => {
    const ariaLabel = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button aria-label="Continue">Delete account</button></form>`);
    expect(ariaLabel.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Continue", "finalize"]]);
    const labelledBy = await scanOwner(
      `<span id="x">Go</span><form method="post" action="/x"><input name="a" aria-label="A"><button aria-labelledby="x">Delete account</button></form>`,
    );
    expect(labelledBy.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go", "finalize"]]);
    const login = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button aria-label="Continue">Log in</button></form>`);
    expect(login.capabilities.map((c) => c.riskClass)).toEqual(["credential"]);
  });

  it("reads an aria-hidden verb as rendered text", async () => {
    const scan = await scanOwner(post(`<span aria-hidden="true">Delete</span> account`));
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["account", "finalize"]]);
  });

  it("keeps proposing nothing excluded when every name is safe", async () => {
    const proposal = await inferGenericCapabilities(await scanOwner(post(`<span aria-hidden="true">›</span> Save draft`)));
    expect(proposal.tools.map((t) => t.name)).toEqual(["save_draft"]);
    expect(proposal.excluded).toEqual([]);
  });
});

describe("R60: a disabled default button blocks implicit submission", () => {
  it("proposes nothing for a lone field beside a disabled submit", async () => {
    const write = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button disabled>Save</button></form>`);
    expect(write.capabilities).toEqual([]);
    const search = await scanOwner(`<form method="get" action="/q"><input type="search" name="q" aria-label="Q"><button disabled>Search</button></form>`);
    expect(search.capabilities).toEqual([]);
  });

  it("still lists a disabled finalize or credential default as excluded", async () => {
    const finalize = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button disabled>Delete account</button></form>`);
    expect(finalize.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    expect((await inferGenericCapabilities(finalize)).tools).toEqual([]);
    const login = await scanOwner(`<form method="post" action="/x"><input name="u" aria-label="U"><input type="submit" value="Log in" disabled></form>`);
    expect(login.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Log in", "credential"]]);
  });

  it("keeps an enabled second submit as its own action", async () => {
    const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button disabled>Publish</button><button formaction="/draft">Save draft</button></form>`);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass, c.action])).toEqual([["Save draft", "write", "/draft"]]);
  });
});

describe("R61: hiding classes match case-sensitively, as CSS does", () => {
  it("keeps text under an uppercase class name", async () => {
    const scan = await scanOwner(post(`Save<span class="HIDDEN"> and delete account</span>`));
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save and delete account", "finalize"]]);
  });
});

describe("R62: zero-width characters never reach a name", () => {
  it("drops them from labels and excluded actions", async () => {
    const draft = await scanOwner(post("Save&#8203;draft"));
    expect(draft.capabilities[0].actionLabel).toBe("Savedraft");
    const remove = await scanOwner(post("Delete&#8205; account"));
    expect(remove.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
  });
});

describe("R63: inline style declarations are parsed, not substring-matched", () => {
  it("keeps text whose style merely mentions display:none, and hides visibility:collapse", async () => {
    const mention = await scanOwner(post(`Save<span style="--toggle-display:none"> draft</span>`));
    expect(mention.capabilities[0].actionLabel).toBe("Save draft");
    const collapsed = await scanOwner(post(`Save<span style="visibility: collapse"> draft</span>`));
    expect(collapsed.capabilities[0].actionLabel).toBe("Save");
  });
});

describe("R64: tools that share a label carry distinct titles", () => {
  it("numbers the second search and the second plain button", async () => {
    const html = `<form id="w" method="post" action="/save"><input name="q" type="search" aria-label="Query"><button>Save</button><button type="button">Preview</button><button type="button">Preview</button><button type="submit" formmethod="get" formaction="/one">Widgets</button><button type="submit" formmethod="get" formaction="/two">Widgets</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    expect(proposal.tools.map((t) => t.title)).toEqual(["Save", "Preview", "Preview (2)", "Search Widgets", "Search Widgets (2)"]);
    expect(new Set(proposal.tools.map((t) => t.name)).size).toBe(5);
  });

  it("drops the button suffix when the title already says the label", async () => {
    const html = `<form id="o" method="post" action="/save"><input name="q" type="search" aria-label="Query"><button>Save</button><button type="submit" formmethod="get" formaction="/find">Search Orders</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    expect(proposal.tools.filter((t) => t.riskClass === "read").map((t) => t.title)).toEqual(["Search Orders"]);
  });
});
