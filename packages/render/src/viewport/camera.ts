import type { PlanePoint } from "@gamut-plane/core";
import {
  constrainViewport,
  FIT_VIEWPORT,
  panViewport,
  viewportsEqual,
  zoomViewportAt,
  type FieldViewport,
} from "./math.js";

export interface ViewportCameraOptions {
  /**
   * Draws the raster and applies every camera-dependent overlay and readout for `viewport`,
   * synchronously. It is the only place a camera becomes visible, so all spatial layers show one
   * pose per frame. Read committed semantic facts here, never speculative ones.
   */
  present(viewport: FieldViewport): void;
  /** Frame scheduling is injected so this module has no DOM dependency. */
  schedule(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

/**
 * One logical camera. `requested` is scheduling state: where coalesced input wants the camera.
 * `presented` is the last pose the surface actually showed, and the only pose input is
 * interpreted against. It already holds the new pose while `present` runs, so every layer
 * applied in that callback reads one consistent pose.
 */
export interface ViewportCamera {
  readonly presented: FieldViewport;
  readonly requested: FieldViewport;
  readonly pending: boolean;
  /** Composes onto the requested pose in call order. Returns whether the request changed. */
  zoomAt(anchor: Readonly<PlanePoint>, factor: number): boolean;
  /** Requests `origin` moved by a normalized viewport displacement. */
  panFrom(origin: FieldViewport, displacement: Readonly<PlanePoint>): boolean;
  /** Composes a normalized viewport displacement onto the requested pose. */
  panBy(displacement: Readonly<PlanePoint>): boolean;
  /** Presents the requested pose now, if it differs. */
  flush(): void;
  /** Presents `viewport` now, replacing any pending request. */
  show(viewport: FieldViewport): void;
  /** Canonical fit. Discards pending requests instead of replaying them. */
  fit(): void;
  /** Drops requests that were never presented. Returns whether any existed. */
  discardPending(): boolean;
  dispose(): void;
}

export function createViewportCamera(options: ViewportCameraOptions): ViewportCamera {
  let presented = FIT_VIEWPORT;
  let requested = FIT_VIEWPORT;
  let frame: unknown = null;
  let scheduled = false;
  let disposed = false;

  function cancelFrame(): void {
    if (!scheduled) return;
    scheduled = false;
    options.cancel(frame);
    frame = null;
  }

  function flush(): void {
    cancelFrame();
    if (disposed || viewportsEqual(requested, presented)) return;
    const previous = presented;
    const next = requested;
    // Everything `present` applies reads this pose, so it is current for the whole callback.
    presented = next;
    try {
      options.present(next);
    } catch (error) {
      // A failed presentation must not leave a request that can never become visible.
      presented = requested = previous;
      throw error;
    }
  }

  function request(next: FieldViewport): boolean {
    if (disposed) return false;
    const constrained = constrainViewport(next);
    if (viewportsEqual(constrained, requested)) return false;
    requested = constrained;
    if (viewportsEqual(requested, presented)) cancelFrame();
    else if (!scheduled) {
      scheduled = true;
      frame = options.schedule(() => {
        scheduled = false;
        frame = null;
        flush();
      });
    }
    return true;
  }

  return {
    get presented() {
      return presented;
    },
    get requested() {
      return requested;
    },
    get pending() {
      return !viewportsEqual(requested, presented);
    },
    zoomAt: (anchor, factor) => request(zoomViewportAt(requested, anchor, factor)),
    panFrom: (origin, displacement) => request(panViewport(origin, displacement)),
    panBy: (displacement) => request(panViewport(requested, displacement)),
    flush,
    show(viewport) {
      if (disposed) return;
      requested = constrainViewport(viewport);
      flush();
    },
    fit() {
      if (disposed) return;
      requested = FIT_VIEWPORT;
      flush();
    },
    discardPending() {
      const had = !viewportsEqual(requested, presented);
      cancelFrame();
      requested = presented;
      return had;
    },
    dispose() {
      cancelFrame();
      disposed = true;
      requested = presented;
    },
  };
}
