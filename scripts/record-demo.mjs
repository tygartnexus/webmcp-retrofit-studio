import { chromium } from "@playwright/test";
import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// DRAFT-ONLY layout/timing capture. The injected modelContext below is a test
// double and is not evidence of live agent discovery, selection, or execution.

const outputPath = resolve("artifacts/demo/webmcp-retrofit-demo-draft-silent.webm");
await mkdir(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: {
    dir: resolve("artifacts/demo/raw"),
    size: { width: 1600, height: 900 },
  },
});
const page = await context.newPage();

await page.addInitScript(() => {
  const registeredTools = new Map();
  Object.defineProperty(window, "__demoWebMcpTools", {
    configurable: false,
    value: registeredTools,
  });
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      async registerTool(tool, options) {
        registeredTools.set(tool.name, tool);
        options?.signal?.addEventListener(
          "abort",
          () => registeredTools.delete(tool.name),
          { once: true },
        );
      },
    },
  });
});

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  const watermark = document.createElement("div");
  watermark.textContent = "DRAFT | TEST DOUBLE | NOT PUBLIC UAT";
  Object.assign(watermark.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "2147483647",
    padding: "8px 12px",
    border: "2px solid #7f1d1d",
    borderRadius: "6px",
    background: "rgba(254, 226, 226, 0.96)",
    color: "#7f1d1d",
    font: "700 13px/1.2 system-ui, sans-serif",
    letterSpacing: "0.06em",
    pointerEvents: "none",
  });
  document.body.append(watermark);
});
await page.waitForTimeout(12_000);

await page
  .getByRole("checkbox", { name: /authorized to analyze this fixture/i })
  .check();
await page.waitForTimeout(2_000);
await page.getByRole("button", { name: "Scan owned fixture" }).click();
await page.getByRole("heading", { name: "Candidate capabilities" }).waitFor();
await page.waitForTimeout(11_000);

await page.getByRole("button", { name: "Red Team Mode" }).click();
await page.waitForTimeout(6_000);
await page.getByRole("button", { name: "Accuracy Mode" }).click();
await page.waitForTimeout(17_000);

await page.getByRole("button", { name: "Approve for preview" }).click();
await page.getByRole("button", { name: /Preview/ }).click();
await page.getByRole("heading", { name: "Preview generated retrofit" }).waitFor();
await page.waitForTimeout(16_000);

await page.getByRole("button", { name: "Lock version for validation" }).click();
await page.getByRole("heading", { name: "Validate generated tools" }).waitFor();
await page.waitForTimeout(12_000);
await page.getByRole("button", { name: "Run deterministic checks" }).click();
await page.getByText("8/8 passed").waitFor();
await page.waitForTimeout(10_000);

await page.evaluate(async () => {
  const tools = window.__demoWebMcpTools;
  const signal = new AbortController().signal;
  await tools.get("search_services").execute({ query: "repair" }, { signal });
  await tools
    .get("get_availability")
    .execute({ serviceId: "repair" }, { signal });
  await tools.get("stage_booking").execute(
    { serviceId: "repair", date: "2026-09-05", time: "14:30" },
    { signal },
  );
});
await page.waitForTimeout(14_000);

await page.getByRole("button", { name: "Confirm booking" }).click();
await page.getByRole("dialog", { name: "Confirm staged booking" }).waitFor();
await page.waitForTimeout(5_000);
await page
  .getByRole("dialog", { name: "Confirm staged booking" })
  .getByRole("button", { name: "Cancel" })
  .click();
await page.waitForTimeout(3_000);

await page.getByRole("button", { name: "Record current-browser UAT" }).click();
await page.waitForTimeout(7_000);
await page.getByRole("button", { name: "Continue to export" }).click();
await page.getByRole("heading", { name: "Export retrofit package" }).waitFor();
await page.waitForTimeout(10_000);
await page
  .getByRole("checkbox", { name: /approve this exact bundle hash/i })
  .check();
await page.waitForTimeout(12_000);

const video = page.video();
await page.close();
await context.close();
await browser.close();

if (!video) throw new Error("Playwright did not create a recording");
await rename(await video.path(), outputPath);
process.stdout.write(`${outputPath}\n`);
