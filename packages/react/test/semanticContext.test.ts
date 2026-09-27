import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPlaneGesture } from "@gamut-plane/ui";
import { semanticContextKey as reactKey } from "../src/model/acceptedResolution.js";
import { semanticContextKey as vueKey } from "../../vue/src/model/acceptedResolution.js";
import { frames } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
describe.each([
  ["React", reactKey],
  ["Vue", vueKey],
] as const)("%s semantic context", (_name, key) => {
  it("interrupts a queued gesture on a same-representation editor change with equal source", async () => {
    const clock = frames();
    const source = Object.freeze({ l: 0.5 });
    let selection = { representationId: "oklch", editorId: "oklch-lc" };
    const change = vi.fn(),
      commit = vi.fn(),
      cancel = vi.fn(),
      author = vi.fn(() => source);
    const surface = document.createElement("div");
    const gesture = mountPlaneGesture(surface, () => ({
      value: source,
      viewKey: key(selection),
      pointFromPointer: () => ({ x: 0.5, y: 0.5 }),
      authorPoint: author,
      definingEquals: (a, b) => a.l === b.l,
      onPointerStart: () => {},
      onPointerEnd: () => {},
      onPreviewPoint: () => {},
      onValueChange: change,
      onCommit: commit,
      onCancel: cancel,
      onRestorePresentation: () => {},
    }));
    surface.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1 }));
    expect(gesture.hasPendingPoint).toBe(true);
    selection = { representationId: "oklch", editorId: "test-only-alternate-editor" };
    gesture.reconcile();
    await clock.flush();
    surface.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(author).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(key(selection)).not.toBe(key({ ...selection, representationId: "oklab" }));
    gesture.dispose();
  });
});
