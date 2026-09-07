import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { buildGenericExportBundle } from "../src/export/buildGenericExportBundle";
import { scanHtml } from "../src/discovery/scanHtml";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";
import { createGenericToolDefinitions } from "../src/runtime/genericRuntime";
import { sampleToolInput } from "../src/runtime/sampleInput";
import { runGenericChecks } from "../src/validation/runGenericChecks";

/**
 * Regressions R12 onward from the 2026-09-07 review and QA rounds: button
 * model, checkbox groups, hidden text, pagination, and table ownership.
 */

function host(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}


async function scanOwner(html: string) {
  return scanHtml(await createOwnerSnapshot(html, { fallbackTitle: "QA page" }));
}

async function embedTools(html: string, snapshotTitle = "Embed") {
  const snapshot = await createOwnerSnapshot(html, { fallbackTitle: snapshotTitle });
  const scan = await scanHtml(snapshot);
  const proposal = await inferGenericCapabilities(scan);
  const validation = await runGenericChecks({ snapshot, scan, proposal });
  const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
  const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;
  const registered = new Map<string, WebMCP.ModelContextTool>();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
  });
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  new Function(embed)();
  return { scan, proposal, validation, registered, dispose: () => Reflect.deleteProperty(document, "modelContext") };
}

describe("R12: a value-less checkbox first in its group can be checked", () => {
  it("checks the 'on' box in the studio runtime and the embed", async () => {
    const html = `<form id="g" method="post" action="/g"><fieldset><legend>Extras</legend><label><input type="checkbox" name="i"> Plain</label><label><input type="checkbox" name="i" value="a"> A</label></fieldset><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].fields[0].options).toEqual(["on", "a"]);
    const proposal = await inferGenericCapabilities(scan);
    expect(sampleToolInput(proposal.tools[0].inputSchema)).toEqual({ i: ["on"] });
    const page = host(html);
    const [save] = createGenericToolDefinitions({ hostDocument: page, scan, proposal, modelContext: undefined });
    save.execute({ i: ["on"] }, { signal: new AbortController().signal });
    expect([...page.querySelectorAll('[name="i"]')].map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);

    const { registered, dispose } = await embedTools(html);
    try {
      registered.get("save")!.execute({ i: ["on"] }, { signal: new AbortController().signal });
      expect([...document.querySelectorAll('[name="i"]')].map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
    } finally {
      dispose();
    }
  });
});

describe("R13: the first submit button honours its own formaction and formmethod", () => {
  it("stages the primary submit to its formaction and classifies a GET preview submit as read", async () => {
    const html = `<title>Orders</title><form id="o" method="post" action="/orders/save"><label for="n">Note</label><input id="n" name="note">
<button type="submit" formaction="/orders/archive">Archive</button><button type="submit">Save draft</button>
<button type="submit" formmethod="get" formaction="/orders/preview">Show preview</button></form>`;
    const scan = await scanOwner(html);
    const caps = scan.capabilities.map((c) => [c.actionLabel, c.kind, c.riskClass, c.method, c.action ?? null]);
    expect(caps).toEqual([
      ["Archive", "form", "write", "post", "/orders/archive"],
      ["Save draft", "form", "write", "post", null],
      ["Show preview", "search", "read", "get", "/orders/preview"],
    ]);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => [t.name, t.riskClass])).toEqual([
      ["archive", "write"],
      ["save_draft", "write"],
      ["search_preview", "read"],
    ]);
    const staged: { toolName: string; action: string | null }[] = [];
    const tools = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined, onStaged: (c) => staged.push(c) });
    tools[0].execute({ note: "x" }, { signal: new AbortController().signal });
    tools[1].execute({ note: "x" }, { signal: new AbortController().signal });
    const preview = tools[2].execute({ note: "x" }, { signal: new AbortController().signal }) as { request: { action: string | null } };
    expect(staged.map((c) => [c.toolName, c.action])).toEqual([
      ["archive", "/orders/archive"],
      ["save_draft", "/orders/save"],
    ]);
    expect(preview.request.action).toBe("/orders/preview");
  });
});

describe("R14: a bare page number is neither previous nor next", () => {
  it("ignores 'Page 2' links for pagination but still skips a 'Page 2' wizard button", async () => {
    const html = `<section><table id="t"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><nav><a href="?p=1">Page 1</a><a href="?p=2">Page 2</a></nav></section>
<form id="w" method="post"><input name="a" aria-label="A"><button type="button">Page 2</button><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.find((c) => c.kind === "table")?.table?.pagination).toEqual({ previous: false, next: false });
    expect(scan.safety.navigationButtonsSkipped).toBe(1);
  });
});

describe("R15: textarea content and hiding classes are not visible text", () => {
  it("keeps them out of row labels", async () => {
    const html = `<table id="t"><thead><tr><th>Name</th><th></th></tr></thead><tbody><tr><td><span class="sr-only">internal-ref-77</span><textarea>draft text</textarea>Alice</td><td><form method="post" action="/e/1"><input name="role" aria-label="Role"><button>Edit</button></form></td></tr></tbody></table>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.find((c) => c.kind === "form")?.rowLabel).toBe("Alice");
  });
});

describe("R16: excluded controls are counted once per form", () => {
  it("does not multiply counts by the number of button capabilities", async () => {
    const html = `<form id="w" method="post" action="/w"><input type="hidden" name="csrf" value="t"><input type="password" name="pw"><input name="a" aria-label="A">
<button type="button">Review answers</button><button type="button">Check totals</button><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.safety.hiddenFieldsExcluded).toBe(1);
    expect(scan.safety.credentialFieldsExcluded).toBe(1);
  });
});

