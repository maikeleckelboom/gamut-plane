import { expect, test, type Page } from "@playwright/test";

async function openProductionInstrument(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Gamut Plane" })).toBeVisible();
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  return errors;
}

test("production metadata, assets, and static headers are complete", async ({ page, request }) => {
  const errors = await openProductionInstrument(page);
  expect(errors).toEqual([]);

  await expect(page).toHaveTitle("Gamut Plane");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Inspect and edit OKLab and OKLCH color planes/,
  );
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#111316");
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "Gamut Plane",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Gamut Plane");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const favicon = await request.get("/favicon.svg");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");

  const socialImage = await request.get("/og/gamut-plane.png");
  expect(socialImage.ok()).toBe(true);
  expect(socialImage.headers()["content-type"]).toContain("image/png");

  const documentResponse = await request.get("/");
  expect(documentResponse.headers()["cache-control"]).toBe("no-cache");
  expect(documentResponse.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(documentResponse.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(documentResponse.headers()["permissions-policy"]).toContain("camera=()");
  expect(documentResponse.headers()["referrer-policy"]).toBe("no-referrer");
  expect(documentResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect(documentResponse.headers()["x-frame-options"]).toBe("DENY");

  const assetPath = await page.locator('script[type="module"]').getAttribute("src");
  expect(assetPath).toMatch(/^\/assets\/.+-[A-Za-z0-9_-]{8}\.js$/);
  const assetResponse = await request.get(assetPath!);
  expect(assetResponse.headers()["cache-control"]).toBe("public, max-age=31556952, immutable");
  expect((await request.get("/_headers")).status()).toBe(404);
});

test("the production build preserves both planes, input, and responsive semantics", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4178",
  });
  const errors = await openProductionInstrument(page);
  const surface = page.getByRole("application", { name: /OKLCH plane/ });
  await expect(surface).toBeVisible();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);

  const p3Copy = page.locator('[data-copy-representation="display-p3"]');
  await expect(p3Copy).toHaveAccessibleName("Copy Display P3 CSS value");
  await p3Copy.click();
  await expect(p3Copy).toHaveText("Copied");
  await expect(p3Copy).toHaveAccessibleName("Copied Display P3 CSS value");
  await expect(page.getByRole("button", { name: "Copy sRGB CSS value" })).toBeDisabled();

  const channels = page.locator(".channel-values");
  const beforeKeyboard = await channels.textContent();
  await surface.focus();
  await surface.press("ArrowRight");
  await expect(channels).not.toHaveText(beforeKeyboard ?? "");

  const beforePointer = await channels.textContent();
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.4);
  await expect(channels).not.toHaveText(beforePointer ?? "");

  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(page.getByRole("application", { name: /OKLab a\/b plane/ })).toBeVisible();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
