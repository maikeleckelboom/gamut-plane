import { expect, test } from "./browserFixture";

const states = [
  { name: "oklch", query: "", srgb: "inside", p3: "inside" },
  { name: "oklab", query: "view=oklab", srgb: "inside", p3: "inside" },
  { name: "p3-only", query: "l=0.68&c=0.18&h=252", srgb: "outside", p3: "inside" },
  { name: "outside", query: "l=0.62&c=0.52&h=45", srgb: "outside", p3: "outside" },
  { name: "srgb-hidden", query: "srgb=false", srgb: "inside", p3: "inside" },
  { name: "guides-hidden", query: "srgb=false&p3=false", srgb: "inside", p3: "inside" },
  {
    name: "target-p3",
    query: "l=0.62&c=0.52&h=45&target=display-p3",
    srgb: "outside",
    p3: "outside",
  },
  { name: "narrow", query: "width=340", srgb: "inside", p3: "inside" },
  { name: "threshold-623", query: "width=623", srgb: "inside", p3: "inside" },
  { name: "threshold-624", query: "width=624", srgb: "inside", p3: "inside" },
  { name: "threshold-625", query: "width=625", srgb: "inside", p3: "inside" },
  { name: "enlarged-text", query: "width=800", srgb: "inside", p3: "inside" },
] as const;

for (const state of states) {
  test(`v0.3 parity fixture ${state.name}`, async ({ page }) => {
    await page.goto(`/?parity&${state.query}`);
    if (state.name === "enlarged-text")
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "200%";
      });
    const host = page.locator(".parity-instance");
    const root = host.locator("[data-plane-instrument]");
    await expect(host).toHaveAttribute("data-srgb-status", state.srgb);
    await expect(host).toHaveAttribute("data-p3-status", state.p3);
    await expect(root).toHaveAttribute(
      "data-active-plane",
      state.name === "oklab" ? "oklab" : "oklch",
    );
    await expect(host.locator('[data-gamut-boundary="srgb"]')).toHaveCount(
      state.name.includes("hidden") ? 0 : 1,
    );
    await expect(host.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(
      state.name === "guides-hidden" ? 0 : 1,
    );
    await expect(root.locator("canvas")).toHaveCount(1);
    await expect
      .poll(() => root.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width))
      .toBeGreaterThan(0);
    await expect(root.locator('[data-render-color-space="pending"]')).toHaveCount(0);
    if (process.platform === "win32") await expect(root).toHaveScreenshot(`ui-${state.name}.png`);
  });
}
