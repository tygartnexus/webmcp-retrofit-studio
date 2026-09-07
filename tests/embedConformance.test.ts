import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import { buildGenericExportBundle } from "../src/export/buildGenericExportBundle";
import { createOwnerSnapshot } from "../src/fixtures/ownerSnapshot";
import { createGenericToolDefinitions } from "../src/runtime/genericRuntime";
import { runGenericChecks } from "../src/validation/runGenericChecks";

/**
 * The exported embed carries its own validator in a string. This suite runs
 * one table of inputs through the studio runtime and through the embed, and
 * fails on any difference in outcome or error message.
 */

const PAGE = `<!doctype html><title>Order desk</title><h1>Order desk</h1>
<form id="order" method="post" action="/order">
  <label for="qty">Quantity</label><input id="qty" name="qty" type="number" min="1" max="10" required>
  <label for="ref">Reference</label><input id="ref" name="ref" pattern="[A-Z]{3}-[0-9]{3}" maxlength="7" required>
  <label for="site">Site</label><input id="site" name="site" type="url">
  <label for="when">Needed by</label><input id="when" name="when" type="date">
  <label for="mail">Email</label><input id="mail" name="mail" type="email">
  <label><input name="rush" type="checkbox"> Rush</label>
  <fieldset><legend>Carrier</legend>
    <label><input name="carrier" type="radio" value="ground"> Ground</label>
    <label><input name="carrier" type="radio" value="air"> Air</label>
  </fieldset>
  <fieldset><legend>Extras</legend>
    <label><input name="extras" type="checkbox" value="gift"> Gift wrap</label>
    <label><input name="extras" type="checkbox" value="insure"> Insurance</label>
  </fieldset>
  <button type="submit">Save request</button>
</form>`;

interface Outcome {
  ok: boolean;
  status?: unknown;
  error?: string;
}

