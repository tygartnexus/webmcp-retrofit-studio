import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { buildGenericExportBundle } from "../src/export/buildGenericExportBundle";
import { scanHtml, type CapabilityObservation } from "../src/discovery/scanHtml";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";
import { createGenericToolDefinitions } from "../src/runtime/genericRuntime";
import { sampleToolInput } from "../src/runtime/sampleInput";
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
    expect(flags["#c"]).toEqual({ previous: false, next: false });
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
      selector: `#prefs input[type="checkbox"][name="interests"]`,
    });
    expect(form.fields.find((f) => f.name === "newsletter")).toMatchObject({ kind: "boolean" });
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools[0].inputSchema.properties.interests).toEqual({
      type: "array",
      description: "Interests",
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

describe("R1: a neutral phrase must be the whole label", () => {
  it.each([
    ["post", "Remove filter and delete account", "finalize"],
    ["post", "Cancel search subscription", "finalize"],
    ["post", "Acceder al catálogo y eliminar cuenta", "credential"],
    ["get", "Remove filter", "read"],
    ["get", "Clear the selection", "read"],
  ] as const)("%s form labelled %s is %s", async (method, label, riskClass) => {
    const scan = await scanOwner(
      `<form method="${method}" action="/x"><label for="f">Field</label><input id="f" name="f"><button>${label}</button></form>`,
    );
    expect(scan.capabilities[0].riskClass).toBe(riskClass);
  });
});

describe("R2: navigation words must be the whole button label", () => {
  it("keeps 'Next of kin' and 'Back office report' as actions and skips 'Continue' and 'Go back'", async () => {
    const html = `<title>Nav</title><form id="w" method="post" action="/w"><input name="a" aria-label="A">
<button type="button">Next of kin</button><button type="button">Back office report</button>
<button type="button">Continue</button><button type="button">Go back</button><button type="button">Next step</button><button type="button">Page 2</button>
<button type="submit">Save</button></form>`;
    const scan = await scanOwner(html);

    expect(scan.capabilities.map((c) => c.actionLabel)).toEqual(["Save", "Next of kin", "Back office report"]);
    expect(scan.safety.navigationButtonsSkipped).toBe(4);
  });
});

describe("R3: a submit button's formaction wins over the form action", () => {
  it("stages each submit to its own target in the studio runtime and the embed", async () => {
    const html = `<title>Orders</title><form id="o" method="post" action="/orders/save"><label for="n">Note</label><input id="n" name="note">
<button type="submit">Save draft</button><button type="submit" formaction="/orders/archive">Archive</button></form>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const staged: { toolName: string; action: string | null }[] = [];
    const tools = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined, onStaged: (c) => staged.push(c) });
    for (const tool of tools) tool.execute({ note: "x" }, { signal: new AbortController().signal });

    expect(staged.map((c) => [c.toolName, c.action])).toEqual([
      ["save_draft", "/orders/save"],
      ["archive", "/orders/archive"],
    ]);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;
    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    const events: { toolName: string; action: string | null; actionLabel: string }[] = [];
    const onStaged = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener("webmcp-retrofit:staged", onStaged);
    try {
      document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
      new Function(embed)();
      registered.get("archive")!.execute({ note: "x" }, { signal: new AbortController().signal });
      expect(events).toEqual([expect.objectContaining({ toolName: "archive", action: "/orders/archive", actionLabel: "Archive" })]);
    } finally {
      window.removeEventListener("webmcp-retrofit:staged", onStaged);
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});

describe("R4: checkbox groups are labelled by the fieldset legend", () => {
  it("describes the group as the legend, not the first option", async () => {
    const html = `<title>Prefs</title><form id="p" method="post" action="/p"><fieldset><legend>Interests</legend>
<label><input type="checkbox" name="interests" value="tools"> Tools</label><label><input type="checkbox" name="interests" value="parts"> Parts</label></fieldset>
<label><input type="checkbox" name="rush"> Rush delivery</label><button>Save</button></form>`;
    const scan = await scanOwner(html);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools[0].inputSchema.properties.interests.description).toBe("Interests");
    expect(proposal.tools[0].inputSchema.properties.rush.description).toBe("Rush delivery");
  });

  it("models a value-less checkbox in a group as 'on'", async () => {
    const html = `<form id="g" method="post"><label><input type="checkbox" name="i" value="a"> A</label><label><input type="checkbox" name="i"> B</label><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].fields[0].options).toEqual(["a", "on"]);
  });
});

describe("R5: nameless excluded controls still classify and count", () => {
  it("treats a nameless password as a credential and counts nameless hidden and file inputs", async () => {
    const html = `<title>Nameless</title>
<form id="login" method="post" action="/session"><input name="user" aria-label="User"><input type="password" class="pw"><button>Continue</button></form>
<form id="up" method="post" action="/up"><input type="hidden" value="tok"><input type="file"><input name="title" aria-label="Title"><button>Upload</button></form>`;
    const scan = await scanOwner(html);
    const [login, upload] = scan.capabilities;

    expect(login.riskClass).toBe("credential");
    expect(scan.safety.credentialFieldsExcluded).toBe(1);
    expect(scan.safety.hiddenFieldsExcluded).toBe(1);
    expect(scan.safety.fileFieldsExcluded).toBe(1);
    expect(JSON.stringify(scan)).not.toContain("tok");
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((t) => t.name)).toEqual(["upload"]);
    expect(Object.keys(proposal.tools[0].inputSchema.properties)).toEqual(["title"]);
    expect(upload.fields.filter((f) => f.excluded).map((f) => f.name)).toEqual(["unnamed_hidden", "unnamed_file"]);
  });
});