describe("R17: read and search descriptions are clipped to the lint budget", () => {
  it("exports a page with a very long heading", async () => {
    const heading = "H".repeat(600);
    const html = `<h2>${heading}</h2><form method="get" action="/s"><input name="q" type="search" aria-label="Find entries"><button>Search</button></form>
<h2>${heading} table</h2><table id="t"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    for (const tool of proposal.tools) expect(tool.description.length).toBeLessThanOrEqual(500);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    await expect(buildGenericExportBundle({ snapshot, scan, proposal, validation })).resolves.toBeTruthy();
  });
});

describe("R18: a repeated block's heading must sit outside its form", () => {
  it("takes the paragraph, not a strong element inside the form", async () => {
    const html = `<ul><li><p>Widget A</p><form method="post" action="/a"><strong>Danger zone</strong><input name="q" aria-label="Q"><button>Update</button></form></li><li><p>Widget B</p><form method="post" action="/b"><strong>Danger zone</strong><input name="q" aria-label="Q"><button>Update</button></form></li></ul>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => c.rowLabel)).toEqual(["Widget A", "Widget B"]);
  });
});

describe("R19: a root-level table sees pager links on both sides", () => {
  it("reads a previous link before the table and a next link after it", async () => {
    const html = `<a href="?p=1">Previous</a><table id="t"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><a href="?p=3">Next</a>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].table?.pagination).toEqual({ previous: true, next: true });
  });
});

describe("R20: group selectors never catch a same-name text control", () => {
  it("addresses radios by type and leaves the text input untouched", async () => {
    const html = `<form id="m" method="post"><label for="k">Kind text</label><input id="k" name="kind"><fieldset><legend>Kind</legend><label><input type="radio" name="kind" value="a"> A</label><label><input type="radio" name="kind" value="b"> B</label></fieldset><button>Save</button></form>`;
    const scan = await scanOwner(html);
    const page = host(html);
    const radios = scan.capabilities[0].fields.find((f) => f.inputType === "radio")!;
    expect(radios.selector).toBe(`#m input[type="radio"][name="kind"]`);
    expect(page.querySelectorAll(radios.selector)).toHaveLength(2);
    const proposal = await inferGenericCapabilities(scan);
    const [save] = createGenericToolDefinitions({ hostDocument: page, scan, proposal, modelContext: undefined });
    save.execute({ kind: "text", kind_2: "b" }, { signal: new AbortController().signal });
    expect((page.querySelector("#k") as HTMLInputElement).value).toBe("text");
    expect((page.querySelector('input[type="radio"][value="b"]') as HTMLInputElement).checked).toBe(true);
  });
});

describe("R21: a too-wide table fails only the output-budget check", () => {
  it("does not blame the no-submit check", async () => {
    const cells = Array.from({ length: 400 }, (_, i) => `<td>c${i}</td>`).join("");
    const html = `<h2>Huge</h2><table id="h"><thead><tr>${"<th>H</th>".repeat(400)}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const report = await runGenericChecks({ snapshot, scan, proposal });
    expect(report.checks.filter((c) => c.status === "failed").map((c) => c.id)).toEqual(["output-budget"]);
    expect(report.checks.find((c) => c.id === "output-budget")?.detail).toMatch(/too many columns/);
  });
});

describe("R22: an image submit button is labelled by its alt text", () => {
  it("names the tool from the alt attribute", async () => {
    const html = `<form id="i" method="post" action="/send"><input name="msg" aria-label="Message"><input type="image" src="go.png" alt="Send it"></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].actionLabel).toBe("Send it");
    expect((await inferGenericCapabilities(scan)).tools[0].name).toBe("send_it");
  });
});

describe("R23: the primary action is the first submitting control", () => {
  it("keeps an image submit that follows a plain button, and never doubles the plain button", async () => {
    const html = `<form id="f" method="post" action="/send"><input name="msg" aria-label="Message"><button type="button">Review answers</button><input type="image" src="go.png" alt="Send it"></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => c.actionLabel)).toEqual(["Send it", "Review answers"]);
    expect((await inferGenericCapabilities(scan)).tools.map((t) => t.name)).toEqual(["send_it", "review_answers"]);
  });

  it("gives a form with only a plain button the default Submit action plus the button", async () => {
    const html = `<form id="f" method="post" action="/x"><input name="a" aria-label="A"><button type="button">Review answers</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.id.split(":")[0]])).toEqual([
      ["Submit", "form"],
      ["Review answers", "action"],
    ]);
  });

  it("models a second image submit with its own formaction", async () => {
    const html = `<form id="f" method="post" action="/now"><input name="msg" aria-label="Message"><input type="image" src="a.png" alt="Send it"><input type="image" src="b.png" alt="Send later" formaction="/later"></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.action ?? null])).toEqual([
      ["Send it", null],
      ["Send later", "/later"],
    ]);
  });
});

describe("R24: hidden text never reaches names, descriptions, or the export", () => {
  it("ignores hidden spans in headings, button labels, legends, and labels", async () => {
    const html = `<h2>Orders <span class="sr-only">ref-991-secret</span></h2>
<table id="t"><thead><tr><th>Id</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<form id="f" method="post" action="/x"><fieldset><legend>Kind <span hidden>legend-secret</span></legend>
<label><input type="radio" name="kind" value="a"> A</label><label><input type="radio" name="kind" value="b"> B</label></fieldset>
<label for="n">Name <span aria-hidden="true">label-secret</span></label><input id="n" name="name">
<button>Save<span hidden>token-abc</span></button></form>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);

    expect(proposal.tools.map((t) => t.name)).toEqual(["save", "read_orders"]);
    expect(proposal.tools[0].inputSchema.properties.kind.description).toBe("Kind");
    expect(proposal.tools[0].inputSchema.properties.name.description).toBe("Name");
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    for (const file of bundle.files) {
      for (const secret of ["ref-991-secret", "legend-secret", "label-secret", "token-abc"]) {
        expect(file.content, `${file.path} ${secret}`).not.toContain(secret);
      }
    }
  });
});

