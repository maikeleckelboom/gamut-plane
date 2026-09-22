import { expect, test } from "./browserFixture";

test.beforeEach(async ({ page }) => {
  await page.goto("/?single");
  await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(0);
});

test("legend, boundary props, native root ref and accent work through the public entry", async ({
  page,
}) => {
  const root = page.locator("[data-plane-instrument]");
  await expect(root).toHaveId("first-instrument");
  await expect(root).toHaveAttribute("data-host-prop", "first");
  await expect(page.locator("[data-legend]")).toBeVisible();
  const before = await page.locator("[data-color]").innerText();
  await page.getByLabel("sRGB guide", { exact: true }).uncheck();
  await expect(
    root.locator('[data-gamut-boundary="srgb"], [data-gamut-boundary-hit="srgb"]'),
  ).toHaveCount(0);
  await expect(root.locator('[data-gamut-marker="srgb-boundary-guide"]')).toHaveCount(0);
  await page.getByLabel("Display P3 guide", { exact: true }).uncheck();
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(0);
  await expect(root.locator("[data-gamut-range]")).toHaveCount(0);
  expect(await page.locator("[data-color]").innerText()).toBe(before);
  await page.getByRole("button", { name: "Parent boundary target" }).click();
  await expect(root.locator("[data-boundary-target-result]")).toHaveAttribute(
    "data-boundary-target",
    "display-p3",
  );
  await expect(page.locator("[data-boundary-target-output]")).toHaveText("display-p3");
  expect(await page.locator("[data-color]").innerText()).toBe(before);
  await page.getByRole("button", { name: "Toggle accent" }).click();
  await page.getByRole("button", { name: "Focus from ref" }).click();
  await expect(page.getByRole("application")).toBeFocused();
  await page.getByRole("radio", { name: "OKLCH", exact: true }).press("Tab");
  await expect(page.getByRole("application")).toHaveCSS("outline-color", "oklch(0.8 0.12 180)");
});

test("external replacement during capture cancels once without rollback or completion", async ({
  page,
}) => {
  const surface = page.getByRole("application");
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await expect(page.locator("[data-changes]")).not.toHaveText("0");
  await page
    .getByRole("button", { name: "Replace first color" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await page.mouse.up();
  await expect(page.locator("[data-cancels]")).toHaveText("1");
  await expect(page.locator("[data-commits]")).toHaveText("0");
  expect(JSON.parse(await page.locator("[data-color]").innerText())).toEqual({
    l: 0.7,
    c: 0.52,
    h: 270,
    alpha: 0.3,
  });
});

test("all scientific ranges retain native input/change order and preserve alpha", async ({
  page,
}) => {
  for (const [channel, value] of [
    ["h", 210],
    ["l", 0.72],
    ["c", 0.19],
    ["oklab", 0.61],
  ] as const) {
    if (channel === "oklab") await page.getByRole("radio", { name: "OKLab", exact: true }).click();
    const range = page.locator(
      `[data-picker-control="${channel === "oklab" ? "l" : channel}"] [type="range"]`,
    );
    const before = Number(await page.locator("[data-commits]").innerText());
    await range.evaluate((element: HTMLInputElement, next) => {
      element.value = String(next);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await expect
      .poll(
        async () =>
          JSON.parse(await page.locator("[data-color]").innerText())[
            channel === "oklab" ? "l" : channel
          ],
      )
      .toBe(value);
    await expect(page.locator("[data-commits]")).toHaveText(String(before));
    await range.dispatchEvent("change");
    await expect(page.locator("[data-commits]")).toHaveText(String(before + 1));
    expect(JSON.parse(await page.locator("[data-color]").innerText()).alpha).toBe(0.7);
    await expect(page.locator("[data-picker-plane]")).toHaveAttribute("data-field-quality", "full");
  }
});

test("RTL host keeps scientific x and native ranges increasing to the right", async ({ page }) => {
  await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"));
  for (const view of ["OKLCH", "OKLab"]) {
    await page.getByRole("radio", { name: view, exact: true }).click();
    const surface = page.getByRole("application");
    await expect(surface).toHaveCSS("direction", "ltr");
    await surface.scrollIntoViewIfNeeded();
    const box = (await surface.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    const marker = page.locator("[data-active-marker]");
    const left = (await marker.boundingBox())!.x;
    await surface.press("ArrowRight");
    expect((await marker.boundingBox())!.x).toBeGreaterThan(left);
    const ranges = page.locator('[data-picker-control] [type="range"]');
    for (const range of await ranges.all()) {
      await expect(range).toHaveCSS("direction", "ltr");
      const before = await range.inputValue();
      await range.press("ArrowRight");
      expect(Number(await range.inputValue())).toBeGreaterThan(Number(before));
    }
  }
});

test("uncapped DPR updates both backing dimensions after a real resolution event", async ({
  page,
}) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1350,
    height: 1050,
    deviceScaleFactor: 2.5,
    mobile: false,
  });
  const canvas = page.locator("canvas");
  await expect
    .poll(() =>
      canvas.evaluate(
        (element: HTMLCanvasElement) =>
          element.width === Math.round(Math.round(element.getBoundingClientRect().width) * 2.5) &&
          element.height === element.width,
      ),
    )
    .toBe(true);
  await expect(page.locator("[data-changes]")).toHaveText("0");
  await client.detach();
});

for (const state of ["oklch", "oklab", "narrow", "warning"] as const)
  test(`visual ${state}`, async ({ page }) => {
    await page.locator(".host-scroll").evaluate((element: HTMLElement) => {
      element.style.height = "auto";
      element.style.overflow = "visible";
    });
    await page
      .getByRole("spinbutton", { name: "Host width" })
      .fill(state === "narrow" ? "340" : "800");
    if (state === "oklab") await page.getByRole("radio", { name: "OKLab", exact: true }).click();
    if (state === "warning")
      await page.getByRole("button", { name: "Replace first color" }).click();
    await page.locator("[data-plane-instrument]").scrollIntoViewIfNeeded();
    await page.locator("[data-plane-instrument]").evaluate((element) => {
      if (element instanceof HTMLElement) element.blur();
    });
    await page.mouse.move(0, 0);
    await expect(page.locator("[data-plane-instrument]")).toHaveScreenshot(`react-${state}.png`);
  });
