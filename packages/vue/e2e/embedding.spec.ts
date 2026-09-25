import { expect, test, type Locator, type Page } from "@playwright/test";

async function openHost(page: Page, hidden = false) {
  await page.goto(`/${hidden ? "?hidden" : ""}`);
  const first = page.locator('[data-host="first"]');
  const second = page.locator('[data-host="second"]');
  await expect(second.locator("[data-render-color-space]")).not.toHaveAttribute(
    "data-render-color-space",
    "pending",
  );
  return { first, second };
}

async function color(host: Locator) {
  return JSON.parse(await host.locator("[data-color]").innerText()) as {
    l: number;
    c: number;
    h: number;
    alpha: number;
  };
}

test("both installed instruments paint visible fields", async ({ page }) => {
  const { first, second } = await openHost(page);
  for (const host of [first, second]) {
    const canvas = host.locator("canvas");
    await canvas.scrollIntoViewIfNeeded();
    const screenshot = `data:image/png;base64,${(await canvas.screenshot()).toString("base64")}`;
    const [light, dark] = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const readback = document.createElement("canvas");
      readback.width = image.width;
      readback.height = image.height;
      const context = readback.getContext("2d")!;
      context.drawImage(image, 0, 0);
      // The far-right field has no boundary lines or markers at these heights.
      return [0.1, 0.9].map((y) => [
        ...context.getImageData(image.width * 0.9, image.height * y, 1, 1).data,
      ]);
    }, screenshot);
    // Bitmap readback can succeed while the composed field is a uniform background.
    expect(light![3]).toBe(255);
    expect(dark![3]).toBe(255);
    expect(light![0]! + light![1]! + light![2]!).toBeGreaterThan(dark![0]! + dark![1]! + dark![2]!);
  }
});

test("plane markers cover guides while the slider preview keeps authored alpha", async ({
  page,
}) => {
  const { first } = await openHost(page);
  await page.getByRole("button", { name: "Replace first color" }).click();
  const paintedAlpha = (selector: string) =>
    first.locator(selector).evaluate((element) => {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      const context = probe.getContext("2d")!;
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3] ?? 0;
    });

  await expect(first.locator('[data-marker-role="target-boundary-projection"]')).toHaveCount(1);
  expect(await paintedAlpha('[data-marker-role="target-boundary-projection"]')).toBe(255);
  expect(await paintedAlpha('[data-marker-role="active-color"]')).toBe(255);
  expect((await paintedAlpha("[data-slider-boundary-preview]")) / 255).toBeCloseTo(0.3, 2);
  expect((await color(first)).alpha).toBe(0.3);
});