describe("R25: a table with another table nested in a sibling is not lone", () => {
  it("leaves the nested table's pager to the nested table", async () => {
    const html = `<section><table id="a"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<div><table id="b"><thead><tr><th>Y</th></tr></thead><tbody><tr><td>2</td></tr></tbody></table><a href="?p=2" rel="next">Next</a></div></section>`;
    const scan = await scanOwner(html);
    const flags = Object.fromEntries(scan.capabilities.map((c) => [c.selector, c.table?.pagination]));
    expect(flags["#a"]).toEqual({ previous: false, next: false });
    expect(flags["#b"]).toEqual({ previous: false, next: true });
  });
});

describe("R26: an empty value attribute is the empty key", () => {
  it("keys value='' as '' and applies it", async () => {
    const html = `<form id="g" method="post"><label><input type="checkbox" name="i" value=""> Blank</label><label><input type="checkbox" name="i" value="a"> A</label><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].fields[0].options).toEqual(["", "a"]);
    const proposal = await inferGenericCapabilities(scan);
    const page = host(html);
    const [save] = createGenericToolDefinitions({ hostDocument: page, scan, proposal, modelContext: undefined });
    save.execute({ i: [""] }, { signal: new AbortController().signal });
    expect([...page.querySelectorAll('[name="i"]')].map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
  });
});

describe("R27: input type=button behaves like button type=button", () => {
  it("becomes an action or a skipped navigation control by its value", async () => {
    const html = `<form id="w" method="post"><input name="a" aria-label="A"><input type="button" value="Review answers"><input type="button" value="Next"><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => c.actionLabel)).toEqual(["Save", "Review answers"]);
    expect(scan.safety.navigationButtonsSkipped).toBe(1);
  });
});

describe("R28: plain buttons ignore formmethod, and GET submits keep search fields", () => {
  it("does not turn a plain button with formmethod=get into a read tool", async () => {
    const html = `<form id="p" method="post" action="/p"><input name="note" aria-label="Note"><button type="button" formmethod="get" formaction="/preview">Show preview</button><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.kind, c.riskClass, c.method, c.action ?? null])).toEqual([
      ["Save", "form", "write", "post", null],
      ["Show preview", "form", "write", "post", null],
    ]);
  });

  it("names a GET results submit after the button and keeps the search field", async () => {
    const html = `<h1>Orders</h1><form id="o" method="post" action="/save"><input name="q" type="search" aria-label="Find orders"><input name="note" aria-label="Note"><button>Save</button><button type="submit" formmethod="get" formaction="/results">Show results</button></form>`;
    const scan = await scanOwner(html);
    const proposal = await inferGenericCapabilities(scan);
    const tools = proposal.tools.map((t) => [t.name, Object.keys(t.inputSchema.properties)]);
    // The GET submit owns the search field, so the POST write does not carry it and no field-derived search duplicates it.
    expect(tools).toEqual([
      ["save", ["note"]],
      ["search_results", ["q", "note"]],
    ]);
  });
});

describe("R29: a table owns only its own rows and cells", () => {
  it("keeps a nested table's headers and rows out of the outer table, in scan, runtime, and embed", async () => {
    const html = `<h2>Grid</h2><table id="outer"><thead><tr><th>Name</th><th>Actions</th></tr></thead><tbody>
<tr><td>Ann</td><td><form method="post" action="/save"><table id="inner"><thead><tr><th>K</th></tr></thead><tbody><tr><td>v1</td></tr><tr><td>v2</td></tr></tbody></table><input name="note" aria-label="Note"><button>Save</button></form></td></tr>
<tr><td>Bob</td><td>none</td></tr></tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const outer = scan.capabilities.find((c) => c.selector === "#outer")!;
    const inner = scan.capabilities.find((c) => c.selector === "#inner")!;

    expect(outer.table).toMatchObject({ headers: ["Name", "Actions"], rowCount: 2 });
    expect(inner.table).toMatchObject({ headers: ["K"], rowCount: 2 });
    expect(outer.table?.pagination).toEqual({ previous: false, next: false });

    const proposal = await inferGenericCapabilities(scan);
    const tools = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined });
    const readOuter = tools.find((t) => t.name === "read_grid")!;
    const rows = (readOuter.execute({}, { signal: new AbortController().signal }) as { rows: string[][] }).rows;
    expect(rows).toEqual([
      ["Ann", "Kv1v2Save"],
      ["Bob", "none"],
    ]);

    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    const { registered, dispose } = await embedTools(html);
    try {
      const shipped = registered.get("read_grid")!.execute({}, { signal: new AbortController().signal }) as { rows: string[][] };
      expect(shipped.rows).toEqual(rows);
    } finally {
      dispose();
    }
  });

  it("keeps the outer table's pager when a sub-table sits in one of its cells", async () => {
    const html = `<section><a href="?p=1" rel="prev">Previous</a><table id="outer"><thead><tr><th>A</th></tr></thead><tbody><tr><td><table id="sub"><thead><tr><th>B</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table></td></tr></tbody></table></section>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.find((c) => c.selector === "#outer")?.table?.pagination).toEqual({ previous: true, next: false });
  });
});

describe("R30: button labels fall back to aria-label and title, and titles are never empty", () => {
  it("labels an icon button from its aria-label", async () => {
    const html = `<form id="f" method="post" action="/d"><input name="a" aria-label="A"><button aria-label="Save draft"><span hidden>icon</span></button><input type="button" value="" title="Check totals"></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => c.actionLabel)).toEqual(["Save draft", "Check totals"]);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => [t.name, t.title])).toEqual([
      ["save_draft", "Save draft"],
      ["check_totals", "Check totals"],
    ]);
    for (const tool of proposal.tools) expect(tool.title.length).toBeGreaterThan(0);
  });
});

