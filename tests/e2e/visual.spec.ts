import { expect, test } from "@playwright/test";

test("capture accepted-size fidelity artifacts", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "single capture run");

  const desktopContext = await browser.newContext({
    viewport: { width: 1586, height: 992 },
    deviceScaleFactor: 1,
  });
  const desktopPage = await desktopContext.newPage();
  const desktopErrors: string[] = [];
  desktopPage.on("pageerror", (error) => desktopErrors.push(error.message));

  await desktopPage.addInitScript(() => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { async registerTool() {} },
    });
  });
  await desktopPage.goto("/");
  await expect(
    desktopPage.getByRole("heading", { name: "Scan owned fixture" }),
  ).toBeVisible();
  await desktopPage.screenshot({
    path: "test-results/fidelity/scan-desktop.png",
  });
  await desktopPage
    .getByRole("checkbox", { name: /authorized to analyze this fixture/i })
    .check();
  await desktopPage.getByRole("button", { name: "Scan owned fixture" }).click();
  await expect(
    desktopPage.getByRole("heading", { name: "Candidate capabilities" }),
  ).toBeVisible();
  await desktopPage.screenshot({
    path: "test-results/fidelity/candidates-desktop.png",
  });

  await desktopPage.getByRole("button", { name: "Approve for preview" }).click();
  await desktopPage.getByRole("button", { name: /Preview/ }).click();
  await expect(
    desktopPage.getByRole("heading", { name: "Preview generated retrofit" }),
  ).toBeVisible();
  await desktopPage.screenshot({
    path: "test-results/fidelity/preview-desktop.png",
  });
  await desktopPage
    .getByRole("button", { name: "Lock version for validation" })
    .click();
  await expect(
    desktopPage.getByRole("heading", { name: "Validate generated tools" }),
  ).toBeVisible();
  await desktopPage
    .getByRole("button", { name: "Run deterministic checks" })
    .click();
  await expect(desktopPage.getByText("8/8 passed")).toBeVisible();
  await desktopPage.screenshot({
    path: "test-results/fidelity/validate-desktop.png",
  });
  await desktopPage
    .getByRole("button", { name: "Record current-browser UAT" })
    .click();
  await desktopPage.getByRole("button", { name: "Continue to export" }).click();
  await expect(
    desktopPage.getByRole("heading", { name: "Export retrofit package" }),
  ).toBeVisible();
  await desktopPage.screenshot({
    path: "test-results/fidelity/export-desktop.png",
  });
  expect(desktopErrors).toEqual([]);
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 426, height: 922 },
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors: string[] = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  await mobilePage.goto("/");
  await expect(
    mobilePage.getByRole("heading", { name: "Scan owned fixture" }),
  ).toBeVisible();
  await mobilePage.screenshot({
    path: "test-results/fidelity/scan-mobile.png",
  });
  await mobilePage
    .getByRole("checkbox", { name: /authorized to analyze this fixture/i })
    .check();
  await mobilePage.getByRole("button", { name: "Scan owned fixture" }).click();
  await expect(
    mobilePage.getByRole("heading", { name: "Candidate capabilities" }),
  ).toBeVisible();
  await mobilePage.screenshot({
    path: "test-results/fidelity/candidates-mobile.png",
  });

  const sizes = await mobilePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  expect(mobileErrors).toEqual([]);
  await mobileContext.close();
});
