import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
});

window.requestAnimationFrame ??= (callback) => window.setTimeout(callback, 0);
window.cancelAnimationFrame ??= (handle) => window.clearTimeout(handle);
window.scrollTo = vi.fn();

Element.prototype.scrollIntoView ??= vi.fn();

class TestResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: TestResizeObserver,
});

const canvasGradient = { addColorStop: vi.fn() };
const canvasContext = {
  clearRect: vi.fn(),
  createLinearGradient: vi.fn(() => canvasGradient),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: "",
  getContextAttributes: vi.fn(() => ({ colorSpace: "srgb" })),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray() })),
  setTransform: vi.fn(),
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(() => canvasContext),
});

Object.defineProperties(URL, {
  createObjectURL: {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:chromavert-test"),
  },
  revokeObjectURL: {
    configurable: true,
    writable: true,
    value: vi.fn(),
  },
});
