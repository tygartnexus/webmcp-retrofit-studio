import { expect, test } from "@playwright/test";

async function installWebMcpStub(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
          const bag = (window as unknown as { __tools?: Map<string, unknown> }).__tools ?? new Map();
          (window as unknown as { __tools: Map<string, unknown> }).__tools = bag;
          bag.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => bag.delete(tool.name), { once: true });
        },
      },
    });
  });
}

async function scanGeneric(page: import("@playwright/test").Page, fixtureId: string) {
  await page.getByRole("combobox", { name: "Source" }).selectOption(fixtureId);
  await page.getByRole("checkbox", { name: /authorized to analyze this fixture/i }).check();
  await page.getByRole("button", { name: "Scan owned fixture" }).click();
  await expect(page.getByRole("heading", { name: "Generic candidate capabilities" })).toBeVisible();
}

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
}

test("generic flow: scan a contact form, approve, call the tool, stage, validate, export", async ({ page }) => {
  await installWebMcpStub(page);
  await page.goto("/");
  await scanGeneric(page, "synthetic-contact-form-v1");

  const proposed = page.getByRole("region", { name: /Proposed tools \(1\)/ });
  await expect(proposed).toContainText("send_message");
  // toContainText reads hidden nodes too; the card must actually render at every viewport.
  await expect(proposed.locator(".generic-tool-card")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Approve for runtime" }).click();

  await expect(page.getByRole("heading", { name: "Generic tools live" })).toBeVisible();
  await expect(page.getByText("1 live tool registered")).toBeVisible();
  const registered = await page.evaluate(() =>
    [...((window as unknown as { __tools: Map<string, unknown> }).__tools?.keys() ?? [])],
  );
  expect(registered).toEqual(["send_message"]);
  await noHorizontalOverflow(page);

  const consoleRegion = page.getByRole("region", { name: "Tool console" });
  await consoleRegion.getByRole("button", { name: "Invoke" }).click();
  await expect(consoleRegion.getByText(/"status": "draft_staged"/)).toBeVisible();
  const stagedRegion = page.getByRole("region", { name: "Staged changes" });
  await expect(stagedRegion.getByText("Send message")).toBeVisible();
  await expect(stagedRegion.getByRole("button", { name: "Confirm with passkey" })).toBeVisible();

  await page.getByRole("button", { name: /Continue to validate/ }).click();
  await expect(page.getByRole("heading", { name: "Validate generic tools" })).toBeVisible();
  await page.getByRole("button", { name: "Run deterministic checks" }).click();
  await expect(page.getByRole("heading", { name: "10/10 passed" })).toBeVisible();

  await page.getByRole("button", { name: /Continue to export/ }).click();
  await expect(page.getByRole("heading", { name: "Export generic retrofit package" })).toBeVisible();
  await expect(page.getByText("webmcp-retrofit.generated.js")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download package" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /approve this exact bundle hash/i }).check();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download package" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^webmcp-generic-retrofit-[a-f0-9]{12}\.json$/);
  await noHorizontalOverflow(page);
});

test("generic flow: pasted owner HTML is scanned inertly and its scripts never run", async ({ page }) => {
  await installWebMcpStub(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Source" }).selectOption("owner-html");
  await page.getByRole("checkbox", { name: /own or am authorized to analyze this page/i }).check();
  await page.getByRole("textbox", { name: "Page HTML" }).fill(
    '<title>Parts desk</title><h1>Find a part</h1><form method="get"><label for="q">Part number</label><input id="q" name="q" type="search"><button>Search</button></form><script>window.__ranScript = true</script>',
  );
  await page.getByRole("button", { name: "Scan pasted page" }).click();

  await expect(page.getByRole("heading", { name: "Generic candidate capabilities" })).toBeVisible();
  await expect(page.getByText(/inert scan of “Parts desk”/)).toBeVisible();
  await expect(page.getByRole("region", { name: /Proposed tools \(1\)/ })).toContainText("search_part_number");
  expect(await page.evaluate(() => (window as unknown as { __ranScript?: boolean }).__ranScript)).toBeUndefined();
  await noHorizontalOverflow(page);
});

test("generic flow: the checkout fixture never exposes the order form as a tool", async ({ page }) => {
  await installWebMcpStub(page);
  await page.goto("/");
  await scanGeneric(page, "synthetic-checkout-v1");

  await expect(page.getByRole("region", { name: /Kept off the tool surface \(1\)/ })).toContainText("Place order");
  await page.getByRole("button", { name: "Approve for runtime" }).click();
  await expect(page.getByText("1 live tool registered")).toBeVisible();
  const registered = await page.evaluate(() =>
    [...((window as unknown as { __tools: Map<string, unknown> }).__tools?.keys() ?? [])],
  );
  expect(registered).toEqual(["apply_coupon"]);
});

test("generic flow: an unbroken 200-character label never widens the page", async ({ page }) => {
  await installWebMcpStub(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Source" }).selectOption("owner-html");
  await page.getByRole("checkbox", { name: /own or am authorized to analyze this page/i }).check();
  const run = "Z".repeat(200);
  await page.getByRole("textbox", { name: "Page HTML" }).fill(
    `<title>Long labels</title><form method="post" action="/x"><label for="a">A ${run}</label><input id="a" name="a"><button>Save ${run}</button><button formaction="/gone">Delete ${run}</button></form>`,
  );
  await page.getByRole("button", { name: "Scan pasted page" }).click();
  const proposed = page.getByRole("region", { name: /Proposed tools \(1\)/ });
  await expect(proposed.locator(".generic-tool-card")).toBeVisible();
  await expect(page.getByRole("region", { name: /Kept off the tool surface \(1\)/ })).toBeVisible();
  await noHorizontalOverflow(page);
});