describe("R31: the default Submit action exists only where implicit submission applies", () => {
  it("omits it for a multi-field form with only plain buttons and keeps it for a single field", async () => {
    const multi = await scanOwner(`<form id="m" method="post"><input name="a" aria-label="A"><input name="b" aria-label="B"><button type="button">Review</button></form>`);
    expect(multi.capabilities.map((c) => c.actionLabel)).toEqual(["Review"]);
    const single = await scanOwner(`<form id="s" method="get" action="/q"><input name="q" type="search" aria-label="Find"></form>`);
    expect(single.capabilities.map((c) => [c.actionLabel, c.kind])).toEqual([["Submit", "search"]]);
  });
});

describe("R32: checkbox option keys are unique within a group", () => {
  it("lists a repeated value once", async () => {
    const html = `<form id="g" method="post"><label><input type="checkbox" name="i" value="x"> One</label><label><input type="checkbox" name="i" value="x"> Two</label><label><input type="checkbox" name="i" value="y"> Y</label><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].fields[0].options).toEqual(["x", "y"]);
  });
});

describe("R33: a button-derived search names its button in the title", () => {
  it("is the form's only search and names the button", async () => {
    const html = `<h1>Orders</h1><form id="o" method="post" action="/save"><label for="q">Orders</label><input id="q" name="q" type="search"><button>Save</button><button type="submit" formmethod="get" formaction="/find">Orders</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    const searches = proposal.tools.filter((t) => t.riskClass === "read").map((t) => [t.name, t.title]);
    expect(searches).toEqual([["search_orders", "Search Orders"]]);
    expect(proposal.tools[1].description).toContain(`through its "Orders" button`);
  });
});

