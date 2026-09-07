import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { buildGenericExportBundle } from "../src/export/buildGenericExportBundle";
import { scanHtml, type CapabilityObservation } from "../src/discovery/scanHtml";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";
import { createGenericToolDefinitions } from "../src/runtime/genericRuntime";
import { runGenericChecks } from "../src/validation/runGenericChecks";

/**
 * Regressions from the 2026-09-06 QA sweep: selectors must resolve to exactly
 * one element on the page (B1), duplicate ids must not collide (B3), attribute
 * values must be escaped (B6), credential and finalize forms must not leak a
 * search tool (B4), and finalize and credential labels must be recognised in
 * more than English (G1).
 */

function host(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function resolvesOnce(document: Document, selector: string): boolean {
  return document.querySelectorAll(selector).length === 1;
}

async function scanOwner(html: string) {
  return scanHtml(await createOwnerSnapshot(html, { fallbackTitle: "QA page" }));
}

describe("B1: id-less forms in different containers", () => {
  const BLOG = `<title>Blog</title>
<header><form method="get" action="/search"><label for="q">Search this site</label><input id="q" name="q" type="search"><button>Search</button></form></header>
<main><article><h1>Post</h1><p>Body</p>
<form method="post" action="/posts/12/comments">
  <label for="author">Name</label><input id="author" name="author" required>
  <label for="body">Comment</label><textarea id="body" name="body" required></textarea>
  <button type="submit">Post comment</button>
</form></article></main>`;

  it("gives every capability a selector that resolves to exactly one element", async () => {
    const scan = await scanOwner(BLOG);
    const page = host(BLOG);

    expect(scan.capabilities).toHaveLength(2);
    for (const capability of scan.capabilities) {
      expect(resolvesOnce(page, capability.selector), capability.selector).toBe(true);
    }
    const comment = scan.capabilities.find((c) => c.actionLabel === "Post comment")!;
    expect(comment.selector).toBe("body > main > article > form");
    expect(page.querySelector(comment.selector)?.getAttribute("action")).toBe("/posts/12/comments");
  });

  it("stages the comment against its real form, with the form action, and passes the bindings check", async () => {
    const snapshot = await createOwnerSnapshot(BLOG);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const staged: { action: string | null }[] = [];
    const [, post] = createGenericToolDefinitions({
      hostDocument: host(BLOG),
      scan,
      proposal,
      modelContext: undefined,
      onStaged: (change) => staged.push(change),
    });

    post.execute({ author: "Ann", body: "Nice" }, { signal: new AbortController().signal });
    expect(staged).toEqual([expect.objectContaining({ action: "/posts/12/comments" })]);

    const report = await runGenericChecks({ snapshot, scan, proposal });
    expect(report.checks.find((check) => check.id === "bindings")).toMatchObject({ status: "passed" });
    expect(report.passed).toBe(10);
  });
});

describe("B3: duplicated ids", () => {
  const NOTES = `<title>Notes</title>
<section><h2>Personal</h2><form id="note-form" method="post" action="/notes/personal">
  <label for="body">Note</label><textarea id="body" name="body" required></textarea><button>Save</button></form></section>
<section><h2>Team</h2><form id="note-form" method="post" action="/notes/team">
  <label for="body">Note</label><textarea id="body" name="body" required></textarea>
  <label for="tag">Tag</label><input id="tag" name="tag"><button>Save</button></form></section>`;

  it("keeps capability ids and selectors distinct and resolvable", async () => {
    const scan = await scanOwner(NOTES);
    const page = host(NOTES);
    const forms = scan.capabilities.filter((c) => c.kind === "form");

    expect(forms).toHaveLength(2);
    expect(new Set(forms.map((c) => c.id)).size).toBe(2);
    expect(new Set(forms.map((c) => c.selector)).size).toBe(2);
    for (const form of forms) {
      expect(resolvesOnce(page, form.selector), form.selector).toBe(true);
      const element = page.querySelector(form.selector)!;
      for (const field of form.fields) {
        const controls = [...page.querySelectorAll(field.selector)];
        expect(controls.length, field.selector).toBeGreaterThan(0);
        expect(controls.every((control) => element.contains(control)), field.selector).toBe(true);
      }
    }
  });

  it("binds the second tool to the second form so its own property is accepted", async () => {
    const snapshot = await createOwnerSnapshot(NOTES);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const staged: { action: string | null; fields: Record<string, unknown> }[] = [];
    const tools = createGenericToolDefinitions({
      hostDocument: host(NOTES),
      scan,
      proposal,
      modelContext: undefined,
      onStaged: (change) => staged.push(change),
    });
    const team = tools.find((tool) => (tool.inputSchema as { properties: object }).properties.hasOwnProperty("tag"))!;

    team.execute({ body: "team note", tag: "urgent" }, { signal: new AbortController().signal });
    expect(staged).toEqual([expect.objectContaining({ action: "/notes/team", fields: { body: "team note", tag: "urgent" } })]);
    const report = await runGenericChecks({ snapshot, scan, proposal });
    expect(report.passed).toBe(10);
  });
});

describe("G10: bindings check", () => {
  it("fails when the page no longer contains the bound form", async () => {
    const html = `<title>Drift</title><main><form method="post" action="/a"><label for="x">X</label><input id="x" name="x"><button>Save</button></form></main>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const drifted = { ...snapshot, html: `<title>Drift</title><main><p>form removed</p></main>` };

    const report = await runGenericChecks({ snapshot: drifted, scan, proposal });
    const bindings = report.checks.find((check) => check.id === "bindings")!;
    expect(bindings.status).toBe("failed");
    expect(bindings.detail).toMatch(/matches 0 element\(s\)/);
  });
});

describe("B6: attribute values are escaped", () => {
  it("produces a valid selector for a name containing a quote", async () => {
    const html = `<title>Odd</title><form id="odd" method="post"><label for="a">A</label><input name='a"b' id="x y"><button>Save</button></form>`;
    const scan = await scanOwner(html);
    const [form] = scan.capabilities;
    const field = form.fields[0];

    expect(field.selector).toBe('#odd [name="a\\"b"]');
    expect(() => host(html).querySelectorAll(field.selector)).not.toThrow();
    expect(host(html).querySelectorAll(field.selector)).toHaveLength(1);
  });
});

describe("B4: no search tool from a credential or finalize form", () => {
  it("yields no capabilities beyond the excluded primary", async () => {
    const login = await scanOwner(
      `<form id="portal" method="post" action="/session"><input name="pq" type="search" aria-label="Find a member"><input name="user"><input name="pass" type="password"><button>Continue</button></form>`,
    );
    const checkout = await scanOwner(
      `<form id="pay" method="post" action="/checkout/place"><input name="find" type="search" aria-label="Find a saved address"><input name="card" autocomplete="cc-number"><button>Place order</button></form>`,
    );

    expect(login.capabilities.map((c) => [c.kind, c.riskClass])).toEqual([["form", "credential"]]);
    expect(checkout.capabilities.map((c) => [c.kind, c.riskClass])).toEqual([["form", "finalize"]]);
    expect((await inferGenericCapabilities(login)).tools).toEqual([]);
    expect((await inferGenericCapabilities(checkout)).tools).toEqual([]);
  });
});

describe("G1: multilingual finalize and credential vocabulary", () => {
  const labelled = (label: string, extra = "") =>
    `<form method="post" action="/x">${extra}<label for="f">Feld</label><input id="f" name="f"><button>${label}</button></form>`;

  async function classify(label: string, extra = ""): Promise<CapabilityObservation["riskClass"]> {
    const scan = await scanOwner(labelled(label, extra));
    return scan.capabilities[0].riskClass;
  }

  it.each([
    ["Konto löschen", "finalize"],
    ["Jetzt kostenpflichtig bestellen", "finalize"],
    ["Supprimer le compte", "finalize"],
    ["Confirmar compra", "finalize"],
    ["Elimina", "finalize"],
    ["Verwijderen", "finalize"],
    ["削除する", "finalize"],
    ["Anmelden", "credential"],
    ["Se connecter", "credential"],
    ["Iniciar sesión", "credential"],
    ["ログイン", "credential"],
    ["Nachricht senden", "write"],
    ["Envoyer", "write"],
  ] as const)("classifies %s as %s", async (label, expected) => {
    expect(await classify(label)).toBe(expected);
  });

  it("treats non-English search and navigation labels on GET forms as read", async () => {
    const suchen = await scanOwner(`<form method="get"><label for="q">Begriff</label><input id="q" name="q"><button>Suchen</button></form>`);
    const weiter = await scanOwner(`<form method="get"><label for="p">Seite</label><input id="p" name="p"><button>Weiter</button></form>`);
    expect(suchen.capabilities[0]).toMatchObject({ kind: "search", riskClass: "read" });
    expect(weiter.capabilities[0]).toMatchObject({ kind: "search", riskClass: "read" });
  });
});

describe("N7: nameless controls with duplicate or malformed ids", () => {
  const PAGE = `<title>Nameless</title>
<form id="f1" method="post" action="/a"><input id="q" aria-label="Q"><button>Save</button></form>
<form id="f2" method="post" action="/b"><input id="q" aria-label="Q"><input id="1q" aria-label="Leading digit"><input id="user.email" aria-label="Dotted"><input id="form1:q" aria-label="Colon"><button>Save</button></form>
<form id="f3" method="post" action="/c"><input id="dup" aria-label="First"><input id="dup" aria-label="Second"><button>Save</button></form>`;

  it("gives every field a selector that resolves to exactly one control inside its own form", async () => {
    const scan = await scanOwner(PAGE);
    const page = host(PAGE);

    for (const form of scan.capabilities) {
      const element = page.querySelector(form.selector)!;
      expect(element, form.selector).not.toBeNull();
      for (const field of form.fields) {
        const controls = [...page.querySelectorAll(field.selector)];
        expect(controls, `${form.selector} ${field.name} ${field.selector}`).toHaveLength(1);
        expect(element.contains(controls[0])).toBe(true);
      }
    }
    const third = scan.capabilities.find((c) => c.selector === "#f3")!;
    expect(third.fields.map((f) => f.name)).toEqual(["dup", "dup_2"]);
    expect(new Set(third.fields.map((f) => f.id)).size).toBe(2);
  });

  it("stages against the right form and passes all ten checks", async () => {
    const snapshot = await createOwnerSnapshot(PAGE);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const staged: { action: string | null; fields: Record<string, unknown> }[] = [];
    const tools = createGenericToolDefinitions({
      hostDocument: host(PAGE),
      scan,
      proposal,
      modelContext: undefined,
      onStaged: (change) => staged.push(change),
    });
    const second = tools.find((tool) => "user.email" in (tool.inputSchema as { properties: object }).properties)!;
    second.execute({ q: "x", "user.email": "a@b.co" }, { signal: new AbortController().signal });
    expect(staged).toEqual([expect.objectContaining({ action: "/b", fields: { q: "x", "user.email": "a@b.co" } })]);

    const report = await runGenericChecks({ snapshot, scan, proposal });
    expect(report.checks.filter((check) => check.status === "failed")).toEqual([]);
    expect(report.passed).toBe(10);
  });
});

describe("N8: namespaced ancestor tags", () => {
  it("escapes the tag in the structural path so the form resolves", async () => {
    const html = `<title>Word</title><div><o:p><form method="post" action="/w"><input name="x" aria-label="X"><button>Save</button></form></o:p></div>`;
    const scan = await scanOwner(html);
    const [form] = scan.capabilities;

    expect(form.selector).toBe(String.raw`body > div > o\:p > form`);
    expect(resolvesOnce(host(html), form.selector)).toBe(true);
    const snapshot = await createOwnerSnapshot(html);
    const report = await runGenericChecks({ snapshot, scan, proposal: await inferGenericCapabilities(scan) });
    expect(report.passed).toBe(10);
  });
});

describe("N8b: a write or search tool refuses when its form is missing", () => {
  it("throws a clear error instead of staging with a null action", async () => {
    const html = `<title>Drift</title><main><form method="post" action="/a"><label for="x">X</label><input id="x" name="x"><button>Save</button></form></main>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const drifted = host(`<title>Drift</title><main><p>form removed</p></main>`);
    const staged: unknown[] = [];
    const [save] = createGenericToolDefinitions({ hostDocument: drifted, scan, proposal, modelContext: undefined, onStaged: (c) => staged.push(c) });

    expect(() => save.execute({}, { signal: new AbortController().signal })).toThrow(/The form for "save" is missing from the page/);
    expect(staged).toEqual([]);
  });
});

describe("B8: header rows without a thead", () => {
  it("models a tr>th header row and never counts it as data", async () => {
    const html = `<title>T</title><h2>Back orders</h2><table id="t2"><tr><th>Order</th><th>Total</th></tr><tr><td>A-1</td><td>10</td></tr><tr><td>A-2</td><td>20</td></tr></table>
<table id="t3"><tr><td>no header</td></tr></table>`;
    const scan = await scanOwner(html);
    const [table] = scan.capabilities;

    expect(scan.capabilities.map((c) => c.selector)).toEqual(["#t2"]);
    expect(table.table).toEqual({ headers: ["Order", "Total"], rowCount: 2, pagination: { previous: false, next: false } });
    const proposal = await inferGenericCapabilities(scan);
    const [read] = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined });
    expect((read.execute({}, { signal: new AbortController().signal }) as { rows: string[][] }).rows).toEqual([
      ["A-1", "10"],
      ["A-2", "20"],
    ]);
  });
});

