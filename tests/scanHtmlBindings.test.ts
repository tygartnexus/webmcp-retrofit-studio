import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
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