describe("R34: a hidden heading does not shadow an earlier visible one", () => {
  it("names the table after the visible heading", async () => {
    const html = `<title>Ledger</title><h1>Invoices</h1><h2 hidden>SECRET-HEAD</h2><table id="t"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    expect(proposal.tools[0].name).toBe("read_invoices");
  });
});

describe("R35: a button-less form needs a real submission path, but an excluded one is still listed", () => {
  it("proposes nothing for a two-field form with a search input and no button", async () => {
    const scan = await scanOwner(`<form id="bs" method="post" action="/x"><input name="q" type="search" aria-label="Find"><input name="note" aria-label="Note"></form>`);
    expect(scan.capabilities).toEqual([]);
  });

  it("lists a button-less credential form as excluded and still counts its controls", async () => {
    const scan = await scanOwner(`<form id="pw" method="post" action="/login"><input name="user" aria-label="User"><input name="realm" aria-label="Realm"><input type="password" name="pw"><input type="hidden" name="csrf" value="t"></form>`);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Submit", "credential"]]);
    expect(scan.safety.credentialFieldsExcluded).toBe(1);
    expect(scan.safety.hiddenFieldsExcluded).toBe(1);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools).toEqual([]);
    expect(proposal.excluded.map((e) => e.riskClass)).toEqual(["credential"]);
  });

  it("counts excluded controls of a dropped form", async () => {
    const scan = await scanOwner(`<form id="d" method="post"><input name="a" aria-label="A"><input name="b" aria-label="B"><input type="hidden" name="csrf" value="t"></form>`);
    expect(scan.capabilities).toEqual([]);
    expect(scan.safety.hiddenFieldsExcluded).toBe(1);
  });
});

describe("R36: implicit submission follows the HTML input-type list", () => {
  it("skips textarea-only and select-only forms and keeps a single number field", async () => {
    const textarea = await scanOwner(`<form id="t" method="post"><textarea name="body" aria-label="Body"></textarea></form>`);
    const select = await scanOwner(`<form id="s" method="post"><select name="r" aria-label="R"><option value="a">a</option></select></form>`);
    const number = await scanOwner(`<form id="n" method="post"><input type="number" name="qty" aria-label="Qty"></form>`);
    expect(textarea.capabilities).toEqual([]);
    expect(select.capabilities).toEqual([]);
    expect(number.capabilities.map((c) => c.actionLabel)).toEqual(["Submit"]);
    expect((await scanOwner(`<form id="x" method="post"><textarea name="body" aria-label="Body"></textarea><button>Post</button></form>`)).capabilities[0].fields[0].inputType).toBe("textarea");
  });
});

describe("R37: titles are budgeted", () => {
  it("clips a very long button label in the title but keeps the name within budget", async () => {
    const label = "Send the completed application form to the regional office for review ".repeat(6);
    const proposal = await inferGenericCapabilities(await scanOwner(`<form id="f" method="post"><input name="a" aria-label="A"><button>${label}</button></form>`));
    expect(proposal.tools[0].title.length).toBeLessThanOrEqual(120);
    expect(proposal.tools[0].name.length).toBeLessThanOrEqual(30);
  });
});

describe("R38: links inside a table are never its pagers", () => {
  it("ignores a Next link in a cell and a nested table's own pager", async () => {
    const html = `<section><table id="outer"><thead><tr><th>A</th></tr></thead><tbody>
<tr><td><a href="/item/1/next">Next</a></td></tr>
<tr><td><table id="sub"><thead><tr><th>B</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table><a href="?p=2" rel="next">Next</a></td></tr></tbody></table></section>`;
    const scan = await scanOwner(html);
    const flags = Object.fromEntries(scan.capabilities.map((c) => [c.selector, c.table?.pagination]));
    expect(flags["#outer"]).toEqual({ previous: false, next: false });
    expect(flags["#sub"]).toEqual({ previous: false, next: true });
  });
});

describe("R39: a button holding only an image is labelled by the alt text", () => {
  it("names the tool from the image alt", async () => {
    const proposal = await inferGenericCapabilities(await scanOwner(`<form id="f" method="post" action="/s"><input name="msg" aria-label="Message"><button><img src="go.png" alt="Send"></button></form>`));
    expect(proposal.tools.map((t) => [t.name, t.title])).toEqual([["send", "Send"]]);
  });
});

describe("R40: tables under one heading carry an ordinal in their title", () => {
  it("distinguishes the titles as well as the names", async () => {
    const table = (id: string) => `<table id="${id}"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    const proposal = await inferGenericCapabilities(await scanOwner(`<h2>Levels</h2>${table("a")}${table("b")}${table("c")}`));
    expect(proposal.tools.map((t) => [t.name, t.title])).toEqual([
      ["read_levels", "Read Levels"],
      ["read_levels_2", "Read Levels (2)"],
      ["read_levels_3", "Read Levels (3)"],
    ]);
  });
});

describe("R41: button labels follow accessible-name order and ignore hidden images", () => {
  it("lets aria-label win over an icon or visible text, so a decorated finalize action stays excluded", async () => {
    const icon = await scanOwner(`<form method="get" action="/x"><input name="q" aria-label="Term"><button aria-label="Delete account"><img alt="Go"></button></form>`);
    const visible = await scanOwner(`<form method="get" action="/x"><input name="q" aria-label="Term"><button aria-label="Delete account">Go</button></form>`);
    expect(icon.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    expect(visible.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
  });

  it("ignores a hidden image's alt", async () => {
    const scan = await scanOwner(`<form method="get" action="/x"><input name="q" aria-label="Term"><button><img alt="Find" hidden></button></form>`);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Submit", "write"]]);
  });

  it("clips a very long label at the scan so the staged change carries the clipped label", async () => {
    const label = "Send the completed application form to the regional office for review ".repeat(6);
    const html = `<form id="f" method="post" action="/s"><input name="a" aria-label="A"><button>${label}</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].actionLabel.length).toBeLessThanOrEqual(120);
    const proposal = await inferGenericCapabilities(scan);
    const staged: { actionLabel: string }[] = [];
    const [tool] = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined, onStaged: (c) => staged.push(c) });
    tool.execute({ a: "x" }, { signal: new AbortController().signal });
    expect(staged[0].actionLabel.length).toBeLessThanOrEqual(120);
  });
});

describe("R42: footer rows are not data and a footer pager belongs to its table", () => {
  it("detects a tfoot pager and excludes the footer row from reads in studio and embed", async () => {
    const html = `<h2>Orders</h2><table id="t"><thead><tr><th>Id</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody><tfoot><tr><td><a href="?p=2" rel="next">Next</a></td></tr></tfoot></table>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].table).toEqual({ headers: ["Id"], rowCount: 2, pagination: { previous: false, next: true } });
    const proposal = await inferGenericCapabilities(scan);
    const [read] = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined });
    const rows = (read.execute({}, { signal: new AbortController().signal }) as { rows: string[][] }).rows;
    expect(rows).toEqual([["1"], ["2"]]);
    const { registered, dispose } = await embedTools(html);
    try {
      expect((registered.get("read_orders")!.execute({}, { signal: new AbortController().signal }) as { rows: string[][] }).rows).toEqual(rows);
    } finally {
      dispose();
    }
  });
});

