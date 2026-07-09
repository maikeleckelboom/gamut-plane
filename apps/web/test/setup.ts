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
