import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, vi } from "vitest";
import { GamutPlane, type GamutPlaneProps, type OklchColor } from "../src/index.js";

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
export const initial: OklchColor = Object.freeze({ l: 0.62, c: 0.2, h: 45, alpha: 0.37 });
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
export async function host(options: Partial<GamutPlaneProps> = {}) {
  const changes = vi.fn<(color: OklchColor) => void>();
  const commits = vi.fn<(color: OklchColor) => void>();
  const cancels = vi.fn<() => void>();
  const order: string[] = [];
  let replace: (color: OklchColor) => void = () => {};
  function Host() {
    const [value, setValue] = useState(options.value ?? initial);
    replace = setValue;
    return createElement(GamutPlane, {
      ...options,
      value,
      onValueChange: (next) => {
        changes(next);
        order.push("change");
        setValue({ ...next });
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
    replace: async (value: OklchColor) => {
      await act(async () => replace(value));
    },
  };
}