describe("R43: title suffixes survive the budget and ordinals only count tables", () => {
  const table = (id: string) => `<table id="${id}"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;

  it("keeps the ordinal on a long heading", async () => {
    const heading = "Consolidated statement of comprehensive income and retained earnings for the current and prior reporting periods";
    const proposal = await inferGenericCapabilities(await scanOwner(`<h2>${heading}</h2>${table("a")}${table("b")}`));
    const titles = proposal.tools.map((t) => t.title);
    expect(titles[0].length).toBeLessThanOrEqual(120);
    expect(titles[1].length).toBeLessThanOrEqual(120);
    expect(titles[1].endsWith(" (2)")).toBe(true);
    expect(titles[0]).not.toBe(titles[1]);
  });

  it("does not add an ordinal to a lone table whose name collides with a write tool", async () => {
    const proposal = await inferGenericCapabilities(
      await scanOwner(`<h2>Levels</h2><form id="f" method="post"><input name="a" aria-label="A"><button>Read levels</button></form>${table("only")}`),
    );
    expect(proposal.tools.map((t) => [t.name, t.title])).toEqual([
      ["read_levels", "Read levels"],
      ["read_levels_2", "Read Levels"],
    ]);
  });
});

describe("R44: controls associated by a form attribute belong to the form", () => {
  it("classifies an external password as credential and finds an external submit button", async () => {
    const html = `<form id="op" method="post" action="/login"><input name="user" aria-label="User"><button>Continue</button></form><input type="password" name="pw" form="op">
<form id="ob" method="post" action="/save"><input name="a" aria-label="A"><input name="b" aria-label="B"></form><label for="c">C</label><input id="c" name="c" form="ob"><button form="ob">Save</button>`;
    const scan = await scanOwner(html);
    const login = scan.capabilities.find((c) => c.selector === "#op")!;
    const save = scan.capabilities.find((c) => c.selector === "#ob")!;

    expect(login.riskClass).toBe("credential");
    expect(scan.safety.credentialFieldsExcluded).toBe(1);
    expect(save.actionLabel).toBe("Save");
    expect(save.fields.map((f) => [f.name, f.label])).toEqual([["a", "A"], ["b", "B"], ["c", "C"]]);
    const page = host(html);
    for (const field of save.fields) expect(page.querySelectorAll(field.selector)).toHaveLength(1);
    const proposal = await inferGenericCapabilities(scan);
    const snapshot = await createOwnerSnapshot(html);
    expect((await runGenericChecks({ snapshot, scan, proposal })).passed).toBe(10);
  });
});

describe("R45: a nameless Enter-submitting input still blocks implicit submission", () => {
  it("proposes nothing for a search field beside a nameless text input and no button", async () => {
    const scan = await scanOwner(`<form id="n" method="get"><input type="search" name="q" aria-label="Q"><input type="text"></form>`);
    expect(scan.capabilities).toEqual([]);
  });
});

describe("R46: a button outside its form still acts on that form", () => {
  it("passes the checks and stages against the form's action in studio and embed", async () => {
    const html = `<form id="ob" method="post" action="/save"><input name="a" aria-label="A"><button>Save</button></form><button type="button" form="ob">Preview</button><button type="submit" form="ob" formaction="/store">Store copy</button>`;
    const snapshot = await createOwnerSnapshot(html, { fallbackTitle: "QA page" });
    const scan = await scanHtml(snapshot);
    expect(scan.capabilities.map((c) => c.actionLabel)).toEqual(["Save", "Preview", "Store copy"]);
    const proposal = await inferGenericCapabilities(scan);
    expect((await runGenericChecks({ snapshot, scan, proposal })).passed).toBe(10);
    const names = scan.capabilities.slice(1).map((c) => proposal.tools.find((t) => t.capabilityId === c.id)!.name);
    const signal = new AbortController().signal;

    const staged: { action: string | null }[] = [];
    const tools = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined, onStaged: (c) => staged.push(c) });
    for (const name of names) tools.find((t) => t.name === name)!.execute({ a: "x" }, { signal });
    expect(staged.map((c) => c.action)).toEqual(["/save", "/store"]);

    const shipped: { action: string | null }[] = [];
    const listener = (event: Event) => shipped.push((event as CustomEvent<{ action: string | null }>).detail);
    window.addEventListener("webmcp-retrofit:staged", listener);
    const { registered, dispose } = await embedTools(html);
    try {
      for (const name of names) registered.get(name)!.execute({ a: "x" }, { signal });
      expect(shipped.map((c) => c.action)).toEqual(["/save", "/store"]);
    } finally {
      window.removeEventListener("webmcp-retrofit:staged", listener);
      dispose();
    }
  });
});

describe("R47: an image's alt joins the button's text in place", () => {
  it("classifies a finalize action whose verb or object is an icon", async () => {
    const iconVerb = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button><img alt="Delete"> account</button></form>`);
    const iconObject = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button>Go <img alt="Delete account"></button></form>`);
    expect(iconVerb.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    expect(iconObject.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Go Delete account", "finalize"]]);
  });
});

describe("R48: aria-labelledby names the button first", () => {
  it("takes the referenced text over aria-label and content, even when the reference is hidden", async () => {
    const scan = await scanOwner(
      `<span id="lbl" hidden>Delete account</span><form method="post" action="/x"><input name="a" aria-label="A"><button aria-labelledby="lbl" aria-label="Go">Go</button></form>`,
    );
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
  });
});

describe("R49: screen-reader-only text names an icon button", () => {
  it("keeps a finalizing icon button excluded", async () => {
    const scan = await scanOwner(
      `<form method="post" action="/x"><input name="a" aria-label="A"><button><span class="sr-only">Delete account</span><span aria-hidden="true">x</span></button></form>`,
    );
    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
  });
});

describe("R50: a control belongs to exactly the form its form attribute names", () => {
  const page = (crossed: string) =>
    `<form id="A" method="post" action="/a"><input name="aField" aria-label="A field"><input name="x" aria-label="X"${crossed}><input type="password" name="ghost" form="missing"><button>Save A</button></form><form id="B" method="post" action="/b"><input name="bField" aria-label="B field"><button>Save B</button></form>`;

  it("moves an inside control to the named form and drops one naming nothing", async () => {
    const scan = await scanOwner(page(` form="B"`));
    const owners = Object.fromEntries(scan.capabilities.map((c) => [c.selector, c.fields.map((f) => f.name)]));
    expect(owners).toEqual({ "#A": ["aField"], "#B": ["x", "bField"] });
    expect(scan.capabilities.map((c) => c.riskClass)).toEqual(["write", "write"]);
    expect(scan.safety.credentialFieldsExcluded).toBe(0);
  });

  it("fails the bindings check when a field's control names another form", async () => {
    const scan = await scanOwner(page(""));
    const proposal = await inferGenericCapabilities(scan);
    const tampered = await createOwnerSnapshot(page(` form="B"`), { fallbackTitle: "QA page" });
    const bindings = (await runGenericChecks({ snapshot: tampered, scan, proposal })).checks.find((c) => c.id === "bindings")!;
    expect(bindings.status).toBe("failed");
    expect(bindings.detail).toContain("resolves outside its own form");
  });
});

describe("R51: a long button suffix cannot push a title past the budget", () => {
  it("keeps every title within 120 characters and the suffix present", async () => {
    const label = "Show the regional office archive locator across every branch and satellite site worldwide extended lookup network directory service";
    const html = `<form id="f" method="get" action="/x"><input name="q" type="search" aria-label="Term"><button>Find</button><button type="submit" aria-label="${label}">Go</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    expect(proposal.tools).toHaveLength(2);
    for (const tool of proposal.tools) expect(tool.title.length).toBeLessThanOrEqual(120);
    expect(proposal.tools[1].title.endsWith(")")).toBe(true);
  });
});

