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
];

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
      // Both valid cases, the null-prototype object, and the fractional quantity (a number field) pass.
      expect(accepted).toBe(4);
      expect(rejected).toBe(CASES.length - 4);
      expect(stagedEvents).toHaveLength(accepted);
    } finally {
      window.removeEventListener("webmcp-retrofit:staged", onStaged);
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
