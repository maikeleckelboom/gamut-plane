import { gpAttribute } from "../parts.js";
import {
  hasOtherPointerOwner,
  onInstrumentPointerStart,
  setPointerOwnership,
} from "./pointerOwnership.js";
import { hasShellPopup } from "./shellPopup.js";

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

/** Structural camera pose. The render package's viewport satisfies it without UI importing it. */
export interface ViewportPose {
  readonly zoom: number;
  readonly center: ViewportPoint;
}

/**
 * Everything the controller needs from an adapter. Camera mathematics and presentation stay
 * behind these ports; this module owns only input policy and gesture lifecycle.
 */
export interface PlaneViewportPorts {
  /** The last coherently presented pose, the only pose input is interpreted against. */
  presented(): ViewportPose;
  /** Re-measures the surface. False while it cannot map input, such as when hidden or zero-sized. */
  measure(): boolean;
  /** Normalized viewport position of a client coordinate under the last measurement. */
  normalize(clientX: number, clientY: number): ViewportPoint | null;
  /** Displayed client-pixel size of the viewport under the last measurement. */
  extent(): Readonly<{ width: number; height: number }> | null;
  /** Requests anchored zoom, composed onto pending requests in call order. */
  zoomAt(anchor: ViewportPoint, factor: number): void;
  /** Requests a normalized-viewport pan of `origin`. */
  panFrom(origin: ViewportPose, displacement: ViewportPoint): void;
  /** Requests a normalized-viewport pan composed onto pending requests. */
  panBy(displacement: ViewportPoint): void;
  /** Presents a pose now, replacing pending requests. */
  show(pose: ViewportPose): void;
  /** Presents the canonical fit now, replacing pending requests. */
  fit(): void;
  /** Presents the requested pose now. */
  flush(): void;
  /** Drops requests that were never presented. */
  discardPending(): void;
  /** A plane or range color gesture is in progress; the camera must hold still. */
  colorGestureActive(): boolean;
}

export interface PlaneViewportBinding {
  /** A pointer pan is in progress. */
  readonly active: boolean;
  /** Space is armed for pan on the focused surface. */
  readonly spaceArmed: boolean;
  /**
   * Whether this pointerdown is viewport pan. The edit controller declines exactly these events;
   * both sides decide from the event and shared state, never from listener order.
   */
  claims(event: PointerEvent): boolean;
  /** Surface keydown routing before any color action. True when the camera consumed the key. */
  handleKey(event: KeyboardEvent): boolean;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Presents a render-resolved framing pose under the same ownership guard as Fit. */
  show(pose: ViewportPose): void;
  /** Cancels an active pan, restoring its origin pose only. */
  cancel(): boolean;
  /** Drops unpresented work and ends an active pan at the presented pose, for lifecycle changes. */
  interrupt(): boolean;
  dispose(): void;
}

export const VIEWPORT_BUTTON_ZOOM_FACTOR = 1.25;
export const VIEWPORT_KEY_PAN_STEP = 0.1;
export const VIEWPORT_KEY_PAN_STEP_COARSE = 0.25;
/** A continuous exponential scale: this many pixels of wheel delta double the magnification. */
export const WHEEL_PIXELS_PER_DOUBLING = 480;
export const WHEEL_LINE_PIXELS = 16;
/** Bounds one wheel event so a single malformed or enormous delta cannot jump the camera. */
export const WHEEL_DELTA_LIMIT_PIXELS = 240;

const CENTER: ViewportPoint = { x: 0.5, y: 0.5 };

/**
 * Normalizes `deltaY` to pixels. Page units use the displayed viewport height. Zero or
 * non-finite vertical deltas are ignored rather than reinterpreted as horizontal zoom.
 */
export function wheelDeltaPixels(
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
  pageHeight: number,
): number {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return 0;
  const scale = event.deltaMode === 1 ? WHEEL_LINE_PIXELS : event.deltaMode === 2 ? pageHeight : 1;
  const pixels = event.deltaY * (Number.isFinite(scale) && scale > 0 ? scale : 1);
  return Math.max(-WHEEL_DELTA_LIMIT_PIXELS, Math.min(WHEEL_DELTA_LIMIT_PIXELS, pixels));
}

/** Pan intent from the event and Space state alone. Wheel up (negative delta) zooms in. */
export function claimsViewportPan(event: PointerEvent, spaceArmed: boolean): boolean {
  if (event.pointerType !== "mouse") return false;
  return event.button === 1 || (event.button === 0 && spaceArmed);
}

