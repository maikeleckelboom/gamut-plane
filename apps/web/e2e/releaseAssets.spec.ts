import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const documentationImagePath = fileURLToPath(
  new URL("../../../docs/assets/gamut-plane-desktop.png", import.meta.url),
);
const socialImagePath = fileURLToPath(new URL("../public/og/gamut-plane.png", import.meta.url));
const faviconPreviewPath = fileURLToPath(
  new URL("../test-results/favicon-small-sizes.png", import.meta.url),
);

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);
}

test("generate reviewed repository and social images", async ({ page }) => {
  await mkdir(fileURLToPath(new URL("../../../docs/assets/", import.meta.url)), {
    recursive: true,
  });
  await mkdir(fileURLToPath(new URL("../public/og/", import.meta.url)), { recursive: true });
  await mkdir(fileURLToPath(new URL("../test-results/", import.meta.url)), { recursive: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await page.screenshot({
    path: documentationImagePath,
    fullPage: true,
    animations: "disabled",
  });

  await page.setViewportSize({ width: 1200, height: 630 });
  await ready(page);
  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>("#app");
    const identity = document.querySelector<HTMLElement>(".project-identity");
    const plane = document.querySelector<HTMLElement>(".color-plane");
    if (!app || !identity || !plane) throw new Error("Release capture source is incomplete");

    const capture = document.createElement("main");
    capture.className = "social-capture";

    const copy = document.createElement("section");
    copy.className = "social-copy";
    copy.append(identity.cloneNode(true));

    const method = document.createElement("p");
    method.className = "social-method";
    method.textContent =
      "Exact gamut membership stays independent from the sampled boundary guides.";
    copy.append(method);

    const legend = document.createElement("div");
    legend.className = "social-boundaries";
    for (const [label, className] of [
      ["Display P3", "social-boundary social-boundary--p3"],
      ["sRGB", "social-boundary social-boundary--srgb"],
    ]) {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.className = className;
      const text = document.createElement("span");
      text.textContent = label;
      item.append(swatch, text);
      legend.append(item);
    }
    copy.append(legend);

    const visual = document.createElement("section");
    visual.className = "social-visual";
    visual.setAttribute("aria-label", "OKLCH plane with Display P3 and sRGB boundaries");
    visual.append(plane);

    capture.append(copy, visual);
    app.replaceChildren(capture);
  });
  await page.addStyleTag({
    content: `
      :root {
        font-family: sans-serif;
      }

      html,
      body,
      #app {
        width: 1200px;
        height: 630px;
        overflow: hidden;
      }

      body {
        background: #0b0e12;
      }

      .social-capture {
        display: grid;
        width: 1200px;
        height: 630px;
        grid-template-columns: minmax(0, 1fr) 476px;
        align-items: center;
        gap: 58px;
        padding: 62px 72px;
        background: #0b0e12;
        color: #eef5f8;
      }

      .social-copy {
        align-self: center;
      }

      .social-copy .project-identity {
        max-width: 520px;
        gap: 12px;
      }

      .social-copy .project-kicker {
        color: #72d9f4;
        font: 700 13px/1.3 monospace;
        letter-spacing: 0.14em;
      }

      .social-copy h1 {
        margin: 0;
        font: 650 66px/0.98 sans-serif;
        letter-spacing: -0.045em;
      }

      .social-copy #project-description {
        margin: 8px 0 0;
        color: #c1cbd3;
        font: 400 22px/1.45 sans-serif;
      }

      .social-method {
        max-width: 500px;
        margin: 28px 0 0;
        color: #8695a1;
        font: 400 16px/1.5 sans-serif;
      }

      .social-boundaries {
        display: flex;
        gap: 26px;
        margin-top: 30px;
        color: #c1cbd3;
        font: 600 14px/1.2 monospace;
      }

      .social-boundaries > span {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .social-boundary {
        display: block;
        width: 38px;
        height: 0;
        border-top: 2px solid #eef5f8;
      }

      .social-boundary--srgb {
        border-top-color: #72d9f4;
        border-top-style: dashed;
      }

      .social-visual {
        width: 476px;
        padding: 18px;
        border: 1px solid #33404b;
        background: #111820;
      }

      .social-visual .color-plane {
        width: 438px;
        padding-left: 24px;
      }

      .social-visual .color-plane__surface {
        border-color: #43515c;
      }
    `,
  });

  await expect(page.locator(".social-capture")).toHaveCSS("width", "1200px");
  await expect(page.locator(".social-visual [data-gamut-boundary]")).toHaveCount(2);
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".social-visual canvas");
    return Boolean(canvas && canvas.width >= 400 && canvas.height >= 400);
  });
  const clipping = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    return [...document.querySelectorAll<HTMLElement>(".social-capture *")].some((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left < 0 ||
        bounds.top < 0 ||
        bounds.right > viewport.width ||
        bounds.bottom > viewport.height
      );
    });
  });
  expect(clipping).toBe(false);

  await page.screenshot({
    path: socialImagePath,
    animations: "disabled",
  });

  await page.setContent(`
    <main style="display:flex;align-items:center;gap:24px;width:max-content;padding:20px;background:#eef5f8">
      <img src="/favicon.svg" width="16" height="16" alt="Gamut Plane favicon at 16 pixels" />
      <img src="/favicon.svg" width="32" height="32" alt="Gamut Plane favicon at 32 pixels" />
    </main>
  `);
  await expect(page.getByAltText("Gamut Plane favicon at 16 pixels")).toHaveJSProperty(
    "naturalWidth",
    64,
  );
  await expect(page.getByAltText("Gamut Plane favicon at 32 pixels")).toHaveJSProperty(
    "naturalWidth",
    64,
  );
  await page.locator("main").screenshot({ path: faviconPreviewPath });
});
