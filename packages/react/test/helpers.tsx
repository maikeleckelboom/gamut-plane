import { act, createElement, useLayoutEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, vi } from "vitest";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneProps, type GamutPlaneState } from "../src/index.js";

const roots = new Set<Root>();
afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount();
  });
  roots.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
export async function mount(node: ReactNode) {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  roots.add(root);
  await act(async () => root.render(node));
  return {
    element,
    render: async (next: ReactNode) => {
      await act(async () => root.render(next));
    },
    schedule: (next: ReactNode) => root.render(next),
    unmount: async () => {
      await act(async () => root.unmount());
      roots.delete(root);
    },
  };
}
export function get<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw Error(`Missing ${selector}`);
  return element;
}
export function color(l: number, c: number, h: number | null, alpha: number): ColorValue {
  const result = createColorValue({ space: "oklch", channels: [l, c, h], alpha });
  if (!result.ok) throw new Error("Invalid test color");
  return result.value;
}
export const initial = color(0.62, 0.2, 45, 0.37);
export function editingState(representationId: "oklch" | "oklab"): GamutPlaneState {
  return {
    selection:
      representationId === "oklch"
        ? { representationId: "oklch", editorId: "oklch-lc" }
        : { representationId: "oklab", editorId: "oklab-ab" },
    checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
    referenceGamutId: null,
    visibleGuides: ["display-p3-boundary", "srgb-boundary"],
  };
}
export async function selectRepresentation(root: ParentNode, representationId: string) {
  await act(async () => get<HTMLButtonElement>(root, '[role="combobox"]').click());
  await act(async () =>
    get<HTMLElement>(root, `[role="option"][data-value="${representationId}"]`).click(),
  );
}
export async function event(
  element: Element,
  type: string,
  init: KeyboardEventInit & PointerEventInit = {},
) {
  await act(async () => {
    const native = type.startsWith("key")
      ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
      : type.includes("pointer")
        ? new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "mouse",
            ...init,
          })
        : new Event(type, { bubbles: true, cancelable: true });
    element.dispatchEvent(native);
  });
}
export async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
export function frames() {
  let id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending.set(++id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
    pending.delete(handle);
  });
  return {
    get size() {
      return pending.size;
    },
    async flush() {
      await act(async () => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(0));
      });
    },
  };
}
export async function host(options: Partial<GamutPlaneProps> = {}, controlledSelection = false) {
  const changes = vi.fn<(color: ColorValue) => void>();
  const commits = vi.fn<(color: ColorValue) => void>();
  const cancels = vi.fn<() => void>();
  const order: string[] = [];
  let replace: (color: ColorValue) => void = () => {};
  let selected = options.value ?? initial;
  let acceptState: (state: GamutPlaneState) => void = () => {};
  function Host() {
    const [value, setValue] = useState(options.value ?? initial);
    const [state, setState] = useState(
      options.state ?? options.defaultState ?? editingState("oklch"),
    );
    acceptState = setState;
    useLayoutEffect(() => {
      selected = value;
    });
    replace = setValue;
    return createElement(GamutPlane, {
      ...options,
      ...(controlledSelection ? { state, onStateChange: setState } : {}),
      value,
      onValueChange: (next) => {
        changes(next);
        order.push("change");
        const rebuilt = createColorValue(definitionOf(next));
        if (!rebuilt.ok) throw new Error("Invalid controlled feedback");
        setValue(rebuilt.value);
      },
      onValueCommit: (next) => {
        commits(next);
        order.push("commit");
      },
      onCancel: () => {
        cancels();
        order.push("cancel");
      },
    });
  }
  const mounted = await mount(createElement(Host));
  return {
    ...mounted,
    changes,
    commits,
    cancels,
    order,
    current: () => selected,
    acceptState: async (state: GamutPlaneState) => {
      if (!controlledSelection) throw Error("Host must own accepted state");
      await act(async () => acceptState(state));
    },
    replace: async (value: ColorValue) => {
      await act(async () => replace(value));
    },
  };
}