describe("B5: pagination scoped to the table's neighbourhood", () => {
  it("reports prev/next per table from rel or wording, never from an unrelated first link", async () => {
    const html = `<title>P</title>
<section><h2>Recent</h2><table id="a"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<nav aria-label="Pagination"><a href="/help">Help</a><a href="?p=2" rel="next">Next page</a></nav></section>
<section><h2>Older</h2><table id="b"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<div class="pager"><a href="?p=1">Zurück</a><a href="/about">About us</a></div></section>
<section><h2>Alone</h2><table id="c"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<nav aria-label="pagination"><a href="/top">Back to top</a></nav></section>`;
    const scan = await scanOwner(html);
    const flags = Object.fromEntries(scan.capabilities.map((c) => [c.selector, c.table?.pagination]));

    expect(flags["#a"]).toEqual({ previous: false, next: true });
    expect(flags["#b"]).toEqual({ previous: true, next: false });
    expect(flags["#c"]).toEqual({ previous: true, next: false });
  });

  it("does not let one table's controls leak onto a sibling table", async () => {
    const html = `<title>P2</title><div><table id="first"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<a href="?p=2" rel="next">Next</a><table id="second"><thead><tr><th>Y</th></tr></thead><tbody><tr><td>2</td></tr></tbody></table></div>`;
    const scan = await scanOwner(html);
    const flags = Object.fromEntries(scan.capabilities.map((c) => [c.selector, c.table?.pagination]));
    expect(flags["#first"]).toEqual({ previous: false, next: true });
    expect(flags["#second"]).toEqual({ previous: false, next: false });
  });
});

