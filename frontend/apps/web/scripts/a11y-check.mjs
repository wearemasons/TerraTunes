#!/usr/bin/env node
// Accessibility smoke test: drives the built app in a real browser and runs axe (WCAG 2.2 AA)
// on every screen in light and dark themes. Exits 1 on any serious or critical violation.
//
// Usage: bun run build && bun run serve   (in another terminal)
//        bun run test:a11y [baseUrl]
// Browser: uses an installed Chrome by default; set PW_CHANNEL=msedge for Edge.

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
let failures = 0;

async function audit(page, name) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  failures += serious.length;
  console.log(`${serious.length ? "FAIL" : "ok  "} ${name}: ${result.violations.length} violations, ${serious.length} serious`);
  for (const v of result.violations) console.log(`     [${v.impact}] ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
}

for (const theme of ["dark", "light"]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((t) => localStorage.setItem("terratunes-theme", t), theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await audit(page, `${theme} jukebox`);

  const firstTrack = page.locator("ul h2 a").first();
  await firstTrack.click();
  await page.waitForSelector("[aria-labelledby='transport-heading']");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  if (focused !== "H1") {
    failures++;
    console.log(`FAIL ${theme} focus after navigation landed on ${focused}, expected H1`);
  }
  await audit(page, `${theme} player`);

  await page.keyboard.press("3");
  await page.locator("[data-explore-surface]").focus();
  await page.keyboard.press("ArrowRight");
  await audit(page, `${theme} explore mode`);

  await page.keyboard.press("?");
  await page.getByRole("dialog").waitFor();
  await audit(page, `${theme} shortcuts dialog`);
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/about`, { waitUntil: "networkidle" });
  await audit(page, `${theme} about`);

  if (errors.length) {
    failures += errors.length;
    console.log(`FAIL ${theme} page errors:\n  ${errors.join("\n  ")}`);
  }
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`\n${failures} accessibility problem(s).`);
  process.exit(1);
}
console.log("\nAll screens pass axe WCAG 2.2 AA with no serious or critical issues.");
