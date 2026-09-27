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
    await expect(root).toHaveAttribute("data-gp-root", "");
    await expect(root).toHaveAttribute("data-gp-view", state.name === "oklab" ? "oklab" : "oklch");
    const part = (name: string) => root.locator(`[data-gp-part="${name}"]`);
    for (const name of [
      "view-control",
      "workspace",
      "field",
      "controls",
      "plane",
      "surface",
      "canvas",
      "gamut-guides",
      "marker",
      "warning",
      "warning-glyph",
      "channel",
      "channel-header",
      "numeric-input",
      "channel-track",
      "channel-field",
      "native-range",
      "target-result",
      "target-heading",
      "target-swatch",
    ])
      expect(await part(name).count(), `${state.name}: ${name}`).toBeGreaterThan(0);
    await expect(part("view-option")).toHaveCount(2);
    await expect(part("axis")).toHaveCount(2);
    await expect(root.locator('[data-gp-part="axis"][data-gp-axis="x"]')).toHaveCount(1);
    await expect(root.locator('[data-gp-part="axis"][data-gp-axis="y"]')).toHaveCount(1);
    await expect(part("surface")).toHaveAttribute("role", "application");
    await expect(part("surface")).toHaveAttribute("aria-label", /.+/);
    await expect(part("canvas")).toHaveAttribute("aria-hidden", "true");
    await expect(part("field").locator("[data-legend]")).toHaveCount(1);
    await expect(root.locator('[data-gp-part="marker"][data-gp-marker="active"]')).toHaveCount(1);
    await expect(part("target-result")).toHaveAttribute("data-gp-status", state.srgb);
    await expect(root.locator('[data-gp-part="warning"][data-gp-warning]')).not.toHaveCount(0);
    await expect(root.locator('[data-gp-part="channel"][data-gp-channel]')).not.toHaveCount(0);
    await expect(root.locator("[data-gp-visually-hidden]")).not.toHaveCount(0);
    const titleId = await root.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    await expect(root.locator(`[id="${titleId}"]`)).toHaveCount(1);
    if (state.name === "oklab") {
      await expect(part("domain-boundary")).toHaveCount(1);
      await expect(part("coordinate-readout")).toHaveCount(1);
    } else {
      await expect(part("domain-boundary")).toHaveCount(0);
      await expect(part("coordinate-readout")).toHaveCount(0);
    }
    if (state.srgb === "outside") {
      await expect(
        root.locator('[data-gp-part="marker"][data-gp-marker="target-guide"]'),
      ).toHaveCount(1);
      await expect(part("guide-connector")).toHaveCount(1);
      await expect(part("boundary-preview")).toHaveCount(1);
    }
    if (state.name === "guides-hidden") await expect(part("gamut-interval")).toHaveCount(0);
    else expect(await part("gamut-interval").count()).toBeGreaterThan(0);
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