test("minimal and controlled instances keep independent color, view, IDs and host styling", async ({
  page,
}) => {
  const { first, second } = await openHost(page);
  for (const host of [first, second]) {
    await expect
      .poll(() =>
        host
          .locator("canvas")
          .evaluate(
            (canvas: HTMLCanvasElement) =>
              canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1)
                .data[3],
          ),
      )
      .toBe(255);
  }
  const initial = await color(first);
  const before = await first
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await first.getByRole("radio", { name: "OKLab", exact: true }).click();
  await expect(first.locator("[data-picker-plane]")).toHaveAttribute("data-plane-id", "oklab");
  await expect
    .poll(() => first.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()))
    .not.toBe(before);
  expect(await color(first)).toEqual(initial);
  await expect(second.locator("[data-picker-plane]")).toHaveAttribute("data-plane-id", "oklch");
  await page.getByRole("button", { name: "Parent view" }).click();
  await expect(second.locator("[data-picker-plane]")).toHaveAttribute("data-plane-id", "oklab");
  await second.getByRole("radio", { name: "OKLCH", exact: true }).click();
  await expect(second.locator("[data-plane]")).toHaveText("oklch");
  await expect(first.locator("[data-picker-plane]")).toHaveAttribute("data-plane-id", "oklab");
  const firstColorBeforeTarget = await color(first);
  await page.getByRole("button", { name: "Parent boundary target" }).click();
  await expect(first.locator("[data-boundary-target-result]")).toHaveAttribute(
    "data-boundary-target",
    "display-p3",
  );
  await expect(first.locator("[data-boundary-target-output]")).toHaveText("display-p3");
  expect(await color(first)).toEqual(firstColorBeforeTarget);
  await first.getByRole("spinbutton", { name: "OKLab a numeric value" }).fill("-0.1");
  await first.getByRole("spinbutton", { name: "OKLab a numeric value" }).press("Enter");
  expect(await color(first)).not.toEqual(initial);
  expect(await color(second)).toEqual(initial);
  await expect(first.getByRole("spinbutton", { name: "OKLab a numeric value" })).toBeFocused();
  expect(await second.locator(":focus").count()).toBe(0);
  const associations = await page.locator("[data-plane-instrument]").evaluateAll((roots) => {
    const ids = roots.flatMap((root) =>
      [...root.querySelectorAll("[id]")].map((element) => element.id),
    );
    const references = roots.flatMap((root) =>
      [root, ...root.querySelectorAll("[for], [aria-labelledby], [aria-describedby]")].flatMap(
        (element) =>
          ["for", "aria-labelledby", "aria-describedby"].flatMap((attribute) =>
            (element.getAttribute(attribute) ?? "").split(" ").filter(Boolean),
          ),
      ),
    );
    return {
      unique: new Set(ids).size === ids.length,
      resolved: references.every((id) => ids.filter((value) => value === id).length === 1),
    };
  });
  expect(associations).toEqual({ unique: true, resolved: true });
  const stableIds = await page
    .locator("[data-plane-instrument] [id]")
    .evaluateAll((elements) => elements.map((element) => element.id));
  await page.getByRole("button", { name: "Toggle surroundings" }).click();
  expect(
    await page
      .locator("[data-plane-instrument] [id]")
      .evaluateAll((elements) => elements.map((element) => element.id)),
  ).toEqual(stableIds);
  expect(
    await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).getPropertyValue("--foreground").trim()),
  ).toBe("rebeccapurple");
  await expect(page.getByRole("button", { name: "Parent view" })).toHaveCSS(
    "color",
    "rgb(102, 51, 153)",
  );
  const hostInput = page.getByRole("spinbutton", { name: "Host width" });
  await expect(hostInput).toHaveCSS("border-top-width", "2px");
  await expect(hostInput).toHaveCSS("background-color", "rgb(238, 238, 238)");
  await expect(hostInput).toHaveCSS("font-family", "Georgia, serif");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "normal");
  await expect(page.locator("body")).toHaveCSS("margin-top", "16px");
  await expect(page.locator("[data-host-collision]")).toHaveCSS("position", "static");
  await expect(page.locator("[data-host-collision]")).toHaveCSS("pointer-events", "auto");
  await hostInput.focus();
  await expect(hostInput).toBeFocused();
  expect(await first.locator(":focus").count()).toBe(0);
});

for (const [name, value] of [
  ["Hue", "213.50"],
  ["Lightness", "0.7350"],
  ["Chroma", "0.5230"],
]) {
  test(`${name} draft completes once across Enter/change/blur and allows the next edit`, async ({
    page,
  }) => {
    const { first } = await openHost(page);
    const input = first.getByRole("spinbutton", { name: `${name} numeric value`, exact: true });
    const initial = await color(first);
    await input.click();
    await input.press("ControlOrMeta+A");
    await input.press("Backspace");
    await input.pressSequentially(value!);
    await expect(input).toHaveValue(value!);
    expect(await color(first)).toEqual(initial);
    await input.press("Enter");
    await input.press("Tab");
    await expect(first.locator("[data-commits]")).toHaveText("1");
    expect((await color(first)).alpha).toBe(initial.alpha);
    await input.fill(name === "Hue" ? "121" : "0.25");
    await input.press("Tab");
    await expect(first.locator("[data-commits]")).toHaveText("2");
  });
}

test("OKLab negative decimal drafts, invalid input, Escape and subsequent edits", async ({
  page,
}) => {
  const { first } = await openHost(page);
  await first.getByRole("radio", { name: "OKLab", exact: true }).click();
  for (const coordinate of ["a", "b"]) {
    const input = first.getByRole("spinbutton", { name: `OKLab ${coordinate} numeric value` });
    const initial = await color(first);
    await input.click();
    await input.press("ControlOrMeta+A");
    await input.press("Backspace");
    await input.pressSequentially("-0.");
    await input.pressSequentially("1250");
    await expect(input).toHaveValue("-0.1250");
    expect(await color(first)).toEqual(initial);
    await input.press("Enter");
    await input.press("Tab");
    const committed = await color(first);
    expect(committed.alpha).toBe(0.7);
    expect(committed.l).toBe(0.5);
    await input.fill("");
    await input.pressSequentially("-");
    await input.press("Tab");
    expect(await color(first)).toEqual(committed);
    await input.fill("0.3");
    await input.press("Escape");
    expect(await color(first)).toEqual(committed);
    await expect(page.locator("[data-escapes]")).toHaveText(coordinate === "a" ? "0" : "1");
    await input.press("Escape");
    await expect(page.locator("[data-escapes]")).toHaveText(coordinate === "a" ? "1" : "2");
  }
  await expect(first.locator("[data-commits]")).toHaveText("2");
});