describe("R52: disabled controls never block, and skipped navigation buttons are all counted", () => {
  it("proposes the lone enabled search field", async () => {
    const scan = await scanOwner(`<form id="s" method="get" action="/q"><input type="search" name="q" aria-label="Q"><input type="text" name="note" disabled></form>`);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.kind])).toEqual([["Submit", "search"]]);
  });

  it("counts a navigation button associated by a form attribute", async () => {
    const scan = await scanOwner(`<form id="ob" method="post" action="/save"><input name="a" aria-label="A"><button>Save</button></form><button type="button" form="ob">Next</button>`);
    expect(scan.capabilities.map((c) => c.actionLabel)).toEqual(["Save"]);
    expect(scan.safety.navigationButtonsSkipped).toBe(1);
  });
});

describe("R53: a GET submit button owns the form's search", () => {
  it("emits one read tool, aimed at the button's target, and keeps the search field off the write", async () => {
    const html = `<h1>Notes</h1><form id="n" method="post" action="/save"><input name="q" type="search" aria-label="Query"><input name="note" aria-label="Note"><button>Save</button><button type="submit" formmethod="get" formaction="/find">Find</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => [c.kind, c.fields.map((f) => f.name)])).toEqual([
      ["form", ["note"]],
      ["search", ["q", "note"]],
    ]);
    const proposal = await inferGenericCapabilities(scan);
    const reads = proposal.tools.filter((t) => t.riskClass === "read");
    expect(reads).toHaveLength(1);
    const read = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined }).find((t) => t.name === reads[0].name)!;
    const output = read.execute({ q: "x" }, { signal: new AbortController().signal }) as { request: { action: string } };
    expect(output.request.action).toBe("/find");
  });
});

describe("R54: inline edges keep their whitespace", () => {
  it("reads a finalize action split across inline elements", async () => {
    for (const markup of ["Delete<span> account</span>", "<span>Delete </span>account", "<span>Delete </span><span>account</span>"]) {
      const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button>${markup}</button></form>`);
      expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Delete account", "finalize"]]);
    }
  });

  it("keeps heading and label words apart", async () => {
    const scan = await scanOwner(
      `<h2>Open<span> orders</span></h2><form method="post" action="/x"><label>First<span> name</span> <input name="fn"></label><button>Save</button></form>`,
    );
    expect(scan.capabilities[0].heading).toBe("Open orders");
    expect(scan.capabilities[0].fields[0].label).toBe("First name");
  });
});