describe("R6: row labels use visible text only and are budgeted", () => {
  it("ignores hidden spans and inline display:none, and truncates long labels", async () => {
    const long = "L".repeat(400);
    const html = `<title>Rows</title><table id="t"><thead><tr><th>Name</th><th></th></tr></thead><tbody>
<tr><td><span hidden>ref-991-secret</span><span style="display:none">also-secret</span>Alice</td><td><form method="post" action="/e/1"><input name="role" aria-label="Role"><button>Edit</button></form></td></tr>
<tr><td>${long}</td><td><form method="post" action="/e/2"><input name="role" aria-label="Role"><button>Edit</button></form></td></tr>
</tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const [first, second] = scan.capabilities.filter((c) => c.kind === "form");

    expect(first.rowLabel).toBe("Alice");
    expect(second.rowLabel!.length).toBeLessThanOrEqual(60);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    for (const file of bundle.files) {
      expect(file.content).not.toContain("ref-991-secret");
      expect(file.content).not.toContain("also-secret");
    }
  });

  it("falls back to the first visible text of a repeated block without a heading", async () => {
    const html = `<ul><li><p>Widget A</p><form method="post" action="/a"><input name="q" aria-label="Q"><button>Update</button></form></li><li><p>Widget B</p><form method="post" action="/b"><input name="q" aria-label="Q"><button>Update</button></form></li></ul>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities.map((c) => c.rowLabel)).toEqual(["Widget A", "Widget B"]);
  });
});

describe("R7: read tools never carry write verbs in their names", () => {
  it("strips finalize wording from a heading-derived name and exports", async () => {
    const html = `<title>Filters</title><h2>Remove filters</h2><form method="get" action="/list"><label for="q">Term</label><input id="q" name="q"><button>Remove filter</button></form>
<h2>Orders to cancel</h2><table id="oc"><thead><tr><th>Id</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);

    expect(proposal.tools.map((t) => t.name)).toEqual(["search_filters", "read_orders_to"]);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    await expect(buildGenericExportBundle({ snapshot, scan, proposal, validation })).resolves.toBeTruthy();
  });

  it("names a search tool after its heading when the label is just 'Search'", async () => {
    const html = `<h1>Blog</h1><form method="get" action="/s"><label>Search <input name="q" type="search"></label><button>Go</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    expect(proposal.tools[0].name).toBe("search_blog");
  });
});

describe("R8: pagination links must be nav wording alone", () => {
  it("ignores 'Back to dashboard' but accepts 'Next page' and rel links", async () => {
    const html = `<main><a href="/dashboard">Back to dashboard</a><table id="t"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><nav><a href="?p=2">Next page</a></nav></main>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].table?.pagination).toEqual({ previous: false, next: true });
  });
});

describe("R9: checks exercise optional checkbox groups and very wide tables fail with a clear reason", () => {
  it("includes an optional array property in the sample input", async () => {
    const html = `<form id="p" method="post"><fieldset><legend>Days</legend><label><input type="checkbox" name="d" value="mon"> Mon</label><label><input type="checkbox" name="d" value="tue"> Tue</label></fieldset><button>Save</button></form>`;
    const proposal = await inferGenericCapabilities(await scanOwner(html));
    expect(sampleToolInput(proposal.tools[0].inputSchema)).toEqual({ d: ["mon"] });
  });

  it("reports a table with too many columns instead of returning over-budget output", async () => {
    const cells = Array.from({ length: 400 }, (_, i) => `<td>c${i}</td>`).join("");
    const html = `<h2>Huge</h2><table id="h"><thead><tr>${"<th>H</th>".repeat(400)}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
    const scan = await scanOwner(html);
    const proposal = await inferGenericCapabilities(scan);
    const [read] = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined });
    expect(() => read.execute({}, { signal: new AbortController().signal })).toThrow(/too many columns/);
  });
});

describe("R10: same-name fields of different types do not share a schema key", () => {
  it("suffixes a text input that collides with a lone checkbox", async () => {
    const html = `<form id="m" method="post"><label><input type="checkbox" name="flag"> Flag</label><label for="t">Text</label><input id="t" name="flag"><button>Save</button></form>`;
    const scan = await scanOwner(html);
    expect(scan.capabilities[0].fields.map((f) => [f.name, f.inputType])).toEqual([
      ["flag", "checkbox"],
      ["flag_2", "text"],
    ]);
  });
});

describe("R11: studio and embed agree on the staged action label for per-row tools", () => {
  it("both report the capability's action label, not the tool title", async () => {
    const html = `<title>Rows</title><table id="t"><thead><tr><th>Name</th><th></th></tr></thead><tbody><tr><td>Alice</td><td><form method="post" action="/e/1"><input name="role" aria-label="Role"><button>Edit</button></form></td></tr></tbody></table>`;
    const snapshot = await createOwnerSnapshot(html);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;
    const edit = createGenericToolDefinitions({ hostDocument: host(html), scan, proposal, modelContext: undefined }).find(
      (tool) => tool.name === "edit_alice",
    )!;
    const studio = edit.execute({ role: "x" }, { signal: new AbortController().signal }) as { staged: { actionLabel: string } };

    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    try {
      document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
      new Function(embed)();
      const shipped = registered.get("edit_alice")!.execute({ role: "x" }, { signal: new AbortController().signal }) as {
        staged: { actionLabel: string };
      };
      expect(shipped.staged.actionLabel).toBe(studio.staged.actionLabel);
      expect(studio.staged.actionLabel).toBe("Edit");
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});

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
    expect(tools).toEqual([
      ["save", ["q", "note"]],
      ["search_orders", ["q"]],
      ["search_results", ["q", "note"]],
    ]);
  });
});