test("active pointer cancellation restores reactive parent state and idle Escape reaches host", async ({
  page,
}) => {
  const { first } = await openHost(page);
  const surface = first.getByRole("application");
  await surface.scrollIntoViewIfNeeded();
  const initial = await color(first);
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.mouse.down();
  await expect.poll(() => color(first)).not.toEqual(initial);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await color(first)).toEqual(initial);
  await expect(first.locator("[data-commits]")).toHaveText("0");
  await expect(page.locator("[data-escapes]")).toHaveText("0");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-escapes]")).toHaveText("1");
});

test("resize, scrolling during capture and first reveal keep pointer geometry current", async ({
  page,
}) => {
  const { first } = await openHost(page, true);
  await expect(first.getByRole("application")).toBeHidden();
  await page.getByRole("button", { name: "Toggle first" }).click();
  const surface = first.getByRole("application");
  await expect(surface).toBeVisible();
  await page.getByRole("spinbutton", { name: "Host width" }).fill("430");
  await expect.poll(() => surface.evaluate((element) => element.clientWidth)).toBe(409);
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.locator(".host-scroll").evaluate((element) => {
    element.scrollTop += 60;
  });
  const moved = (await surface.boundingBox())!;
  await page.mouse.move(
    moved.x + 1 + (moved.width - 2) * 0.25,
    moved.y + 1 + (moved.height - 2) * 0.4,
  );
  await page.mouse.up();
  const selected = await color(first);
  expect(selected.c).toBeCloseTo(0.1, 2);
  expect(selected.l).toBeCloseTo(0.6, 2);
  expect(selected.alpha).toBe(0.7);
  await expect(first.locator('[data-picker-control="h"] input[type="range"]')).toHaveCSS(
    "cursor",
    "pointer",
  );
  const backing = await first.locator("canvas").evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    css: Math.round(canvas.getBoundingClientRect().width) * devicePixelRatio,
  }));
  expect(backing.width).toBe(backing.css);

  const hue = first.locator('[data-picker-control="h"] input[type="range"]');
  await hue.scrollIntoViewIfNeeded();
  const hueBox = (await hue.boundingBox())!;
  await page.mouse.move(hueBox.x + hueBox.width / 2, hueBox.y + hueBox.height / 2);
  await page.mouse.down();
  await expect(hue).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(hue).toHaveCSS("cursor", "pointer");

  await page.getByRole("button", { name: "Replace first color" }).click();
  const glyph = first.locator('[data-gamut-warning="planar"] svg');
  await expect(glyph).toBeVisible();
  await expect(glyph).toHaveAttribute("aria-hidden", "true");
  await expect(glyph.locator("path").first()).not.toHaveCSS("fill", "none");
  await expect(glyph.locator("path").last()).not.toHaveCSS("stroke", "none");
});

test("available width owns layout, including threshold edges, fallback, enlarged text and focus", async ({
  page,
}) => {
  const { first } = await openHost(page);
  const workspace = first.locator(".plane-instrument__workspace");
  for (const width of [280, 340, 623, 624, 625, 800]) {
    await page.getByRole("spinbutton", { name: "Host width" }).fill(String(width));
    await expect
      .poll(() =>
        workspace.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
        ),
      )
      .toBe(width >= 624 ? 2 : 1);
    expect(await first.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
  // Without a matching container the base layout must remain usable.
  await first.locator("[data-plane-instrument]").evaluate((element: HTMLElement) => {
    element.style.containerType = "normal";
    element.style.containerName = "none";
  });
  await expect(workspace).toHaveCSS("grid-template-columns", "800px");
  await first.locator("[data-plane-instrument]").evaluate((element: HTMLElement) => {
    element.style.removeProperty("container-type");
    element.style.removeProperty("container-name");
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(workspace).toHaveCSS("grid-template-columns", "800px");
  for (const dark of [false, true]) {
    if (dark) await page.getByRole("button", { name: "Toggle surroundings" }).click();
    await first.getByRole("radio", { name: "OKLCH", exact: true }).press("Tab");
    const surface = first.getByRole("application");
    await expect(surface).toBeFocused();
    await expect(surface).toHaveCSS("outline-style", "solid");
    expect(await first.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
  await page.getByRole("spinbutton", { name: "Host width" }).fill("340");
  expect(await first.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const hue = first.getByRole("spinbutton", { name: "Hue numeric value" });
  await hue.press("Tab");
  const range = first.locator('[data-picker-control="h"] input[type="range"]');
  await expect(range).toBeFocused();
  const start = (await color(first)).h;
  await range.press("ArrowRight");
  await expect.poll(async () => (await color(first)).h).toBeCloseTo(start + 0.1, 6);
});
