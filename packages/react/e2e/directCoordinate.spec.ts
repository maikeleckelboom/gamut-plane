import { expect, test } from "./browserFixture";
import { createColorValue, represent, type ColorRepresentation } from "@gamut-plane/core";

test("packed OKLab controls author a coordinate and reconcile the sibling slice", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: /^OKLab/ }).click();
  await expect(root).toHaveAttribute("data-active-plane", "oklab");
  const definition = () =>
    page
      .locator("[data-definition]")
      .evaluate(
        (element) => JSON.parse(element.getAttribute("data-definition")!) as ColorRepresentation,
      );
  const before = await definition();
  const value = createColorValue(before);
  if (!value.ok) throw new Error("Packed host authored color is invalid");
  const observed = represent(value.value, "oklab");
  if (!observed.ok) throw new Error("Packed host OKLab observation is unavailable");
  const a = root.getByRole("spinbutton", { name: "OKLab a numeric value", exact: true });
  const b = root.getByRole("spinbutton", { name: "OKLab b numeric value", exact: true });
  const previousBound = await b.getAttribute("max");
  const number = root.getByRole("spinbutton", { name: "OKLab a numeric value" });
  await number.fill("0.1");
  await number.press("Enter");
  expect(await definition()).toEqual({
    ...before,
    space: "oklab",
    channels: [observed.value.channels[0], 0.1, observed.value.channels[2]],
  });
  await expect(b).not.toHaveAttribute("max", previousBound!);
  await a.fill((await a.getAttribute("max"))!);
  await a.press("Enter");
  expect((await definition()).channels[1]).toBe(Number(await a.getAttribute("max")));
  expect((await definition()).channels[2]).toBe(observed.value.channels[2]);
  expect((await definition()).alpha).toBe(before.alpha);
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
});
