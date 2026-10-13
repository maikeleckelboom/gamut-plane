import { spatialAction, inspectSection } from "./spatialControls";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import type { SpatialScene } from "../src/spatial/spatialScene";

const evidence = process.env.SPATIAL_REFINEMENT_EVIDENCE;
test.use({ video: evidence ? { mode: "on", size: { width: 1366, height: 900 } } : "off" });
const stage = (page: Page) => page.locator("[data-spatial-status]");
const facts = (page: Page) =>
  stage(page).evaluate((element) =>
    (
      element as unknown as { spatialInspect(): ReturnType<SpatialScene["inspect"]> }
    ).spatialInspect(),
  );
const computes = (page: Page) =>
  stage(page).evaluate(
    (element) =>
      (element as unknown as { spatialMetrics(): { computes: number } }).spatialMetrics().computes,
  );
const color = (page: Page) =>
  page.locator("[data-authored-channels]").getAttribute("data-authored-channels");
const settle = async (page: Page) =>
  expect.poll(async () => (await facts(page)).pendingFrame).toBe(false);
async function ready(page: Page) {
  await page.goto("/spatial");
  await expect(stage(page)).toHaveAttribute("data-spatial-status", "ready");
  await expect(page.locator("[data-section-lightness]")).toHaveText("L 0.680");
  await settle(page);
}
async function action(page: Page, name: string) {
  await spatialAction(page, name);
  await settle(page);
}

test("aligned comparison has a stable scale; fitting, orbit, and recovery preserve independent inspection", async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByRole("combobox", { name: "Coordinates" })).toContainText("OKLab");
  const authored = await color(page);
  await action(page, "View section");
  const aligned = await facts(page);
  expect(aligned.section.sectionOnly).toBe(true);
  expect(aligned.section.ghostSegments).toBe(0);
  for (const level of ["0.136", "0.9", "0.4"]) {
    await inspectSection(page);
    await page.locator("[data-section-slider]").fill(level);
    await settle(page);
    expect((await facts(page)).camera).toEqual(aligned.camera);
  }
  await expect(page.locator("[data-section-relationship]")).toHaveText(
    "Selected L 0.680 · Section L 0.400 · ΔL +0.280",
  );
  const count = await computes(page);
  await action(page, "Fit section");
  expect((await facts(page)).camera.zoom).toBeGreaterThan(aligned.camera.zoom);
  expect((await facts(page)).section.sectionOnly).toBe(true);
  await page.getByLabel("Orthographic gamut scene").press("ArrowUp");
  await settle(page);
  expect((await facts(page)).section.sectionOnly).toBe(false);
  expect(await computes(page)).toBe(count);
  expect(await color(page)).toBe(authored);
});

