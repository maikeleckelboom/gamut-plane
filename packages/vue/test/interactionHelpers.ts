import { vi } from "vitest";

export function installAnimationFrameController() {
  let nextId = 1;
  let cancellationCount = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    if (callbacks.delete(id)) cancellationCount += 1;
  });
  return {
    get pendingCount() {
      return callbacks.size;
    },
    get cancellationCount() {
      return cancellationCount;
    },
    flush(): void {
      const scheduled = [...callbacks.entries()];
      for (const [id, callback] of scheduled) {
        if (callbacks.delete(id)) callback(0);
      }
    },
  };
}

export function dispatchPointer(
  element: Element,
  type: string,
  init: number | Partial<PointerEventInit>,
): void {
  const options = typeof init === "number" ? { pointerId: init } : init;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 0,
    clientY: 0,
    pointerType: "mouse",
    button: type === "pointermove" ? -1 : 0,
    buttons: ["pointerup", "pointercancel", "lostpointercapture"].includes(type) ? 0 : 1,
    ...options,
  });
  element.dispatchEvent(event);
}
