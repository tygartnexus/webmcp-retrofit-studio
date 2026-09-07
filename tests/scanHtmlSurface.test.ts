import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";
import { runGenericChecks } from "../src/validation/runGenericChecks";

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

describe("R65: zero-width characters in attributes are dropped too", () => {
  it("keeps a finalize verb whole inside aria-label and title", async () => {
    const aria = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button aria-label="Del&#8203;ete account">Go</button></form>`);
    expect(aria.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    const title = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button title="Del&#8203;ete account"></button></form>`);
    expect(title.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    const field = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="First&#8203; name"><button>Save</button></form>`);
    expect(field.capabilities[0].fields[0].label).toBe("First name");
  });
});

describe("R66: a title is judged even when an icon wins the label", () => {
  it("excludes an icon button whose title finalizes and keeps one whose title is safe", async () => {
    const remove = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button title="Delete account">✕</button></form>`);
    expect(remove.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["✕", "finalize"]]);
    const find = await scanOwner(`<form method="get" action="/q"><input type="search" name="q" aria-label="Q"><button title="Search orders">⌕</button></form>`);
    expect(find.capabilities.map((c) => [c.actionLabel, c.kind])).toEqual([["⌕", "search"]]);
  });
});

describe("R67: inline hiding survives !important and odd casing", () => {
  it("hides text under display:none !important and DISPLAY : NONE", async () => {
    const important = await scanOwner(post(`Save<span style="display:none !important"> and delete account</span>`));
    expect(important.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save", "write"]]);
    const shouting = await scanOwner(post(`Save<span style="DISPLAY : NONE"> and delete account</span>`));
    expect(shouting.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save", "write"]]);
  });
});

describe("R68: a hidden default submit is judged by its own content", () => {
  it("lists a hidden finalize or credential default as excluded and names a hidden safe one", async () => {
    for (const hiding of ["hidden", `style="display:none"`, `class="hidden"`]) {
      const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button ${hiding}>Delete account</button></form>`);
      expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    }
    const login = await scanOwner(`<form method="post" action="/x"><input name="u" aria-label="U"><button hidden>Log in</button></form>`);
    expect(login.capabilities.map((c) => c.riskClass)).toEqual(["credential"]);
    const save = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button hidden>Save</button></form>`);
    expect(save.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save", "write"]]);
  });
});

describe("R69: an ordinal title is itself kept unique", () => {
  it("skips ordinals already taken by table titles or literal labels", async () => {
    const table = (h: string) => `<table><thead><tr><th>${h}</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    const tables = await inferGenericCapabilities(
      await scanOwner(`<h2>Levels</h2>${table("A")}${table("B")}<form method="post" action="/x"><input name="a" aria-label="A"><button>Read Levels</button><button type="button">Read Levels</button></form>`),
    );
    expect(new Set(tables.tools.map((t) => t.title)).size).toBe(4);
    const literal = await inferGenericCapabilities(
      await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button>Save</button><button type="button">Preview</button><button type="button">Preview (2)</button><button type="button">Preview</button></form>`),
    );
    expect(literal.tools.map((t) => t.title)).toEqual(["Save", "Preview", "Preview (2)", "Preview (3)"]);
  });
});

describe("R70: a verb past the label budget still classifies", () => {
  it("excludes a finalize action whose verb sits after 115 characters, in content and in a title", async () => {
    const padding = "A".repeat(115);
    const content = await scanOwner(post(`${padding} delete account`));
    expect(content.capabilities.map((c) => [c.actionLabel.length, c.riskClass])).toEqual([[120, "finalize"]]);
    const title = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button title="${padding} delete account">Go</button></form>`);
    expect(title.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go", "finalize"]]);
    const login = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button aria-label="${padding} log in">Go</button></form>`);
    expect(login.capabilities.map((c) => c.riskClass)).toEqual(["credential"]);
  });

  it("excludes a finalize action named only through a long aria-labelledby reference", async () => {
    const padding = "A".repeat(115);
    const page = (button: string) =>
      `<span id="x">${padding} delete account</span><form method="post" action="/x"><input name="a" aria-label="A">${button}</form>`;
    const enabled = await scanOwner(page(`<button aria-labelledby="x">Go</button>`));
    expect(enabled.capabilities.map((c) => [c.actionLabel.length, c.riskClass])).toEqual([[120, "finalize"]]);
    expect((await inferGenericCapabilities(enabled)).tools).toEqual([]);
    // A disabled default named the same way is still listed as excluded rather than dropped.
    const disabled = await scanOwner(page(`<button aria-labelledby="x" disabled>Go</button>`));
    expect(disabled.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
  });
});

describe("R71: !important with inner whitespace still hides", () => {
  it("drops text under display:none ! important", async () => {
    const scan = await scanOwner(post(`Save<span style="display:none ! important"> and delete account</span>`));
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save", "write"]]);
  });
});

describe("R72: a title carries one ordinal at most", () => {
  it("renumbers from the base when a table ordinal is already taken", async () => {
    const table = (h: string) => `<table><thead><tr><th>${h}</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    const proposal = await inferGenericCapabilities(
      await scanOwner(`<h2>Levels</h2>${table("A")}${table("B")}${table("C")}<form method="post" action="/x"><input name="a" aria-label="A"><button>Read Levels</button><button type="button">Read Levels</button></form>`),
    );
    const titles = proposal.tools.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) expect(title).not.toMatch(/\) \(\d+\)$/);
  });
});

describe("R73: a safe form is not blocked for sharing a label with an excluded one", () => {
  it("passes every check when two forms both say Save draft and one is excluded by its title", async () => {
    const html = `<h2>One</h2><form method="post" action="/one"><input name="a" aria-label="A"><button title="Delete account">Save draft</button></form><h2>Two</h2><form method="post" action="/two"><input name="b" aria-label="B"><button>Save draft</button></form>`;
    const snapshot = await createOwnerSnapshot(html, { fallbackTitle: "QA page" });
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => t.name)).toEqual(["save_draft"]);
    expect(proposal.excluded).toHaveLength(1);
    expect((await runGenericChecks({ snapshot, scan, proposal })).passed).toBe(10);
  });
});

describe("R74: a descendant's aria-label names the button in place", () => {
  it("excludes an icon-font delete button and keeps a safe icon search", async () => {
    const icon = await scanOwner(post(`<i class="fa fa-trash" aria-label="Delete account"></i>`));
    expect(icon.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    const svg = await scanOwner(post(`<svg aria-label="Delete account"><path d="M0 0"></path></svg>`));
    expect(svg.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const mixed = await scanOwner(post(`<span role="img" aria-label="Delete account">x</span> Save`));
    expect(mixed.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account Save", "finalize"]]);
    const find = await scanOwner(`<form method="get" action="/q"><input type="search" name="q" aria-label="Q"><button><i aria-label="Search"></i></button></form>`);
    expect(find.capabilities.map((c) => [c.actionLabel, c.kind])).toEqual([["Search", "search"]]);
  });
});

describe("R75: a label element names a button", () => {
  it("takes a pointing or wrapping label over the button's content", async () => {
    const pointing = await scanOwner(`<label for="b">Delete account</label><form method="post" action="/x"><input name="a" aria-label="A"><button id="b">Save</button></form>`);
    expect(pointing.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    const wrapping = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><label>Delete account <button>Save</button></label></form>`);
    expect(wrapping.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const submit = await scanOwner(`<label for="s">Delete account</label><form method="post" action="/x"><input name="a" aria-label="A"><input id="s" type="submit" value="Save"></form>`);
    expect(submit.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    const legend = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><fieldset><legend>Delete account</legend><button>Save</button></fieldset></form>`);
    expect(legend.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save", "write"]]);
  });
});

describe("R76: a destructive option excludes the form", () => {
  it("judges select option text and values, and radio and checkbox labels and values", async () => {
    const menu = await scanOwner(
      `<form method="post" action="/x"><input name="a" aria-label="A"><select name="op" aria-label="Action"><option value="save">Save</option><option value="delete_account">Delete my account permanently</option></select><button>Go</button></form>`,
    );
    expect(menu.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go", "finalize"]]);
    expect((await inferGenericCapabilities(menu)).tools).toEqual([]);
    const byValue = await scanOwner(
      `<form method="post" action="/x"><input name="a" aria-label="A"><select name="op" aria-label="Action"><option value="keep">Keep</option><option value="delete-account">Remove it</option></select><button>Go</button></form>`,
    );
    expect(byValue.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const radio = await scanOwner(
      `<form method="post" action="/x"><input name="a" aria-label="A"><label><input type="radio" name="r" value="k"> Keep</label><label><input type="radio" name="r" value="c"> Cancel subscription</label><button>Go</button></form>`,
    );
    expect(radio.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const safe = await scanOwner(
      `<form method="post" action="/x"><input name="a" aria-label="A"><select name="op" aria-label="Action"><option value="save">Save</option><option value="archive">Archive</option></select><button>Go</button></form>`,
    );
    expect(safe.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go", "write"]]);
  });
});

describe("R77: an aria-describedby never names a button but is still judged", () => {
  it("excludes a Go button whose description finalizes", async () => {
    const scan = await scanOwner(
      `<span id="d">This will delete account data</span><form method="post" action="/x"><input name="a" aria-label="A"><button aria-describedby="d">Go</button></form>`,
    );
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go", "finalize"]]);
    const safe = await scanOwner(
      `<span id="d">Saves a draft</span><form method="post" action="/x"><input name="a" aria-label="A"><button aria-describedby="d">Go</button></form>`,
    );
    expect(safe.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go", "write"]]);
  });
});