describe("G2: same-name checkbox groups", () => {
  const html = `<title>Prefs</title><form id="prefs" method="post" action="/prefs">
<fieldset><legend>Interests</legend>
<label><input type="checkbox" name="interests" value="tools"> Tools</label>
<label><input type="checkbox" name="interests" value="parts"> Parts</label>
<label><input type="checkbox" name="interests" value="safety"> Safety</label></fieldset>
<label><input type="checkbox" name="newsletter"> Newsletter</label>
<button>Save preferences</button></form>`;

  it("collapses the group into one array-of-enum property and keeps a lone checkbox boolean", async () => {
    const scan = await scanOwner(html);
    const [form] = scan.capabilities;
    const interests = form.fields.find((f) => f.name === "interests")!;

    expect(form.fields.map((f) => f.name)).toEqual(["interests", "newsletter"]);
    expect(interests).toMatchObject({
      kind: "enum",
      multiple: true,
      options: ["tools", "parts", "safety"],
      selector: `#prefs [name="interests"]`,
    });
    expect(form.fields.find((f) => f.name === "newsletter")).toMatchObject({ kind: "boolean" });
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools[0].inputSchema.properties.interests).toEqual({
      type: "array",
      description: expect.any(String),
      items: { type: "string", enum: ["tools", "parts", "safety"] },
      uniqueItems: true,
    });
    expect(proposal.tools[0].inputSchema.properties.newsletter).toMatchObject({ type: "boolean" });
  });

  it("checks exactly the chosen boxes and rejects bad arrays", async () => {
    const scan = await scanOwner(html);
    const proposal = await inferGenericCapabilities(scan);
    const page = host(html);
    const [save] = createGenericToolDefinitions({ hostDocument: page, scan, proposal, modelContext: undefined });
    const signal = () => new AbortController().signal;

    save.execute({ interests: ["parts", "safety"], newsletter: true }, { signal: signal() });
    const boxes = [...page.querySelectorAll(`[name="interests"]`)] as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true, true]);
    expect((page.querySelector(`[name="newsletter"]`) as HTMLInputElement).checked).toBe(true);
    expect(() => save.execute({ interests: "parts" }, { signal: signal() })).toThrow(/interests must be an array/);
    expect(() => save.execute({ interests: ["gold"] }, { signal: signal() })).toThrow(/items must be one of/);
    expect(() => save.execute({ interests: ["parts", "parts"] }, { signal: signal() })).toThrow(/must not repeat/);
    const snapshot = await createOwnerSnapshot(html);
    expect((await runGenericChecks({ snapshot, scan, proposal })).passed).toBe(10);
  });
});

