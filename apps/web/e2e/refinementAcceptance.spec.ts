import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = resolve(
  process.env.GAMUT_PLANE_REFINEMENT_EVIDENCE ?? "test-results/refinement",
  process.platform,
);

for (const width of [320, 390]) {
  for (const enlarged of [false, true]) {
    test(`numeric focus at ${width}px${enlarged ? " with 200% text" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto("/");
      if (enlarged) await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
      const root = page.locator("[data-gp-root]");
      const hue = root.getByRole("spinbutton", { name: "Hue numeric value" });
      await hue.fill("359.9");
      await hue.press("Enter");
      await mkdir(evidence, { recursive: true });
      const suffix = `${width}-${enlarged ? "enlarged" : "normal"}`;
      await root.screenshot({ path: resolve(evidence, `hue-focus-${suffix}.png`) });
      const hueMetrics = await hue.evaluate((input: HTMLInputElement) => {
        const wrapper = input.parentElement!;
        const unit = wrapper.querySelector(".gp-channel-unit")!;
        const valueBox = wrapper.getBoundingClientRect();
        const unitBox = unit.getBoundingClientRect();
        const style = getComputedStyle(input);
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = style.font;
        return {
          unitInset: valueBox.right - unitBox.right,
          fits: canvas.measureText(input.value).width <= input.clientWidth,
          inputOutline: style.outlineStyle,
          valueOutline: getComputedStyle(wrapper).outlineStyle,
        };
      });
      const card = root.locator('[data-gp-control="card"]').first();
      const number = card.getByRole("spinbutton");
      await number.focus();
      await expect(number).toBeFocused();
      await root.screenshot({ path: resolve(evidence, `card-focus-${suffix}.png`) });
      const cardMetrics = await card.evaluate((element) => ({
        outline: getComputedStyle(element).outlineStyle,
        inputOutline: getComputedStyle(element.querySelector("input")!).outlineStyle,
        overflow: element.scrollWidth - element.clientWidth,
      }));
      await writeFile(
        resolve(evidence, `numeric-${suffix}.json`),
        JSON.stringify({ hueMetrics, cardMetrics }, null, 2),
      );
      expect(hueMetrics).toMatchObject({ fits: true, inputOutline: "none", valueOutline: "solid" });
      expect(hueMetrics.unitInset).toBeGreaterThanOrEqual(4);
      expect(cardMetrics).toEqual({ outline: "solid", inputOutline: "none", overflow: 0 });
      expect(await root.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
      await page.emulateMedia({ forcedColors: "active" });
      await expect(card).toHaveCSS("outline-style", "solid");
      await root.screenshot({ path: resolve(evidence, `card-forced-colors-${suffix}.png`) });
      await hue.focus();
      await expect(hue.locator("..")).toHaveCSS("outline-style", "solid");
    });
  }

  for (const enlarged of [false, true])
    for (const state of ["outside", "unchecked", "unavailable", "paused"] as const) {
      test(`expanded Gamut references ${state} at ${width}px${enlarged ? " with 200% text" : ""}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(
          `/e2e/fixtures/selectionShell.html${state === "unavailable" ? "?unavailable" : ""}`,
        );
        await page.evaluate((enlarged) => {
          document.body.style.margin = "12px";
          if (enlarged) document.documentElement.style.fontSize = "200%";
        }, enlarged);
        const root = page.locator("#instrument [data-gp-root]");
        if (state === "paused") await page.getByRole("button", { name: "Set observation" }).click();
        const trigger = root.getByRole("button", { name: "Gamut references" });
        const dialog = root.getByRole("dialog", { name: "Gamut references" });
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(dialog).toBeVisible();
        await expect(trigger).toBeFocused();
        const srgb = dialog.getByRole("group", { name: "sRGB", exact: true });
        if (state === "unchecked") {
          await srgb.getByRole("checkbox", { name: "sRGB Status" }).uncheck();
          await expect(srgb).toHaveAccessibleDescription("Status off");
          await expect(srgb.locator('[data-gp-part="exact-result"]')).toHaveCount(0);
        } else if (state === "unavailable") {
          await expect(dialog.locator('[data-gp-status="unavailable"]')).not.toHaveCount(0);
        } else {
          await expect(srgb).toHaveAccessibleDescription("Outside");
          await expect(srgb.getByRole("checkbox", { name: "sRGB Status" })).toBeChecked();
        }
        if (state === "paused") {
          for (const label of ["sRGB", "Display P3"]) {
            const boundary = dialog.getByRole("checkbox", { name: `${label} Boundary` });
            await expect(boundary).toBeChecked();
            await expect(boundary).toHaveAccessibleDescription(/paused/i);
          }
          await expect(dialog.locator(".gp-boundary-paused")).toHaveCount(2);
        }
        await trigger.focus();
        await page.keyboard.press("Tab");
        await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(srgb.getByRole("checkbox", { name: "sRGB Status" })).toBeFocused();
        const metrics = await dialog.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            overflow: element.scrollWidth - element.clientWidth,
            viewport: [innerWidth, innerHeight],
            childrenFit: [
              ...element.querySelectorAll("label, .gp-gamut-status, .gp-boundary-paused"),
            ].every((child) => {
              const rect = child.getBoundingClientRect();
              return rect.left >= box.left && rect.right <= box.right;
            }),
          };
        });
        expect(metrics.left).toBeGreaterThanOrEqual(8);
        expect(metrics.right).toBeLessThanOrEqual(width - 8);
        expect(metrics.top).toBeGreaterThanOrEqual(8);
        expect(metrics.bottom).toBeLessThanOrEqual(836);
        expect(metrics.overflow).toBe(0);
        expect(metrics.childrenFit).toBe(true);
        const violations = (await new AxeBuilder({ page }).include("#instrument").analyze())
          .violations;
        expect(violations).toEqual([]);
        await mkdir(evidence, { recursive: true });
        await page.screenshot({
          path: resolve(evidence, `popup-${state}-${width}${enlarged ? "-enlarged" : ""}.png`),
        });
        await writeFile(
          resolve(evidence, `popup-${state}-${width}${enlarged ? "-enlarged" : ""}.json`),
          JSON.stringify(
            { metrics, violations, accessibility: await dialog.ariaSnapshot() },
            null,
            2,
          ),
        );
        const lastReference = dialog.getByRole("radio", { name: "None", exact: true });
        await lastReference.focus();
        await expect(lastReference).toBeFocused();
        const referenceFits = await lastReference.evaluate((element) => {
          const option = element.getBoundingClientRect();
          const popup = element.closest('[role="dialog"]')!.getBoundingClientRect();
          return option.top >= popup.top && option.bottom <= popup.bottom;
        });
        expect(referenceFits).toBe(true);
        if (enlarged)
          await page.screenshot({
            path: resolve(evidence, `popup-${state}-${width}-enlarged-reference-focus.png`),
          });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
      });
    }
}
