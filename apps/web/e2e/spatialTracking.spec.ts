import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import type { SpatialScene } from "../src/spatial/spatialScene";
import { spatialAction, inspectSection } from "./spatialControls";

type View = ReturnType<SpatialScene["inspect"]>;
const facts = (p: Page) =>
  p
    .locator("[data-spatial-status]")
    .evaluate((e) => (e as unknown as { spatialInspect(): View }).spatialInspect());
async function settled(p: Page) {
  await expect.poll(async () => (await facts(p)).pendingFrame).toBe(false);
}
async function ready(p: Page) {
  await p.goto("/spatial");
  await expect(p.locator("[data-section-lightness]")).toHaveText("L 0.680");
  await settled(p);
}
async function hue(p: Page, value: number) {
  const input = p.getByRole("spinbutton", { name: "Inspected hue in degrees" });
  await input.fill(String(value));
  await input.press("Enter");
  await expect.poll(async () => (await facts(p)).section.hue).toBe(((value % 360) + 360) % 360);
  await settled(p);
}
function relative(v: View) {
  const angle = (v.section.hue! * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const t = v.camera.target,
    p = v.camera.position;
  const x = p[0]! - t[0]!,
    y = p[1]! - t[1]!,
    z = p[2]! - t[2]!;
  return [
    x * c + z * s,
    y,
    -x * s + z * c,
    t[0]! * c + t[2]! * s,
    t[1]!,
    -t[0]! * s + t[2]! * c,
    v.camera.zoom,
  ];
}
function sameFrame(v: View, expected: number[]) {
  relative(v).forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 8));
}
async function enterHue(p: Page) {
  await p.getByRole("radio", { name: "Hue section", exact: true }).check();
  await expect.poll(async () => (await facts(p)).section.type).toBe("hue");
  await settled(p);
}

