import { expect, test } from "@playwright/test";

async function installWebMcpStub(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool() {},
      },
    });
  });
}

async function scanOwnedFixture(page: import("@playwright/test").Page) {
  await page
    .getByRole("checkbox", { name: /authorized to analyze this fixture/i })
    .check();
  await page.getByRole("button", { name: "Scan owned fixture" }).click();
  await expect(page.getByRole("heading", { name: "Candidate capabilities" })).toBeVisible();
}

test("scan, review, validate, and export a generated booking retrofit", async ({ page }, testInfo) => {
  await installWebMcpStub(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Scan owned fixture" })).toBeVisible();
  await scanOwnedFixture(page);
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("combobox", { name: "Mobile response mode" })).toHaveValue(
      "accuracy",
    );
  } else {
    await expect(page.getByRole("button", { name: "Accuracy Mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.getByRole("button", { name: "Approve for preview" }).click();
  await page.getByRole("button", { name: /Preview/ }).click();

  await expect(page.getByRole("heading", { name: "Preview generated retrofit" })).toBeVisible();
  await expect(page.getByText(/finalize_booking not exposed/i)).toBeVisible();
  await expect(
    page.getByText("Registration deferred to Validate").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock version for validation" }).click();

  await expect(page.getByRole("heading", { name: "Validate generated tools" })).toBeVisible();
  await expect(page.getByText("3 live tools registered").first()).toBeVisible();
  await expect(page.getByText("Not run")).toBeVisible();
  await page.getByRole("button", { name: "Run deterministic checks" }).click();
  await expect(page.getByText("8/8 passed")).toBeVisible();
  await expect(page.getByText(/final booking remains outside WebMCP/i)).toBeVisible();
  await page.getByRole("button", { name: "Record current-browser UAT" }).click();
  await page.getByRole("button", { name: "Continue to export" }).click();

  await expect(page.getByRole("heading", { name: "Export retrofit package" })).toBeVisible();
  await expect(page.getByText(/export does not deploy or publish/i)).toBeVisible();
  await page
    .getByRole("checkbox", { name: /approve this exact bundle hash/i })
    .check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download retrofit package" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^webmcp-retrofit-[a-f0-9]{12}\.json$/);
});

test("mobile layout has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile project only");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Scan owned fixture" })).toBeVisible();

  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
});
