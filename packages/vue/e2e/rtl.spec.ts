import { expect, test } from "@playwright/test";

test("RTL hosts retain scientific coordinate and native range direction in both Vue views", async ({
  page,
}) => {
  await page.goto("/?single");
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
    for (const range of await page.locator('[data-picker-control] [type="range"]').all()) {
      await expect(range).toHaveCSS("direction", "ltr");
      const before = Number(await range.inputValue());
      await range.press("ArrowRight");
      expect(Number(await range.inputValue())).toBeGreaterThan(before);
    }
  }
});