test("hue sweeps preserve aligned and oblique camera frames, pan, cut and authored color", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const path = process.env.SPATIAL_TRACKING_EVIDENCE ?? info.outputPath("evidence");
  await mkdir(path, { recursive: true });
  await page.screenshot({ path: `${path}/default.png`, fullPage: true });
  const original = await facts(page);
  await enterHue(page);
  expect((await facts(page)).camera).toEqual(original.camera);
  await expect(page.locator("[data-section-slider]")).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Inspected hue in degrees" })).toHaveCount(0);
  await inspectSection(page);
  await spatialAction(page, "View section");
  await page.getByRole("button", { name: "View section", exact: true }).press("Escape");
  await settled(page);
  const aligned = relative(await facts(page));
  const authored = await page
    .locator("[data-authored-channels]")
    .getAttribute("data-authored-channels");
  const records: View[] = [];
  for (const h of [0, 60, 120, 180, 240, 300, 359, 0, 359, 300, 240, 180, 120, 60, 0]) {
    await hue(page, h);
    const v = await facts(page);
    sameFrame(v, aligned);
    expect(v.section.sectionOnly).toBe(true);
    expect(v.section.capVisible).toBe(true);
    records.push(v);
    if (records.length <= 8) await page.screenshot({ path: `${path}/hue-${h}.png` });
  }
  const canvas = page.getByLabel("Orthographic gamut scene");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  await settled(page);
  expect((await facts(page)).section.sectionOnly).toBe(false);
  await canvas.press("ArrowRight");
  await canvas.press("Shift+ArrowUp");
  await canvas.press("+");
  await settled(page);
  await spatialAction(page, "Flip cut");
  await page.getByRole("button", { name: "Flip cut", exact: true }).press("Escape");
  await settled(page);
  const oblique = relative(await facts(page));
  const cutSide = (await facts(page)).section.cutSide;
  for (const h of [45, 135, 225, 315, 359, 0, 359]) {
    await hue(page, h);
    const v = await facts(page);
    sameFrame(v, oblique);
    expect(v.section.cutSide).toBe(cutSide);
  }
  await page.screenshot({ path: `${path}/oblique-flipped.png` });
  await page.getByRole("checkbox", { name: "Cut away" }).uncheck();
  await hue(page, 90);
  sameFrame(await facts(page), oblique);
  await page.screenshot({ path: `${path}/uncut.png` });
  await page.getByRole("checkbox", { name: "Cut away" }).check();
  // Actual pointer drag, inspect every delivered input/render pair while pointer stays down.
  const slider = page.locator("[data-section-slider]");
  const range = (await slider.boundingBox())!;
  await page.mouse.move(range.x + range.width * 0.25, range.y + range.height / 2);
  await page.mouse.down();
  for (const fraction of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
    await page.mouse.move(range.x + range.width * fraction, range.y + range.height / 2);
    await expect
      .poll(async () => (await facts(page)).section.hue)
      .toBeCloseTo(Number(await slider.inputValue()), 6);
    await settled(page);
    sameFrame(await facts(page), oblique);
    records.push(await facts(page));
  }
  await page.screenshot({ path: `${path}/dragging.png` });
  await page.mouse.up();
  expect(
    await page.locator("[data-authored-channels]").getAttribute("data-authored-channels"),
  ).toBe(authored);
  const beforeSwitch = (await facts(page)).camera;
  await page.getByRole("radio", { name: "Lightness section", exact: true }).check();
  await settled(page);
  expect((await facts(page)).camera).toEqual(beforeSwitch);
  await enterHue(page);
  expect((await facts(page)).camera).toEqual(beforeSwitch);
  await writeFile(`${path}/frames.json`, JSON.stringify(records, null, 2));
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`follow and inspect remain separate; neutral, invalid, Home and fit paths (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await ready(page);
    await enterHue(page);
    await spatialAction(page, "Home");
    await settled(page);
    const home = relative(await facts(page));
    await page.getByRole("combobox", { name: "Coordinates" }).click();
    await page
      .getByRole("option", { name: /^OKLCH/ })
      .first()
      .click();
    const edit = async (name: string, value: string) => {
      const input = page.locator("[data-gp-root]").getByRole("spinbutton", { name });
      await input.fill(value);
      await input.press("Enter");
      await settled(page);
    };
    await edit("Hue numeric value", "30");
    expect((await facts(page)).section.hue).toBe(30);
    sameFrame(await facts(page), home);
    await edit("Chroma numeric value", "0");
    const neutral = (await facts(page)).camera;
    await edit("Hue numeric value", "280");
    expect((await facts(page)).camera).toEqual(neutral);
    await inspectSection(page);
    await hue(page, 170);
    const independent = (await facts(page)).camera;
    await edit("Chroma numeric value", "0.15");
    expect((await facts(page)).section.hue).toBe(170);
    expect((await facts(page)).camera).toEqual(independent);
    const input = page.getByRole("spinbutton", { name: "Inspected hue in degrees" });
    await input.fill("");
    await input.press("Enter");
    await expect(input).toHaveValue("170");
    expect((await facts(page)).camera).toEqual(independent);
    await page.getByRole("combobox", { name: "Section value source" }).selectOption("follow");
    await expect.poll(async () => (await facts(page)).section.hue).toBe(280);
    await spatialAction(page, "Fit section");
    await settled(page);
    const fitted = relative(await facts(page));
    await edit("Hue numeric value", "359");
    sameFrame(await facts(page), fitted);
    await edit("Hue numeric value", "0");
    sameFrame(await facts(page), fitted);
  });
}

test("touch orbit/pan and responsive disclosures remain accessible", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await ready(page);
  await enterHue(page);
  await inspectSection(page);
  await spatialAction(page, "View section");
  await page.getByRole("button", { name: "View section", exact: true }).press("Escape");
  const box = (await page.getByLabel("Orthographic gamut scene").boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 25, y: y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settled(page);
  expect((await facts(page)).section.sectionOnly).toBe(false);
  const start = relative(await facts(page));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 30, y },
      { x: x + 30, y },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 40, y: y + 10 },
      { x: x + 40, y: y + 10 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settled(page);
  const panned = relative(await facts(page));
  expect(panned).not.toEqual(start);
  await hue(page, 10);
  sameFrame(await facts(page), panned);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await spatialAction(page, "Fit section");
      await page.getByRole("button", { name: "Fit section", exact: true }).press("Escape");
      await expect(page.locator(".spatial-section .spatial-disclosure > summary")).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`${width}-${scheme}.png`), fullPage: true });
    }
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await context.close();
});

test("secondary actions have complete keyboard paths and focus returns from disclosure", async ({
  page,
}, info) => {
  await ready(page);
  const view = page.locator(".spatial-view-options > summary");
  await view.focus();
  await page.keyboard.press("Enter");
  for (const name of ["Fit visible", "Home", "Show selected"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await settled(page);
  }
  await expect(page.getByRole("button", { name: "Restore surface", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await settled(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox", { name: /outline/ })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: /outline/ })).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(view).toBeFocused();
  const section = page.locator(".spatial-section .spatial-disclosure > summary");
  await section.focus();
  await page.keyboard.press("Enter");
  for (const name of ["View section", "Fit section"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await settled(page);
  }
  await page.keyboard.press("Escape");
  await expect(section).toBeFocused();
  await page.getByLabel("Orthographic gamut scene").press("ArrowUp");
  await section.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Flip cut", exact: true })).toBeFocused();
  const side = (await facts(page)).section.cutSide;
  await page.keyboard.press("Enter");
  await settled(page);
  expect((await facts(page)).section.cutSide).toBe(-side);
  await expect(page.locator("#spatial-cut-direction")).toHaveText("Upper half removed");
  await page.screenshot({ path: info.outputPath("cut-direction-keyboard.png"), fullPage: true });
  await page.keyboard.press("Escape");
  const about = page.locator(".spatial-details > summary");
  await about.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#spatial-instructions")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