describe("G3: per-row forms carry a visible row label", () => {
  it("names each per-row tool after its row and never reads hidden values", async () => {
    const html = `<title>Users</title><h2>Users</h2><table id="users"><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>
<tr><td>Alice</td><td>admin</td><td><form method="post" action="/users/17/edit"><input type="hidden" name="id" value="17"><select name="role"><option value="admin">admin</option><option value="viewer">viewer</option></select><button>Edit</button></form></td></tr>
<tr><td>Bob</td><td>viewer</td><td><form method="post" action="/users/18/edit"><input type="hidden" name="id" value="18"><select name="role"><option value="admin">admin</option><option value="viewer">viewer</option></select><button>Edit</button></form></td></tr>
</tbody></table>`;
    const scan = await scanOwner(html);
    const forms = scan.capabilities.filter((c) => c.kind === "form");
    expect(forms.map((c) => c.rowLabel)).toEqual(["Alice", "Bob"]);

    const proposal = await inferGenericCapabilities(scan);
    const names = proposal.tools.filter((t) => t.riskClass === "write").map((t) => [t.name, t.title]);
    expect(names).toEqual([
      ["edit_alice", "Edit: Alice"],
      ["edit_bob", "Edit: Bob"],
    ]);
    expect(JSON.stringify(proposal)).not.toContain(`"17"`);
    expect(scan.safety.hiddenFieldsExcluded).toBe(2);
  });

  it("uses the heading of a repeated container when there is no table row", async () => {
    const html = `<title>Cards</title><ul><li><h3>Widget A</h3><form method="post" action="/w/a"><input name="qty" aria-label="Qty"><button>Update</button></form></li>
<li><h3>Widget B</h3><form method="post" action="/w/b"><input name="qty" aria-label="Qty"><button>Update</button></form></li></ul>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => c.rowLabel)).toEqual(["Widget A", "Widget B"]);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => t.name)).toEqual(["update_widget_a", "update_widget_b"]);
  });
});

describe("G4: wizard navigation and multiple submit buttons", () => {
  it("skips navigation buttons and classifies every submit button on its own label", async () => {
    const html = `<title>Wizard</title><form id="apply" method="post" action="/apply">
<fieldset><legend>Step 1</legend><input name="a" aria-label="A"><button type="button">Next</button></fieldset>
<fieldset><legend>Step 2</legend><input name="b" aria-label="B"><button type="button">Back</button><button type="button">Weiter</button></fieldset>
<button type="submit">Save draft</button><button type="submit">Delete application</button><button type="button">Review answers</button></form>`;
    const scan = await scanOwner(html);

    expect(scan.capabilities.map((c) => [c.actionLabel, c.riskClass])).toEqual([
      ["Save draft", "write"],
      ["Review answers", "write"],
      ["Delete application", "finalize"],
    ]);
    expect(scan.safety.navigationButtonsSkipped).toBe(3);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => t.name)).toEqual(["save_draft", "review_answers"]);
    expect(proposal.excluded.map((e) => e.actionLabel)).toEqual(["Delete application"]);
    const snapshot = await createOwnerSnapshot(html);
    expect((await runGenericChecks({ snapshot, scan, proposal })).passed).toBe(10);
  });
});

describe("B7: labels with no Latin letters get deterministic names", () => {
  it("names Japanese and Chinese forms from a hashed stem and keeps the label in the title", async () => {
    const html = `<title>注文</title><h1>注文</h1>
<form id="ja" method="post" action="/ja"><label for="n">お名前</label><input id="n" name="name"><button>送信</button></form>
<form id="zh" method="get" action="/zh"><input name="q" type="search" aria-label="搜索商品"><button>搜索</button></form>`;
    const scan = await scanOwner(html);
    const proposal = await inferGenericCapabilities(scan);
    const names = proposal.tools.map((tool) => tool.name);

    expect(names[0]).toMatch(/^write_[0-9a-f]{6}$/);
    expect(names[1]).toMatch(/^search_[0-9a-f]{6}$/);
    expect(new Set(names).size).toBe(2);
    expect(proposal.tools[0].title).toBe("送信");
    const again = await inferGenericCapabilities(scan);
    expect(again.tools.map((tool) => tool.name)).toEqual(names);
  });
});

describe("G5: file exclusions appear in the safety envelope and the evidence", () => {
  it("counts the excluded file field", async () => {
    const html = `<title>Upload</title><form id="up" method="post" action="/docs"><label for="d">Document</label><input id="d" name="doc" type="file" required><label for="t">Title</label><input id="t" name="title"><button>Upload</button></form>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);

    expect(scan.safety.fileFieldsExcluded).toBe(1);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const evidence = JSON.parse(bundle.files[2].content) as { safety: { fileFieldsExcluded: number } };
    expect(evidence.safety.fileFieldsExcluded).toBe(1);
  });
});

