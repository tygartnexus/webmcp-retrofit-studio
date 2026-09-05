import { CONTACT_FORM_FIXTURE, DATA_TABLE_FIXTURE, type HtmlSnapshot } from "../src/fixtures/genericFixtures";
import { inferGenericCapabilities } from "../src/discovery/inferGenericCapabilities";
import { scanHtml } from "../src/discovery/scanHtml";
import { sha256Hex } from "../src/discovery/scanOwnedFixture";
import {
  buildGenericExportBundle,
  serializeGenericExportBundle,
  type GenericExportInput,
} from "../src/export/buildGenericExportBundle";
import type { PresenceReceipt } from "../src/presence/humanPresence";
import { runGenericChecks } from "../src/validation/runGenericChecks";

async function exportInput(snapshot: HtmlSnapshot): Promise<GenericExportInput> {
  const scan = await scanHtml(snapshot);
  const proposal = await inferGenericCapabilities(scan);
  const validation = await runGenericChecks({ snapshot, scan, proposal }, { now: () => "2026-09-05T00:00:00.000Z" });
  return { snapshot, scan, proposal, validation };
}

const receipt: PresenceReceipt = {
  method: "webauthn-user-presence",
  ceremony: "assertion",
  subject: "staged-1",
  rpId: "localhost",
  userPresent: true,
  userVerified: false,
  credentialIdSha256: "ab".repeat(32),
  verifiedAt: "2026-09-05T00:01:00.000Z",
};

describe("generic export bundle", () => {
  it("builds four hashed files and a deterministic bundle hash", async () => {
    const input = await exportInput(CONTACT_FORM_FIXTURE);
    const staged = [{ id: "staged-1", capabilityId: input.proposal.tools[0].capabilityId }];
    const first = await buildGenericExportBundle({ ...input, staged, humanConfirmations: [receipt] });
    const second = await buildGenericExportBundle({ ...input, staged, humanConfirmations: [receipt] });

    expect(first.files.map((file) => file.path)).toEqual([
      "webmcp-retrofit.manifest.json",
      "webmcp-retrofit.tools.json",
      "webmcp-retrofit.evidence.json",
      "webmcp-retrofit.generated.js",
    ]);
    for (const file of first.files) expect(file.sha256).toBe(await sha256Hex(file.content));
    expect(first.bundleHash).toBe(second.bundleHash);
    expect(first.manifest).toMatchObject({
      kind: "generic-retrofit",
      toolNames: ["send_message"],
      excludedActions: [],
      proposalHash: input.proposal.proposalHash,
      validation: { passed: 9, total: 9 },
    });
    expect(first.manifest.artifacts.generatedJavaScriptSha256).toBe(first.files[3].sha256);
    expect(Object.isFrozen(first)).toBe(true);
    const evidence = JSON.parse(first.files[2].content) as { humanConfirmations: PresenceReceipt[]; safety: { retainedRawValues: boolean } };
    expect(evidence.humanConfirmations).toEqual([receipt]);
    expect(evidence.safety.retainedRawValues).toBe(false);
    expect(serializeGenericExportBundle(first)).toContain(first.bundleHash);
  });

  it("refuses when the checks did not pass, belong to another proposal, or a receipt lacks presence", async () => {
    const input = await exportInput(CONTACT_FORM_FIXTURE);
    const other = await exportInput(DATA_TABLE_FIXTURE);

    const failed = { ...input.validation, checks: input.validation.checks.map((c, i) => (i === 0 ? { ...c, status: "failed" as const } : c)), passed: 8 };
    await expect(buildGenericExportBundle({ ...input, validation: failed })).rejects.toThrow(/have not passed/);
    await expect(buildGenericExportBundle({ ...input, validation: other.validation })).rejects.toThrow(/have not passed/);
    const staged = [{ id: "staged-1", capabilityId: input.proposal.tools[0].capabilityId }];
    await expect(
      buildGenericExportBundle({ ...input, staged, humanConfirmations: [{ ...receipt, userPresent: false as unknown as true }] }),
    ).rejects.toThrow(/lacks user presence/);
  });

  it("refuses receipts that name no staged change or a change outside the proposal", async () => {
    const input = await exportInput(CONTACT_FORM_FIXTURE);

    await expect(buildGenericExportBundle({ ...input, humanConfirmations: [receipt] })).rejects.toThrow(
      /names no staged change/,
    );
    await expect(
      buildGenericExportBundle({ ...input, staged: [{ id: "other", capabilityId: "x" }], humanConfirmations: [receipt] }),
    ).rejects.toThrow(/names no staged change/);
    await expect(
      buildGenericExportBundle({
        ...input,
        staged: [{ id: "staged-1", capabilityId: "form:#not-in-proposal" }],
        humanConfirmations: [receipt],
      }),
    ).rejects.toThrow(/outside this proposal/);
    expect(input.validation.checks.map((check) => check.status)).not.toContain("failed");
  });

  it("emits an embed that registers the reviewed tools on a live page and never submits", async () => {
    const input = await exportInput(CONTACT_FORM_FIXTURE);
    const bundle = await buildGenericExportBundle(input);
    const source = bundle.files[3].content;
    expect(() => new Function(source)).not.toThrow();

    const registered = new Map<string, WebMCP.ModelContextTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: WebMCP.ModelContextTool) => registered.set(tool.name, tool) },
    });
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    const staged: unknown[] = [];
    const onStaged = (event: Event) => staged.push((event as CustomEvent).detail);
    window.addEventListener("webmcp-retrofit:staged", onStaged);
    try {
      document.body.innerHTML = new DOMParser().parseFromString(CONTACT_FORM_FIXTURE.html, "text/html").body.innerHTML;
      new Function(source)();

      expect([...registered.keys()]).toEqual(["send_message"]);
      const tool = registered.get("send_message")!;
      const result = tool.execute(
        { fullName: "Ann", email: "ann@example.test", message: "Hi", priority: "low" },
        { signal: new AbortController().signal },
      ) as Record<string, unknown>;

      expect(result).toMatchObject({ status: "draft_staged", requiresHumanConfirmation: true });
      expect((document.querySelector("#full-name") as HTMLInputElement).value).toBe("Ann");
      expect(staged).toHaveLength(1);
      expect(submitSpy).not.toHaveBeenCalled();
      expect(() =>
        tool.execute(
          { fullName: "Ann", email: "a@b.co", message: "Hi", priority: "low", extra: 1 },
          { signal: new AbortController().signal },
        ),
      ).toThrow(/Unexpected input property: extra/);
    } finally {
      window.removeEventListener("webmcp-retrofit:staged", onStaged);
      submitSpy.mockRestore();
      Reflect.deleteProperty(document, "modelContext");
    }
  });
});
