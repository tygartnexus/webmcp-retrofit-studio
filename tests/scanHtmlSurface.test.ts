import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";
import { createGenericToolDefinitions } from "../src/runtime/genericRuntime";
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

describe("R78: consent wording on a choice is not an action", () => {
  it("keeps a sign-up form with an age-confirmation checkbox and still excludes a destructive checkbox", async () => {
    const signup = await scanOwner(
      `<form method="post" action="/x"><input name="email" aria-label="Email"><label><input type="checkbox" name="confirm18" value="yes"> I confirm I am over 18</label><button>Sign up</button></form>`,
    );
    expect(signup.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Sign up", "write"]]);
    const destructive = await scanOwner(
      `<form method="post" action="/x"><input name="a" aria-label="A"><label><input type="checkbox" name="wipe" value="yes"> Delete my data</label><button>Continue</button></form>`,
    );
    expect(destructive.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const button = await scanOwner(post("Confirm order"));
    expect(button.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
  });
});

describe("R79: a label names a button only when the button is its control", () => {
  it("leaves a button alone when the wrapping label belongs to an earlier input or the id is duplicated", async () => {
    const wrapped = await scanOwner(
      `<form method="post" action="/x"><label>Delete account <input type="checkbox" name="chk"> <button>Save</button></label></form>`,
    );
    expect(wrapped.capabilities.map((c) => c.actionLabel)).toEqual(["Save"]);
    const duplicate = await scanOwner(
      `<label for="dup">Delete account</label><form method="post" action="/x"><input name="a" aria-label="A"><button id="dup">Save</button><button id="dup" formaction="/other">Other action</button></form>`,
    );
    expect(duplicate.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([
      ["Delete account", "finalize"],
      ["Other action", "write"],
    ]);
  });
});

describe("R80: an excluded action says what decided it", () => {
  it("carries the matching option, description, or field as evidence", async () => {
    const menu = await inferGenericCapabilities(
      await scanOwner(
        `<form method="post" action="/x"><input name="a" aria-label="A"><select name="op" aria-label="Action"><option value="save">Save</option><option value="delete_account">Delete my account permanently</option></select><button>Go</button></form>`,
      ),
    );
    expect(menu.excluded.map((e) => [e.actionLabel, e.evidence])).toEqual([["Go", "Delete my account permanently"]]);
    const described = await inferGenericCapabilities(
      await scanOwner(`<span id="d">This will delete account data</span><form method="post" action="/x"><input name="a" aria-label="A"><button aria-describedby="d">Go</button></form>`),
    );
    expect(described.excluded[0].evidence).toBe("This will delete account data");
    const login = await inferGenericCapabilities(
      await scanOwner(`<form method="post" action="/login"><input name="u" aria-label="User"><input type="password" name="pw" aria-label="Password"><button>Continue</button></form>`),
    );
    expect(login.excluded.map((e) => [e.riskClass, e.evidence])).toEqual([["credential", "Password field"]]);
    const plain = await inferGenericCapabilities(await scanOwner(post("Delete account")));
    expect(plain.excluded.map((e) => e.evidence)).toEqual(["Delete account"]);
  });
});

describe("R81: every name an option carries is judged", () => {
  it("reads an option label attribute, an option aria-label, and an optgroup label", async () => {
    const page = (select: string) => `<form method="post" action="/x"><input name="n" aria-label="Name">${select}<button>Go</button></form>`;
    const attr = await scanOwner(page(`<select name="op" aria-label="Action"><option value="x" label="Delete account">Keep</option><option value="y">Archive</option></select>`));
    expect(attr.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const aria = await scanOwner(page(`<select name="op" aria-label="Action"><option value="x" aria-label="Delete account">Keep</option><option value="y">Archive</option></select>`));
    expect(aria.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const group = await scanOwner(page(`<select name="op" aria-label="Action"><optgroup label="Delete account"><option value="now">Now</option></optgroup><optgroup label="Keep"><option value="keep">As is</option></optgroup></select>`));
    expect(group.capabilities.map((c) => [c.riskClass, c.riskEvidence])).toEqual([["finalize", "Delete account"]]);
  });
});

describe("R82: a radio or checkbox is judged by its accessible name", () => {
  it("reads aria-label, aria-labelledby, and screen-reader-only label text", async () => {
    const page = (radio: string) => `<span id="rl">Delete account</span><form method="post" action="/x"><input name="n" aria-label="Name">${radio}<button>Go</button></form>`;
    const aria = await scanOwner(page(`<label><input type="radio" name="r" value="x" aria-label="Delete account"> Keep</label>`));
    expect(aria.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const referenced = await scanOwner(page(`<label><input type="radio" name="r" value="x" aria-labelledby="rl"> Keep</label>`));
    expect(referenced.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const reader = await scanOwner(page(`<label><input type="checkbox" name="c" value="x"> Keep<span class="sr-only"> and delete account</span></label>`));
    expect(reader.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
  });
});

describe("R83: choices are judged only under a generic button", () => {
  it("keeps a contact form and a plan form whose buttons say what happens", async () => {
    const contact = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option value="q">General question</option><option value="cancel">Cancel my subscription</option><option value="delete">Delete my account</option></select><button>Send message</button></form>`,
    );
    expect(contact.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Send message", "write"]]);
    const plan = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="radio" name="p" value="m"> Monthly plan</label><label><input type="radio" name="p" value="y"> Annual plan</label><button>Save plan</button></form>`,
    );
    expect(plan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save plan", "write"]]);
    const menu = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="op" aria-label="Action"><option value="save">Save</option><option value="delete_account">Delete my account</option></select><button>Continue</button></form>`,
    );
    expect(menu.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const german = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="op" aria-label="Aktion"><option value="keep">Behalten</option><option value="del">Konto löschen</option></select><button>Weiter</button></form>`,
    );
    expect(german.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
  });
});

describe("R84: a wrapping label names the button by its own text", () => {
  it("leaves the button's content out of the name", async () => {
    const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><label>Draft <button>Save</button></label></form>`);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Draft", "write"]]);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => t.name)).toEqual(["draft"]);
  });
});

describe("R85: a choice that is the action is judged whatever the button says", () => {
  it("excludes a lone destructive select under a specific button and a select named action beside other fields", async () => {
    const lone = await scanOwner(
      `<form method="post" action="/x"><select name="op" aria-label="Choose"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></select><button>Save changes</button></form>`,
    );
    expect(lone.capabilities.map((c) => [c.actionLabel, c.riskClass, c.riskEvidence])).toEqual([["Save changes", "finalize", "Delete my account"]]);
    const named = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="action" aria-label="Action"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></select><button>Send request</button></form>`,
    );
    expect(named.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const filter = await scanOwner(
      `<form method="get" action="/orders"><select name="status" aria-label="Status"><option value="active">Active</option><option value="deleted">Deleted</option></select><button>Filter</button></form>`,
    );
    expect(filter.capabilities.map((c) => [c.kind, c.riskClass])).toEqual([["search", "read"]]);
    const data = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option value="q">Question</option><option value="delete">Delete my account</option></select><button>Send message</button></form>`,
    );
    expect(data.capabilities.map((c) => c.riskClass)).toEqual(["write"]);
  });
});

describe("R86: consent wording is exempt, a confirmed destructive noun is not", () => {
  it("finalizes Confirm deletion and Confirm cancellation under a generic button", async () => {
    const page = (option: string) =>
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="radio" name="op" value="d"> ${option}</label><label><input type="radio" name="op" value="k"> Keep</label><button>Go</button></form>`;
    const deletion = await scanOwner(page("Confirm deletion"));
    expect(deletion.capabilities.map((c) => [c.riskClass, c.riskEvidence])).toEqual([["finalize", "Confirm deletion"]]);
    const cancellation = await scanOwner(page("Confirm cancellation"));
    expect(cancellation.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const consent = await scanOwner(page("I confirm I am over 18"));
    expect(consent.capabilities.map((c) => c.riskClass)).toEqual(["write"]);
  });
});

describe("R87: generic labels survive filler words and punctuation", () => {
  it("judges choices under Submit form, Go ahead, OK, continue, Continue →, Next », and Save.", async () => {
    const page = (button: string) =>
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="mode" aria-label="Mode"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></select><button>${button}</button></form>`;
    for (const label of ["Submit form", "Go ahead", "OK, continue", "Continue →", "Next »", "Save."]) {
      const scan = await scanOwner(page(label));
      expect([label, scan.capabilities[0].riskClass]).toEqual([label, "finalize"]);
    }
    const specific = await scanOwner(page("Save profile"));
    expect(specific.capabilities.map((c) => c.riskClass)).toEqual(["write"]);
    const overridden = await scanOwner(page(`<span aria-hidden="true">Go</span>`).replace("<button>", `<button aria-label="Save profile">`));
    expect(overridden.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save profile", "finalize"]]);
  });
});

describe("R88: a destructive option under a specific button is withheld, not the whole form", () => {
  it("leaves the option out of the enum and names it, and treats an all-destructive select as the action", async () => {
    const contact = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option value="q">Question</option><option value="delete">Delete my account</option></select><button>Send message</button></form>`,
    );
    expect(contact.capabilities.map((c) => [c.riskClass, c.fields.find((f) => f.name === "reason")?.options])).toEqual([["write", ["q"]]]);
    const proposal = await inferGenericCapabilities(contact);
    const reason = proposal.tools[0].inputSchema.properties.reason as { enum?: string[]; description: string };
    expect(reason.enum).toEqual(["q"]);
    expect(reason.description).toBe("Reason. Withheld: Delete my account");

    const record = await scanOwner(
      `<form method="post" action="/x"><input name="id" aria-label="Record ID"><select name="mode" aria-label="Mode"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></select><button>Update record</button></form>`,
    );
    expect(record.capabilities.map((c) => [c.riskClass, c.fields.find((f) => f.name === "mode")?.options])).toEqual([["write", ["keep"]]]);

    const menu = await scanOwner(
      `<form method="post" action="/x"><input name="id" aria-label="Record ID"><select name="mode" aria-label="Mode"><option value="delete_account">Delete my account</option><option value="close">Close account</option></select><button>Update record</button></form>`,
    );
    expect(menu.capabilities.map((c) => [c.riskClass, c.riskEvidence])).toEqual([["finalize", "Delete my account"]]);

    const radio = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="radio" name="r" value="k"> Keep</label><label><input type="radio" name="r" value="c"> Cancel subscription</label><button>Save profile</button></form>`,
    );
    expect(radio.capabilities.map((c) => [c.riskClass, c.fields.find((f) => f.name === "r")?.options])).toEqual([["write", ["k"]]]);

    const box = await scanOwner(
      `<form method="post" action="/x"><input name="e" aria-label="Email"><label><input type="checkbox" name="unsub" value="yes"> Unsubscribe from all emails</label><button>Save preferences</button></form>`,
    );
    expect(box.capabilities.map((c) => [c.riskClass, c.fields.map((f) => f.name)])).toEqual([["write", ["e"]]]);
  });
});

describe("R89: a sibling plain button never carries a withheld option either", () => {
  it("prunes the enum for the plain button and excludes both when the select is all destructive", async () => {
    const page = (options: string) =>
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="mode" aria-label="Mode">${options}</select><button type="button">Save profile</button><button>Go</button></form>`;
    const mixed = await scanOwner(page(`<option value="keep">Keep</option><option value="delete_account">Delete my account</option>`));
    expect(mixed.capabilities.map((c) => [c.actionLabel, c.riskClass, c.fields.find((f) => f.name === "mode")?.options])).toEqual([
      ["Go", "finalize", ["keep"]],
      ["Save profile", "write", ["keep"]],
    ]);
    const menu = await scanOwner(page(`<option value="delete_account">Delete my account</option><option value="close">Close account</option>`));
    expect(menu.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([
      ["Go", "finalize"],
      ["Save profile", "finalize"],
    ]);
  });
});

describe("R90: consent is a first-person statement, not any confirm word", () => {
  it("judges Confirm order and Confirmer la commande but not I confirm the order", async () => {
    const page = (option: string, button: string) =>
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="radio" name="op" value="c"> ${option}</label><label><input type="radio" name="op" value="k"> Keep</label><button>${button}</button></form>`;
    expect((await scanOwner(page("Confirm order", "Go"))).capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    expect((await scanOwner(page("Confirmer la commande", "Go"))).capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const consent = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="checkbox" name="ok" value="yes"> I confirm the order details are correct</label><button>Save</button></form>`,
    );
    expect(consent.capabilities.map((c) => [c.riskClass, c.fields.map((f) => f.name)])).toEqual([["write", ["n", "ok"]]]);
  });
});

describe("R91: action menus are recognised by group label and separator-blind names, on any method", () => {
  it("excludes an optgroup labelled Actions and a bulk_action select, and withholds on a GET write", async () => {
    const grouped = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="mode" aria-label="Mode"><optgroup label="Actions"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></optgroup></select><button>Save profile</button></form>`,
    );
    expect(grouped.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const bulk = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="bulk_action" aria-label="What to do"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></select><button>Save profile</button></form>`,
    );
    expect(bulk.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const report = await scanOwner(
      `<form method="get" action="/x"><input name="n" aria-label="Name"><select name="op" aria-label="Action"><option value="keep">Keep</option><option value="delete_account">Delete my account permanently</option></select><button>Run report</button></form>`,
    );
    expect(report.capabilities.map((c) => [c.riskClass, c.fields.find((f) => f.name === "op")?.options])).toEqual([["write", ["keep"]]]);
  });
});

describe("R92: what a sighted person reads counts toward a generic label", () => {
  it("treats Save with a screen-reader-only object as generic", async () => {
    const scan = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="mode" aria-label="Mode"><option value="keep">Keep</option><option value="delete_account">Delete my account</option></select><button>Save<span class="sr-only"> profile</span></button></form>`,
    );
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Save profile", "finalize"]]);
  });
});

describe("R93: a first-person statement is consent only while it carries no destructive verb", () => {
  it("judges I want to delete my account and exempts I confirm I am over 18", async () => {
    const page = (button: string) =>
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="checkbox" name="del" value="yes"> I want to delete my account</label><button>${button}</button></form>`;
    const generic = await scanOwner(page("Go"));
    expect(generic.capabilities.map((c) => [c.riskClass, c.riskEvidence])).toEqual([["finalize", "want to delete my account"]]);
    const specific = await scanOwner(page("Save profile"));
    expect(specific.capabilities.map((c) => [c.riskClass, c.fields.map((f) => f.name)])).toEqual([["write", ["n"]]]);
    const german = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="checkbox" name="del" value="ja"> Ich möchte mein Konto löschen</label><button>Weiter</button></form>`,
    );
    expect(german.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
    const both = await scanOwner(page("Go").replace("I want to delete my account", "I confirm and delete my account"));
    expect(both.capabilities.map((c) => c.riskEvidence)).toEqual(["delete my account"]);
    const consent = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><label><input type="checkbox" name="age" value="yes"> I confirm I am over 18</label><button>Go</button></form>`,
    );
    expect(consent.capabilities.map((c) => [c.riskClass, c.fields.map((f) => f.name)])).toEqual([["write", ["n", "age"]]]);
  });
});

describe("R94: a preselected withheld option makes the parameter required", () => {
  it("requires the select and says the default was withheld, and excludes a checked destructive checkbox", async () => {
    const contact = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option value="delete" selected>Delete my account</option><option value="q">Question</option></select><button>Send message</button></form>`,
    );
    const reason = contact.capabilities[0].fields.find((f) => f.name === "reason")!;
    expect([reason.options, reason.required, reason.withheldDefault]).toEqual([["q"], true, true]);
    const proposal = await inferGenericCapabilities(contact);
    expect(proposal.tools[0].inputSchema.required).toContain("reason");
    expect((proposal.tools[0].inputSchema.properties.reason as { description: string }).description).toBe("Reason. Withheld (the page's default): Delete my account");
    const firstOption = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option value="delete">Delete my account</option><option value="q">Question</option></select><button>Send message</button></form>`,
    );
    expect(firstOption.capabilities[0].fields.find((f) => f.name === "reason")?.required).toBe(true);
    const checked = await scanOwner(
      `<form method="post" action="/x"><input name="e" aria-label="Email"><label><input type="checkbox" name="unsub" value="yes" checked> Unsubscribe from all emails</label><button>Save preferences</button></form>`,
    );
    expect(checked.capabilities.map((c) => [c.riskClass, c.riskEvidence])).toEqual([["finalize", "Unsubscribe from all emails"]]);
  });
});

describe("R95: option keys follow what the browser submits", () => {
  it("uses the text of a value-less option and lists each key once", async () => {
    const scan = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option>Question</option><option value="q">Query</option><option value="q">Again</option><option>Delete my account</option></select><button>Send message</button></form>`,
    );
    const reason = scan.capabilities[0].fields.find((f) => f.name === "reason")!;
    expect([reason.options, reason.withheld]).toEqual([["Question", "q"], ["Delete my account"]]);
  });
});

describe("R97: an overlong option key is not offered", () => {
  it("keeps the schema bounded while shorter keys stay", async () => {
    const long = "Z".repeat(201);
    const scan = await scanOwner(
      `<form method="post" action="/x"><input name="n" aria-label="Name"><select name="reason" aria-label="Reason"><option>${long}</option><option value="q">Question</option></select><button>Send message</button></form>`,
    );
    expect(scan.capabilities[0].fields.find((f) => f.name === "reason")?.options).toEqual(["q"]);
  });
});

describe("R98: a select offers only what the browser would submit", () => {
  const page = (select: string) => `<form method="post" action="/x"><input name="n" aria-label="Name">${select}<button>Send message</button></form>`;

  it("is not a parameter when every key is over budget, and skips disabled options", async () => {
    const long = "Z".repeat(201);
    const over = await scanOwner(page(`<select name="reason" aria-label="Reason"><option>${long}</option><option>${long}X</option></select>`));
    expect(over.capabilities[0].fields.map((f) => f.name)).toEqual(["n"]);
    expect(Object.keys((await inferGenericCapabilities(over)).tools[0].inputSchema.properties)).toEqual(["n"]);
    const disabled = await scanOwner(
      page(`<select name="mode" aria-label="Mode"><option value="k">Keep</option><option value="x" disabled>Locked</option><optgroup label="Later" disabled><option value="y">Soon</option></optgroup></select>`),
    );
    expect(disabled.capabilities[0].fields.find((f) => f.name === "mode")?.options).toEqual(["k"]);
  });

  it("keeps the browser's value for a text key and applies it", async () => {
    const html = page(`<select name="mode" aria-label="Mode"><option>Ke&#8203;ep</option><option>Non&nbsp;breaking</option></select>`);
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].fields.find((f) => f.name === "mode")?.options).toEqual(["Ke\u200Bep", "Non\u00A0breaking"]);
    const proposal = await inferGenericCapabilities(scan);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const [tool] = createGenericToolDefinitions({ hostDocument: doc, scan, proposal, modelContext: undefined });
    tool.execute({ n: "x", mode: "Non\u00A0breaking" }, { signal: new AbortController().signal });
    expect(doc.querySelector("select")!.selectedIndex).toBe(1);
  });

  it("still makes a preselected destructive option the action when the select has nothing to offer", async () => {
    const long = "Z".repeat(201);
    const scan = await scanOwner(page(`<select name="mode" aria-label="Mode"><option selected>Delete my account ${long}</option><option>${long}</option></select>`));
    expect(scan.capabilities.map((c) => c.riskClass)).toEqual(["finalize"]);
  });
});