describe("N9: a single wide cell no longer blocks export", () => {
  it("clips cells to the budget, shrinks a lone wide row, and passes output-budget", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => `<tr><td>${"x".repeat(3000)}${i}</td><td>ok</td></tr>`).join("");
    const html = `<title>Wide</title><h2>Wide cells</h2><table id="wide"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const [read] = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined });

    const result = read.execute({}, { signal: new AbortController().signal }) as { rows: string[][]; truncated: boolean };
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500);
    expect(result.truncated).toBe(true);
    expect(result.rows[0][0].endsWith("…")).toBe(true);
    expect(result.rows[0][0].length).toBeLessThanOrEqual(200);
    expect(result.rows[0][1]).toBe("ok");

    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.checks.find((check) => check.id === "output-budget")).toMatchObject({ status: "passed" });
    expect(validation.passed).toBe(10);
    await expect(buildGenericExportBundle({ snapshot, scan, proposal, validation })).resolves.toBeTruthy();
  });

  it("shrinks cells further when a single row of many wide columns still exceeds the budget", async () => {
    const cells = Array.from({ length: 12 }, (_, i) => `<td>${"c".repeat(400)}${i}</td>`).join("");
    const html = `<title>Many</title><h2>Many columns</h2><table id="many"><thead><tr>${"<th>H</th>".repeat(12)}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
    const scan = await scanOwner(html);
    const proposal = await inferGenericCapabilities(scan);
    const [read] = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined });
    const result = read.execute({}, { signal: new AbortController().signal }) as { rows: string[][]; truncated: boolean };

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500);
    expect(result.rows).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});

describe("N10: ambiguous verbs with a neutral object are not exclusions", () => {
  const form = (method: string, label: string) =>
    `<form method="${method}" action="/x"><label for="f">Field</label><input id="f" name="f"><button>${label}</button></form>`;

  it.each([
    ["get", "Remove filter", "search", "read"],
    ["get", "Clear filters", "search", "read"],
    ["get", "Acceder al catálogo", "search", "read"],
    ["post", "Entrar em contato", "form", "write"],
    ["get", "Annuler la recherche", "search", "read"],
    ["post", "Remove account", "form", "finalize"],
    ["post", "Remove", "form", "finalize"],
    ["post", "Acceder", "form", "credential"],
    ["post", "Entrar", "form", "credential"],
    ["post", "Iniciar sesión", "form", "credential"],
    ["post", "Konto löschen", "form", "finalize"],
  ] as const)("%s form labelled %s is %s/%s", async (method, label, kind, riskClass) => {
    const scan = await scanOwner(form(method, label));
    expect(scan.capabilities[0]).toMatchObject({ kind, riskClass });
  });
});