async function outcomes(execute: (input: unknown) => unknown): Promise<Outcome> {
  try {
    const result = (await execute(undefined)) as { status?: unknown } | undefined;
    return { ok: true, status: result?.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

const VALID = { qty: 2, ref: "ABC-123" };
const accessor = { ...VALID } as Record<string, unknown>;
Object.defineProperty(accessor, "site", { get: () => "https://x.test/", enumerable: true });

const CASES: readonly { label: string; input: unknown }[] = [
  { label: "valid minimal", input: VALID },
  { label: "valid full", input: { ...VALID, site: "https://x.test/", when: "2026-02-03", mail: "a@b.co", rush: true, carrier: "air" } },
  { label: "string input", input: "x" },
  { label: "array input", input: [] },
  { label: "null input", input: null },
  { label: "foreign prototype", input: new Map() },
  { label: "null prototype", input: Object.assign(Object.create(null), VALID) },
  { label: "undeclared key", input: { ...VALID, extra: 1 } },
  { label: "symbol key", input: { ...VALID, [Symbol("s")]: 1 } },
  { label: "accessor property", input: accessor },
  { label: "missing required", input: { qty: 2 } },
  { label: "qty string", input: { ...VALID, qty: "2" } },
  { label: "qty NaN", input: { ...VALID, qty: Number.NaN } },
  { label: "qty below min", input: { ...VALID, qty: 0 } },
  { label: "qty above max", input: { ...VALID, qty: 11 } },
  { label: "qty fractional", input: { ...VALID, qty: 1.5 } },
  { label: "ref wrong pattern", input: { ...VALID, ref: "abc-123" } },
  { label: "ref too long", input: { ...VALID, ref: "ABCD-1234" } },
  { label: "site not url", input: { ...VALID, site: "not a url" } },
  { label: "when wrong pattern", input: { ...VALID, when: "03/02/2026" } },
  { label: "mail invalid", input: { ...VALID, mail: "nope" } },
  { label: "rush string", input: { ...VALID, rush: "yes" } },
  { label: "carrier outside enum", input: { ...VALID, carrier: "sea" } },
  { label: "extras valid array", input: { ...VALID, extras: ["gift", "insure"] } },
  { label: "extras empty array", input: { ...VALID, extras: [] } },
  { label: "extras not an array", input: { ...VALID, extras: "gift" } },
  { label: "extras item outside enum", input: { ...VALID, extras: ["gold"] } },
  { label: "extras duplicate items", input: { ...VALID, extras: ["gift", "gift"] } },
  { label: "extras non-string item", input: { ...VALID, extras: [1] } },
];

describe("embed table conformance", () => {
  it("returns the same rows, truncation, and size as the studio runtime for a large table", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `<tr><td>${"x".repeat(23)}${i}</td><td>${"y".repeat(23)}</td></tr>`).join("");
    const snapshot = await createOwnerSnapshot(
      `<title>Stock</title><h1>Stock</h1><table id="stock"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;

    const [studioTool] = createGenericToolDefinitions({
      hostDocument: new DOMParser().parseFromString(snapshot.html, "text/html"),
      scan,
      proposal,
      modelContext: undefined,
    });
    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    try {
      document.body.innerHTML = new DOMParser().parseFromString(snapshot.html, "text/html").body.innerHTML;
      new Function(embed)();
      const embedTool = registered.get(studioTool.name)!;
      const input = { limit: 100 };
      const studio = studioTool.execute(input, { signal: new AbortController().signal }) as { rows: unknown[]; truncated: boolean };
      const shipped = embedTool.execute(input, { signal: new AbortController().signal }) as { rows: unknown[]; truncated: boolean };

      expect(shipped.rows.length).toBe(studio.rows.length);
      expect(shipped.truncated).toBe(studio.truncated);
      expect(JSON.stringify(shipped).length).toBe(JSON.stringify(studio).length);
      expect(JSON.stringify(studio).length).toBeLessThanOrEqual(1500);
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});

describe("embed wide-cell conformance", () => {
  it("clips cells identically in the studio runtime and the embed", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => `<tr><td>${"w".repeat(3000)}${i}</td><td>${"v".repeat(900)}</td></tr>`).join("");
    const snapshot = await createOwnerSnapshot(
      `<title>Wide</title><h1>Wide</h1><table id="wide"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    expect(validation.passed).toBe(10);
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;

    const [studioTool] = createGenericToolDefinitions({
      hostDocument: new DOMParser().parseFromString(snapshot.html, "text/html"),
      scan,
      proposal,
      modelContext: undefined,
    });
    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    try {
      document.body.innerHTML = new DOMParser().parseFromString(snapshot.html, "text/html").body.innerHTML;
      new Function(embed)();
      const embedTool = registered.get(studioTool.name)!;
      for (const input of [{}, { limit: 1 }, { limit: 100 }]) {
        const studio = studioTool.execute(input, { signal: new AbortController().signal });
        const shipped = embedTool.execute(input, { signal: new AbortController().signal });
        expect(JSON.stringify(shipped)).toBe(JSON.stringify(studio));
        expect(JSON.stringify(studio).length).toBeLessThanOrEqual(1500);
      }
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});

describe("embed missing-anchor conformance", () => {
  it("throws the same error as the studio runtime when the bound form is gone", async () => {
    const snapshot = await createOwnerSnapshot(
      `<title>Drift</title><main><form id="note" method="post" action="/a"><label for="x">X</label><input id="x" name="x"><button>Save</button></form></main>`,
    );
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;

    const [studioTool] = createGenericToolDefinitions({
      hostDocument: new DOMParser().parseFromString("<main><p>gone</p></main>", "text/html"),
      scan,
      proposal,
      modelContext: undefined,
    });
    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    try {
      document.body.innerHTML = "<main><p>gone</p></main>";
      new Function(embed)();
      const embedTool = registered.get(studioTool.name)!;
      const studio = await outcomes(() => studioTool.execute({}, { signal: new AbortController().signal }));
      const shipped = await outcomes(() => embedTool.execute({}, { signal: new AbortController().signal }));
      expect(shipped).toEqual(studio);
      expect(studio.error).toBe('Error: The form for "save" is missing from the page');
    } finally {
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});

describe("embed validator conformance", () => {
  it("agrees with the studio runtime on every case, outcome and message", async () => {
    const snapshot = await createOwnerSnapshot(PAGE);
    const scan = await scanHtml(snapshot);
    const proposal = await inferGenericCapabilities(scan);
    expect(proposal.tools.map((tool) => tool.name)).toEqual(["save_request"]);
    const validation = await runGenericChecks({ snapshot, scan, proposal });
    const bundle = await buildGenericExportBundle({ snapshot, scan, proposal, validation });
    const embed = bundle.files.find((file) => file.path === "webmcp-retrofit.generated.js")!.content;

    const studioHost = new DOMParser().parseFromString(snapshot.html, "text/html");
    const [studioTool] = createGenericToolDefinitions({
      hostDocument: studioHost,
      scan,
      proposal,
      modelContext: undefined,
      nextId: () => "s",
    });

    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    const stagedEvents: Event[] = [];
    const onStaged = (event: Event) => stagedEvents.push(event);
    window.addEventListener("webmcp-retrofit:staged", onStaged);
    try {
      document.body.innerHTML = new DOMParser().parseFromString(snapshot.html, "text/html").body.innerHTML;
      new Function(embed)();
      const embedTool = registered.get("save_request")!;

      const signal = () => new AbortController().signal;
      let accepted = 0;
      let rejected = 0;
      for (const testCase of CASES) {
        const studio = await outcomes(() => studioTool.execute(testCase.input as Record<string, unknown>, { signal: signal() }));
        const shipped = await outcomes(() => embedTool.execute(testCase.input as Record<string, unknown>, { signal: signal() }));
        expect({ label: testCase.label, ...shipped }).toEqual({ label: testCase.label, ...studio });
        if (studio.ok) accepted += 1;
        else rejected += 1;
      }
      // Both valid cases, the null-prototype object, the fractional quantity (a number field), and the two valid arrays pass.
      expect(accepted).toBe(6);
      expect(rejected).toBe(CASES.length - 6);
      expect(stagedEvents).toHaveLength(accepted);
    } finally {
      window.removeEventListener("webmcp-retrofit:staged", onStaged);
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