describe("R55: block children and line breaks separate words", () => {
  it("reads a finalize action broken across lines or blocks", async () => {
    const cases: [string, string][] = [
      ["Place<br>order", "Place order"],
      ["<p>Delete</p><p>account</p>", "Delete account"],
      ["<div>Delete</div><div>account</div>", "Delete account"],
      [`<span style="display: block">Delete</span>account`, "Delete account"],
    ];
    for (const [markup, label] of cases) {
      const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><button>${markup}</button></form>`);
      expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([[label, "finalize"]]);
    }
  });

  it("spaces a heading broken by a line break", async () => {
    const proposal = await inferGenericCapabilities(
      await scanOwner(`<h2>Orders<br>2026</h2><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`),
    );
    expect(proposal.tools[0].title).toBe("Read Orders 2026");
  });
});

describe("R56: display-none classes hide from names, screen-reader classes do not", () => {
  it("drops a display-none span from a button name and keeps a screen-reader span", async () => {
    const page = (button: string) => `<form method="post" action="/x"><input name="a" aria-label="A"><button>${button}</button></form>`;
    const verb = await scanOwner(page(`Remove<span class="d-none"> filter</span>`));
    expect(verb.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([["Remove", "finalize"]]);
    const leak = await scanOwner(page(`Save<span class="hidden"> ref-991-secret</span>`));
    expect(leak.capabilities[0].actionLabel).toBe("Save");
    const nested = await scanOwner(page(`Save<span class="is-hidden"><span> ref-991-secret</span></span>`));
    expect(nested.capabilities[0].actionLabel).toBe("Save");
    const reader = await scanOwner(page(`Save<span class="visually-hidden"> draft</span>`));
    expect(reader.capabilities[0].actionLabel).toBe("Save draft");
  });
});

describe("R57: disabled controls are off the tool surface", () => {
  it("omits disabled fields and buttons and disabled-fieldset descendants outside the legend", async () => {
    const html = `<form id="f" method="post" action="/x"><input name="a" aria-label="A"><input name="locked" disabled aria-label="Locked"><fieldset disabled><legend>Extras <input name="inLegend" aria-label="In legend"></legend><input name="inner" aria-label="Inner"></fieldset><button>Save</button><button type="submit" disabled formaction="/later">Save later</button><button type="button" disabled>Review</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => [c.actionLabel, c.fields.map((f) => f.name)])).toEqual([["Save", ["a", "inLegend"]]]);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => [t.name, Object.keys(t.inputSchema.properties)])).toEqual([["save", ["a", "inLegend"]]]);
  });

  it("ignores a disabled password when classifying and counting", async () => {
    const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><input type="password" name="pw" disabled><button>Save</button></form>`);
    expect(scan.capabilities.map((c) => c.riskClass)).toEqual(["write"]);
    expect(scan.safety.credentialFieldsExcluded).toBe(0);
  });

  it("proposes nothing for a form whose only submit is disabled", async () => {
    const scan = await scanOwner(`<form method="post" action="/x"><input name="a" aria-label="A"><input name="b" aria-label="B"><button disabled>Save</button></form>`);
    expect(scan.capabilities).toEqual([]);
  });
});

describe("R58: a button-derived search does not repeat its own label", () => {
  it("drops the suffix when the noun already is the button label", async () => {
    const html = `<form id="e" method="post" action="/save"><input name="q" type="search" aria-label="Query"><button>Save</button><button type="submit" formmethod="get" formaction="/export">Export</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    const [read] = proposal.tools.filter((t) => t.riskClass === "read");
    expect([read.name, read.title]).toEqual(["search_export", "Search Export"]);
    expect(read.description).toContain(`through its "Export" button`);
  });
});

describe("R96: a multiple select is an array parameter in studio and embed", () => {
  it("withholds the destructive option, requires the array when it is preselected, and selects exactly the chosen options", async () => {
    const html = `<form id="f" method="post" action="/x"><input name="n" aria-label="Name"><select name="mode" multiple aria-label="Mode"><option value="k">Keep</option><option value="a">Archive</option><option value="d" selected>Delete my account</option></select><button>Update record</button></form>`;
    const scan = await scanOwner(html);
    const mode = scan.capabilities[0].fields.find((f) => f.name === "mode")!;
    expect([mode.multiple, mode.options, mode.withheld, mode.required]).toEqual([true, ["k", "a"], ["Delete my account"], true]);
    const proposal = await inferGenericCapabilities(scan);
    const schema = proposal.tools[0].inputSchema.properties.mode as { type: string; items?: { enum?: string[] } };
    expect([schema.type, schema.items?.enum, proposal.tools[0].inputSchema.required]).toEqual(["array", ["k", "a"], ["mode"]]);

    const page = host(html);
    const [tool] = createGenericToolDefinitions({ hostDocument: page, scan, proposal, modelContext: undefined });
    const signal = new AbortController().signal;
    expect(() => tool.execute({ n: "x", mode: ["k", "d"] }, { signal })).toThrow(/mode/);
    tool.execute({ n: "x", mode: ["k", "a"] }, { signal });
    const selected = (doc: Document) => Array.from(doc.querySelector("select")!.options).map((o) => [o.value, o.selected]);
    expect(selected(page)).toEqual([["k", true], ["a", true], ["d", false]]);

    const { registered, dispose } = await embedTools(html);
    try {
      registered.get(proposal.tools[0].name)!.execute({ n: "x", mode: ["a"] }, { signal });
      expect(selected(document)).toEqual([["k", false], ["a", true], ["d", false]]);
    } finally {
      dispose();
    }
  });
});
