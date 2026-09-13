import { vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((media: string) => ({
    media,
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
export const observers = new Set<ResizeObserverCallback>();
class TestResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    observers.add(this.callback);
  }
  unobserve() {}
  disconnect() {
    observers.delete(this.callback);
  }
}
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: TestResizeObserver,
});
function context() {
  return {
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
    getContextAttributes: () => ({ colorSpace: "srgb" }),
  };
}
const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof context>>();
export function canvasContext(canvas: HTMLCanvasElement) {
  let value = contexts.get(canvas);
  if (!value) {
    value = context();
    contexts.set(canvas, value);
  }
  return value;
}
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(function (this: HTMLCanvasElement) {
    return canvasContext(this);
  }),
});
Object.defineProperties(HTMLElement.prototype, {
  clientWidth: {
    configurable: true,
    get() {
      return 320;
    },
  },
  clientHeight: {
    configurable: true,
    get() {
      return 320;
    },
  },
  offsetWidth: {
    configurable: true,
    get() {
      return 320;
    },
  },
  offsetHeight: {
    configurable: true,
    get() {
      return 320;
    },
  },
  getBoundingClientRect: {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 320,
      width: 320,
      height: 320,
      toJSON: () => ({}),
    }),
  },
});
const captures = new WeakMap<Element, number>();
Object.defineProperties(Element.prototype, {
  setPointerCapture: {
    configurable: true,
    value: function (this: Element, id: number) {
      captures.set(this, id);
    },
  },
  hasPointerCapture: {
    configurable: true,
    value: function (this: Element, id: number) {
      return captures.get(this) === id;
    },
  },
  releasePointerCapture: {
    configurable: true,
    value: function (this: Element) {
      captures.delete(this);
    },
  },
});
