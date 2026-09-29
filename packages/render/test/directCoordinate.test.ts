import { expect, it } from "vitest";
import {
  createColorValue,
  represent,
  convertOklabToOklch,
  serializeOklchSample,
} from "@gamut-plane/core";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { currentField } from "../src/current/field.js";
import { currentEditableDetail } from "../src/current/editableDetail.js";

it.each([
  [0.1, -0.2],
  [0, 0],
  [0.39, 0.02],
  [0.5, 0.1],
  [0.1, 0.5],
])("samples a/b gradients on the supplied core slice at %s, %s", (a, b) => {
  const created = createColorValue({ space: "oklab", channels: [0.68, a!, b!], alpha: 0.37 });
  if (!created.ok) throw Error("fixture");
  const editor = resolveEditorVisualSupport("oklab-ab");
  const observed = represent(created.value, "oklch");
  if (!observed.ok) throw Error("fixture");
  const detail = currentEditableDetail(
    currentField(editor, resolveField(created.value, editor)),
    observed.value,
  );
  if (detail.view !== "oklab") throw Error("fixture");
  for (const coordinate of ["a", "b"] as const) {
    const { range, gradient } = detail.coordinates[coordinate];
    if (!range) {
      expect(gradient).toBe("none");
      continue;
    }
    for (const position of [0, 0.5, 1]) {
      const scalar = range.min + position * (range.max - range.min);
      const [l, c, h] = convertOklabToOklch([
        0.68,
        coordinate === "a" ? scalar : a!,
        coordinate === "b" ? scalar : b!,
      ]);
      const css = serializeOklchSample({
        l: l!,
        c: Number(c!.toPrecision(12)),
        h: Number(h!.toPrecision(12)),
        alpha: 0.37,
      });
      expect(gradient).toContain(`${css} ${(position * 100).toFixed(3)}%`);
    }
  }
});
