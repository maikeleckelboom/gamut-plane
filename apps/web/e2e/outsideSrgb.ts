import type { Locator } from "@playwright/test";

/** The app starts inside sRGB; states that need an excursion enter chroma beyond its boundary. */
export async function moveOutsideSrgb(root: Locator): Promise<void> {
  const chroma = root.getByLabel("Chroma numeric value");
  await chroma.fill("0.18");
  await chroma.press("Enter");
}