test("recovery hides surfaces explicitly and keeps inspected lightness, color, and cut intent", async ({
  page,
}) => {
  await ready(page);
  await inspectSection(page);
  await page.locator("[data-section-slider]").fill("0.9");
  await expect(page.locator("[data-marker-note]")).toContainText("behind the surface");
  const before = await facts(page);
  const authored = await color(page);
  const count = await computes(page);
  await action(page, "Show selected");
  await expect(page.getByRole("combobox", { name: "Section value source" })).toHaveValue("inspect");
  await expect(page.getByRole("button", { name: "Restore surface" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore surface" })).toBeFocused();
  await expect(page.locator("[data-marker-note]")).toHaveCount(0);
  const recovered = await facts(page);
  expect(recovered.section.lightness).toBe(0.9);
  expect(recovered.section.marker).toEqual(before.section.marker);
  expect(recovered.section.cutSide).toBe(before.section.cutSide);
  expect(recovered.section.revealed).toBe(true);
  await action(page, "Restore surface");
  await expect(page.getByRole("button", { name: "Show selected", exact: true })).toBeFocused();
  await expect(page.locator("[data-marker-note]")).toContainText("behind the surface");
  expect(await color(page)).toBe(authored);
  expect(await computes(page)).toBe(count);
});

test("orbit across the horizon and reversals never flips the cut or re-enters section-only composition", async ({
  page,
}) => {
  await ready(page);
  const count = await computes(page);
  const authored = await color(page);
  const canvas = page.getByLabel("Orthographic gamut scene");
  const hemispheres = new Set<number>();
  for (const key of [
    ...Array<string>(18).fill("ArrowUp"),
    ...Array<string>(32).fill("ArrowDown"),
    ...Array<string>(14).fill("ArrowUp"),
  ]) {
    await canvas.press(key);
    await settle(page);
    const view = await facts(page);
    hemispheres.add(Math.sign(view.camera.position[1]! - view.camera.target[1]!));
    expect(view.section.cutSide).toBe(1);
    expect(view.section.sectionOnly).toBe(false);
  }
  expect([...hemispheres].sort()).toEqual([-1, 1]);
  await action(page, "Flip cut");
  expect((await facts(page)).section.cutSide).toBe(-1);
  await action(page, "Home");
  expect((await facts(page)).section.cutSide).toBe(-1);
  expect(await computes(page)).toBe(count);
  expect(await color(page)).toBe(authored);
});

test("recorded editing and inspection journey with mouse orbit, interruption, and recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await ready(page);
  const records: unknown[] = [];
  let frame = 0;
  async function capture(label: string) {
    await settle(page);
    records.push({ frame, label, view: await facts(page), computes: await computes(page) });
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/${String(frame).padStart(3, "0")}-${label}.png` });
    }
    frame++;
  }
  await capture("default");
  const lightness = page.getByRole("spinbutton", { name: "Lightness numeric value", exact: true });
  await lightness.fill("0.646");
  await lightness.press("Enter");
  await capture("edit-lightness");
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.getByRole("option", { name: "OKLCH", exact: true }).click();
  for (const [name, value] of [
    ["Chroma", "0.11"],
    ["Hue", "180"],
  ]) {
    const input = page.getByRole("spinbutton", { name: `${name} numeric value`, exact: true });
    await input.fill(value!);
    await input.press("Enter");
    await capture(`edit-${name!.toLowerCase()}`);
  }
  await inspectSection(page);
  await page.locator("[data-section-slider]").fill("0.5");
  await capture("move-section");
  await action(page, "View section");
  await capture("aligned");
  await inspectSection(page);
  await page.locator("[data-section-slider]").fill("0.136");
  await capture("independent");
  const authored = await color(page);
  const count = await computes(page);
  const canvas = page.getByLabel("Orthographic gamut scene");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const hemispheres = new Set<number>();
  for (let step = 1; step <= 16; step++) {
    await page.mouse.move(x + step * 3, y + (step * box.height) / 48);
    await capture("orbit");
    const view = await facts(page);
    hemispheres.add(Math.sign(view.camera.position[1]! - view.camera.target[1]!));
    expect(view.section.cutSide).toBe(-1);
  }
  expect([...hemispheres].sort()).toEqual([-1, 1]);
  // Reverse without releasing the pointer, then interrupt with release.
  for (let step = 15; step >= 8; step--) {
    await page.mouse.move(x + step * 3, y + (step * box.height) / 48);
    await capture("reverse");
  }
  await page.mouse.up();
  await action(page, "Home");
  // The lower cut leaves the marker inside the kept upper body at this section.
  await expect(page.locator("[data-marker-note]")).toBeVisible();
  await capture("hidden");
  await action(page, "Show selected");
  await capture("recovered");
  expect(await color(page)).toBe(authored);
  expect(await computes(page)).toBe(count);
  await expect(page.getByRole("combobox", { name: "Section value source" })).toHaveValue("inspect");
  expect((await facts(page)).section.lightness).toBe(0.136);
  if (evidence) {
    await writeFile(`${evidence}/frames.json`, JSON.stringify(records, null, 2));
    const video = page.video();
    await page.close();
    await video?.saveAs(`${evidence}/interaction.webm`);
  }
});

test("laptop editing keeps the scene visible and short viewports use normal flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await ready(page);
  const input = page.getByRole("spinbutton", { name: "Lightness numeric value", exact: true });
  await input.scrollIntoViewIfNeeded();
  const scene = (await page.getByLabel("Orthographic gamut scene").boundingBox())!;
  const edit = (await input.boundingBox())!;
  expect(scene.y).toBeGreaterThanOrEqual(0);
  expect(scene.y + scene.height).toBeLessThan(768);
  expect(edit.y + edit.height).toBeLessThan(768);
  for (const height of [600, 400]) {
    await page.setViewportSize({ width: 1366, height });
    expect(
      await page.locator(".spatial-scene-column").evaluate((el) => getComputedStyle(el).position),
    ).toBe("static");
  }
});

test("matched workspace evidence at desktop, laptop, and narrow dimensions", async ({ page }) => {
  const directory = process.env.SPATIAL_MATCHED_EVIDENCE;
  for (const [width, height] of [
    [1600, 1250],
    [1366, 768],
    [390, 900],
    [320, 700],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await ready(page);
    if (directory) {
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: `${directory}/workspace-${width}.png`, fullPage: true });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