const ARROW_DIRECTION: Record<string, ViewportPoint> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** Mount only from a client lifecycle; importing this module has no DOM effects. */
export function mountPlaneViewport(
  surface: HTMLElement,
  ports: PlaneViewportPorts,
): PlaneViewportBinding {
  const document = surface.ownerDocument;
  const view = document.defaultView!;
  const owner = {};
  let disposed = false;
  let armed = false;
  let pointerId: number | null = null;
  let initiating = 0;
  let origin: ViewportPose | null = null;
  let start: ViewportPoint = CENTER;
  let captured = false;
  // Document-level listeners exist only while needed: one set while Space is armed, one while a
  // pan owns the pointer. They end independently.
  let releaseArming: (() => void) | null = null;
  let releasePan: (() => void) | null = null;

  const popupOpen = () => {
    const root = surface.closest("[data-gp-root]");
    return root !== null && hasShellPopup(root);
  };
  const colorActive = () => ports.colorGestureActive();

  function setArmed(next: boolean): void {
    if (armed === next) return;
    armed = next;
    if (next) surface.setAttribute(gpAttribute.viewportArmed, "");
    else surface.removeAttribute(gpAttribute.viewportArmed);
  }

  function displacement(event: PointerEvent): ViewportPoint | null {
    // Adapters refresh invalidated bounds here, so scrolling a host keeps the grabbed field
    // point under the pointer instead of preserving a stale client-pixel origin.
    const point = ports.normalize(event.clientX, event.clientY);
    if (point === null) return null;
    const x = point.x - start.x;
    const y = point.y - start.y;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  /** Ends the sequence. It is inert afterwards: later movement and release cannot edit color. */
  function end(): void {
    const id = pointerId;
    pointerId = null;
    origin = null;
    releasePan?.();
    releasePan = null;
    setPointerOwnership(surface, false, owner);
    surface.removeAttribute(gpAttribute.viewportPanning);
    // Only a capture this binding acquired is released; an idle or foreign one is never touched.
    if (id !== null && captured) {
      captured = false;
      try {
        if (surface.hasPointerCapture?.(id)) surface.releasePointerCapture(id);
      } catch {
        // The browser already dropped it.
      }
    }
    captured = false;
  }

  function finish(event: PointerEvent | null): void {
    if (pointerId === null || origin === null) return;
    const delta = event ? displacement(event) : null;
    const from = origin;
    if (delta) ports.panFrom(from, delta);
    ports.flush();
    end();
  }

  function cancelPan(): boolean {
    if (pointerId === null || origin === null) return false;
    const restore = origin;
    end();
    ports.show(restore);
    return true;
  }

  function stopAtPresented(): boolean {
    const active = pointerId !== null;
    ports.discardPending();
    end();
    return active;
  }

  function disarm(): void {
    setArmed(false);
    releaseArming?.();
    releaseArming = null;
  }

  /** Space is armed while its key is down on the focused surface and ends with the key, the focus or the window. */
  function installArming(): void {
    if (releaseArming !== null) return;
    const keyup = (event: KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") return;
      disarm();
      // A Space-initiated pan ends where it is; the rest of this physical sequence is inert.
      if (pointerId !== null && initiating === 0) finish(null);
    };
    const lose = () => {
      disarm();
      stopAtPresented();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") lose();
    };
    document.addEventListener("keyup", keyup, true);
    view.addEventListener("blur", lose);
    document.addEventListener("visibilitychange", visibility);
    releaseArming = () => {
      document.removeEventListener("keyup", keyup, true);
      view.removeEventListener("blur", lose);
      document.removeEventListener("visibilitychange", visibility);
    };
  }

  /** A middle-button pan has no focused surface to hear Escape or window loss, so listen globally. */
  function installPan(): void {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pointerId === null) return;
      event.preventDefault();
      event.stopPropagation();
      cancelPan();
    };
    const lose = () => {
      stopAtPresented();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") lose();
    };
    document.addEventListener("keydown", keydown, true);
    view.addEventListener("blur", lose);
    document.addEventListener("visibilitychange", visibility);
    releasePan = () => {
      document.removeEventListener("keydown", keydown, true);
      view.removeEventListener("blur", lose);
      document.removeEventListener("visibilitychange", visibility);
    };
  }

  function down(event: PointerEvent): void {
    if (disposed || pointerId !== null || !claimsViewportPan(event, armed)) return;
    // Another controller already owns a sequence on this surface (an edit drag, a range): do not
    // take it over, and do not let this press become an edit either.
    if (colorActive() || hasOtherPointerOwner(surface, owner)) {
      event.preventDefault();
      return;
    }
    if (popupOpen()) return;
    event.preventDefault();
    if (!ports.measure()) return;
    // The initiating event is interpreted against what is on screen, not an unpresented zoom.
    ports.discardPending();
    const point = ports.normalize(event.clientX, event.clientY);
    if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    origin = ports.presented();
    start = point;
    initiating = event.button;
    pointerId = event.pointerId;
    setPointerOwnership(surface, true, owner);
    surface.setAttribute(gpAttribute.viewportPanning, "");
    try {
      surface.setPointerCapture?.(event.pointerId);
      captured = true;
    } catch {
      // Without capture the sequence cannot be followed reliably: unwind without authoring.
      end();
      return;
    }
    installPan();
  }

  function move(event: PointerEvent): void {
    if (disposed || pointerId !== event.pointerId || origin === null) return;
    // The initiating button's release can be a pointermove while another button remains held.
    const mask = initiating === 1 ? 4 : 1;
    if (event.pointerType === "mouse" && event.buttons > 0 && (event.buttons & mask) === 0) {
      finish(event);
      return;
    }
    // A secondary-button transition is context-menu intent, not pan movement.
    if (event.pointerType === "mouse" && event.button === 2) return;
    const delta = displacement(event);
    if (!delta) return;
    event.preventDefault();
    ports.panFrom(origin, delta);
  }

  function up(event: PointerEvent): void {
    if (disposed || pointerId !== event.pointerId) return;
    event.preventDefault();
    finish(event);
  }

  function lost(event: PointerEvent): void {
    if (pointerId === event.pointerId) cancelPan();
  }

  function wheel(event: WheelEvent): void {
    if (disposed || event.defaultPrevented || !event.cancelable) return;
    // Ordinary scroll and browser zoom (Ctrl/Cmd, including Alt chords) are never ours.
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (popupOpen()) return;
    if (!ports.measure()) return;
    const extentNow = ports.extent();
    const delta = wheelDeltaPixels(event, extentNow?.height ?? 0);
    if (delta === 0) return;
    // A valid claimed Alt-wheel is consumed even where the camera cannot move.
    event.preventDefault();
    if (colorActive() || pointerId !== null) return;
    const anchor = ports.normalize(event.clientX, event.clientY);
    if (anchor === null || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    ports.zoomAt(anchor, 2 ** (-delta / WHEEL_PIXELS_PER_DOUBLING));
  }

  function suppressMiddle(event: MouseEvent): void {
    if (disposed || event.button !== 1) return;
    // The browser's autoscroll and paste-on-middle-click belong to the pan this surface owns.
    event.preventDefault();
  }

  function command(factor: number | null): void {
    if (disposed || pointerId !== null || colorActive()) return;
    if (factor === null) ports.fit();
    else ports.zoomAt(CENTER, factor);
  }

  function handleKey(event: KeyboardEvent): boolean {
    if (disposed || event.isComposing) return false;
    if (event.key === "Escape") {
      if (pointerId === null) return false;
      event.preventDefault();
      event.stopPropagation();
      cancelPan();
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === " " || event.code === "Space") {
      if (!armed) {
        setArmed(true);
        installArming();
      }
      event.preventDefault();
      return true;
    }
    const direction = ARROW_DIRECTION[event.key];
    const holding = pointerId !== null || colorActive();
    if (armed && (direction || event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      if (direction && !holding && ports.measure()) {
        const step = event.shiftKey ? VIEWPORT_KEY_PAN_STEP_COARSE : VIEWPORT_KEY_PAN_STEP;
        // The camera moves toward the arrow, so content moves the other way.
        ports.panBy({ x: -direction.x * step, y: -direction.y * step });
      }
      return true;
    }
    if (pointerId !== null && (direction || event.key === "Home" || event.key === "End")) {
      // Color-authoring keys are inert while pan owns the pointer.
      event.preventDefault();
      return true;
    }
    const zoom =
      event.key === "+" || event.key === "="
        ? VIEWPORT_BUTTON_ZOOM_FACTOR
        : event.key === "-"
          ? 1 / VIEWPORT_BUTTON_ZOOM_FACTOR
          : null;
    if (zoom !== null || event.key === "0") {
      event.preventDefault();
      command(zoom);
      return true;
    }
    return false;
  }

  function blur(): void {
    // Space arming is scoped to a focused surface.
    if (!armed) return;
    disarm();
    if (pointerId !== null && initiating === 0) stopAtPresented();
  }

  // A sibling range can start before the pending camera RAF. Invalidate at ownership acquisition,
  // so even a complete color gesture between frames cannot later replay the old camera request.
  const releaseOwnership = onInstrumentPointerStart(surface, (nextOwner) => {
    if (nextOwner !== owner) stopAtPresented();
  });

  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", lost);
  surface.addEventListener("lostpointercapture", lost);
  surface.addEventListener("wheel", wheel, { passive: false });
  surface.addEventListener("mousedown", suppressMiddle);
  surface.addEventListener("auxclick", suppressMiddle);
  surface.addEventListener("blur", blur);

  return {
    get active() {
      return pointerId !== null;
    },
    get spaceArmed() {
      return armed;
    },
    claims: (event) => !disposed && claimsViewportPan(event, armed),
    handleKey,
    zoomIn: () => command(VIEWPORT_BUTTON_ZOOM_FACTOR),
    zoomOut: () => command(1 / VIEWPORT_BUTTON_ZOOM_FACTOR),
    fit: () => command(null),
    show(pose) {
      if (!disposed && pointerId === null && !colorActive()) ports.show(pose);
    },
    cancel: cancelPan,
    interrupt: stopAtPresented,
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseOwnership();
      stopAtPresented();
      disarm();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", lost);
      surface.removeEventListener("lostpointercapture", lost);
      surface.removeEventListener("wheel", wheel);
      surface.removeEventListener("mousedown", suppressMiddle);
      surface.removeEventListener("auxclick", suppressMiddle);
      surface.removeEventListener("blur", blur);
    },
  };
}
