import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPlaneGesture } from "../src/interaction/planeGesture.js";
import { hasInstrumentPointer } from "../src/interaction/pointerOwnership.js";
import { claimShellPopup, releaseShellPopup } from "../src/interaction/shellPopup.js";
import {
  claimsViewportPan,
  mountPlaneViewport,
  wheelDeltaPixels,
  type PlaneViewportPorts,
  type ViewportPoint,
  type ViewportPose,
} from "../src/interaction/viewportInteraction.js";

const cleanupBindings = new Set<() => void>();

afterEach(() => {
  for (const dispose of cleanupBindings) dispose();
  cleanupBindings.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const FIT: ViewportPose = { zoom: 1, center: { x: 0.5, y: 0.5 } };

function fixture(options: { measurable?: boolean } = {}) {
  const root = document.createElement("div");
  root.setAttribute("data-gp-root", "");
  const surface = document.createElement("div");
  surface.setAttribute("data-gp-part", "surface");
  surface.tabIndex = 0;
  root.append(surface);
  document.body.append(root);
  const log: string[] = [];
  let colorActive = false;
  let presented: ViewportPose = FIT;
  let requested: ViewportPose = FIT;
  let measurable = options.measurable ?? true;
  const ports: PlaneViewportPorts = {
    presented: () => presented,
    measure: () => {
      log.push("measure");
      return measurable;
    },
    normalize: (clientX, clientY) => ({ x: clientX / 200, y: clientY / 100 }),
    extent: () => ({ width: 200, height: 100 }),
    zoomAt: (anchor, factor) => {
      log.push(`zoomAt:${anchor.x},${anchor.y}:${factor.toFixed(6)}`);
    },
    panFrom: (origin, displacement) => {
      log.push(`panFrom:${origin.zoom}:${displacement.x},${displacement.y}`);
      requested = {
        zoom: origin.zoom,
        center: {
          x: origin.center.x - displacement.x / origin.zoom,
          y: origin.center.y - displacement.y / origin.zoom,
        },
      };
    },
    panBy: (displacement) => {
      log.push(`panBy:${displacement.x},${displacement.y}`);
    },
    show: (pose) => {
      log.push(`show:${pose.zoom}:${pose.center.x},${pose.center.y}`);
      presented = requested = pose;
    },
    fit: () => log.push("fit"),
    flush: () => {
      log.push("flush");
      presented = requested;
    },
    discardPending: () => {
      log.push("discard");
      requested = presented;
    },
    colorGestureActive: () => colorActive,
  };
  const viewport = mountPlaneViewport(surface, ports);
  cleanupBindings.add(() => viewport.dispose());
  const captured = new Set<number>();
  surface.setPointerCapture = (id: number) => {
    captured.add(id);
  };
  surface.releasePointerCapture = (id: number) => {
    captured.delete(id);
  };
  surface.hasPointerCapture = (id: number) => captured.has(id);
  function pointer(type: string, init: PointerEventInit = {}) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      pointerId: 1,
      ...init,
    });
    surface.dispatchEvent(event);
    return event;
  }
  function wheel(init: WheelEventInit = {}) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      altKey: true,
      deltaY: -48,
      clientX: 100,
      clientY: 50,
      ...init,
    });
    surface.dispatchEvent(event);
    return event;
  }
  function key(init: KeyboardEventInit) {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    surface.dispatchEvent(event);
    return { event, handled: viewport.handleKey(event) };
  }
  return {
    root,
    surface,
    viewport,
    ports,
    log,
    captured,
    pointer,
    wheel,
    key,
    setColorActive: (value: boolean) => (colorActive = value),
    setMeasurable: (value: boolean) => (measurable = value),
    presented: () => presented,
    setPresented: (pose: ViewportPose) => (presented = requested = pose),
  };
}

const MIDDLE_DOWN = { button: 1, buttons: 4, clientX: 100, clientY: 40 };

it("framing uses the existing show port and cannot move the camera during pan, color ownership or disposal", () => {
  const ui = fixture();
  const pose = { zoom: 4, center: { x: 0.4, y: 0.6 } };
  ui.viewport.show(pose);
  expect(ui.presented()).toBe(pose);
  ui.setColorActive(true);
  ui.viewport.show(FIT);
  expect(ui.presented()).toBe(pose);
  ui.setColorActive(false);
  ui.pointer("pointerdown", MIDDLE_DOWN);
  ui.viewport.show(FIT);
  expect(ui.presented()).toBe(pose);
  ui.viewport.interrupt();
  ui.viewport.show(FIT);
  expect(ui.presented()).toBe(FIT);
  ui.viewport.dispose();
  ui.viewport.show(pose);
  expect(ui.presented()).toBe(FIT);
});

describe("V07 explicit pan intent", () => {
  it("claims middle-button and armed primary mouse presses, never touch, pen or unarmed primary", () => {
    const primary = new PointerEvent("pointerdown", { pointerType: "mouse", button: 0 });
    const middle = new PointerEvent("pointerdown", { pointerType: "mouse", button: 1 });
    const secondary = new PointerEvent("pointerdown", { pointerType: "mouse", button: 2 });
    const touch = new PointerEvent("pointerdown", { pointerType: "touch", button: 0 });
    const pen = new PointerEvent("pointerdown", { pointerType: "pen", button: 0 });
    expect(claimsViewportPan(primary, false)).toBe(false);
    expect(claimsViewportPan(primary, true)).toBe(true);
    expect(claimsViewportPan(middle, false)).toBe(true);
    expect(claimsViewportPan(secondary, true)).toBe(false);
    expect(claimsViewportPan(touch, true)).toBe(false);
    expect(claimsViewportPan(pen, true)).toBe(false);
  });

  it.each(["viewport first", "gesture first"] as const)(
    "pan owns an armed primary press and edit declines it regardless of registration order (%s)",
    (order) => {
      const root = document.createElement("div");
      root.setAttribute("data-gp-root", "");
      const surface = document.createElement("div");
      surface.setAttribute("data-gp-part", "surface");
      root.append(surface);
      document.body.append(root);
      const edits: string[] = [];
      let viewport: ReturnType<typeof mountPlaneViewport> | undefined;
      let gesture: ReturnType<typeof mountPlaneGesture<number, number>> | undefined;
      const mountViewport = () => {
        viewport = mountPlaneViewport(surface, {
          presented: () => FIT,
          measure: () => true,
          normalize: () => ({ x: 0.5, y: 0.5 }),
          extent: () => ({ width: 100, height: 100 }),
          zoomAt: () => undefined,
          panFrom: () => undefined,
          panBy: () => undefined,
          show: () => undefined,
          fit: () => undefined,
          flush: () => undefined,
          discardPending: () => undefined,
          colorGestureActive: () => gesture?.active ?? false,
        });
      };
      const mountGesture = () => {
        gesture = mountPlaneGesture<number, number>(surface, () => ({
          value: 0,
          viewKey: "a",
          pointFromPointer: () => 1,
          declines: (event) => viewport?.claims(event) ?? false,
          authorPoint: (value) => value,
          definingEquals: (a, b) => a === b,
          onPointerStart: () => edits.push("start"),
          onPointerEnd: () => edits.push("end"),
          onPreviewPoint: () => edits.push("preview"),
          onValueChange: () => edits.push("change"),
          onCommit: () => edits.push("commit"),
          onCancel: () => edits.push("cancel"),
          onRestorePresentation: () => edits.push("restore"),
        }));
      };
      if (order === "viewport first") {
        mountViewport();
        mountGesture();
      } else {
        mountGesture();
        mountViewport();
      }
      surface.setPointerCapture = () => undefined;
      viewport!.handleKey(new KeyboardEvent("keydown", { key: " ", cancelable: true }));
      surface.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          pointerId: 4,
          cancelable: true,
          bubbles: true,
        }),
      );
      expect(viewport!.active).toBe(true);
      expect(gesture!.active).toBe(false);
      expect(edits).toEqual([]);
      // Unarmed, the same press is an ordinary edit.
      viewport!.dispose();
      mountViewport();
      surface.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          pointerId: 5,
          cancelable: true,
          bubbles: true,
        }),
      );
      expect(gesture!.active).toBe(true);
      expect(edits).toContain("start");
    },
  );

  it("keeps an active pan's ownership when an idle edit controller reconciles or is disposed", () => {
    const f = fixture();
    const gesture = mountPlaneGesture<number, number>(f.surface, () => ({
      value: 0,
      viewKey: "a",
      pointFromPointer: () => 1,
      authorPoint: (value) => value,
      definingEquals: (a, b) => a === b,
      onPointerStart: () => undefined,
      onPointerEnd: () => undefined,
      onPreviewPoint: () => undefined,
      onValueChange: () => undefined,
      onCommit: () => undefined,
      onCancel: () => undefined,
      onRestorePresentation: () => undefined,
    }));
    f.pointer("pointerdown", MIDDLE_DOWN);
    expect(f.viewport.active).toBe(true);
    expect(hasInstrumentPointer(f.surface)).toBe(true);
    gesture.reconcile();
    gesture.interrupt();
    gesture.dispose();
    expect(hasInstrumentPointer(f.surface)).toBe(true);
    f.pointer("pointerup", { button: 1, buttons: 0, clientX: 100, clientY: 40 });
    expect(hasInstrumentPointer(f.surface)).toBe(false);
  });

  it("does not take over a color sequence or start a second pan", () => {
    const f = fixture();
    f.setColorActive(true);
    const blocked = f.pointer("pointerdown", { ...MIDDLE_DOWN });
    expect(f.viewport.active).toBe(false);
    expect(blocked.defaultPrevented).toBe(true);
    f.setColorActive(false);
    f.pointer("pointerdown", { ...MIDDLE_DOWN });
    expect(f.viewport.active).toBe(true);
    const log = f.log.length;
    f.pointer("pointerdown", { ...MIDDLE_DOWN, pointerId: 2 });
    expect(f.log).toHaveLength(log);
  });
});

describe("V08 wheel", () => {
  it("zooms at the measured pointer with a bounded exponential factor and consumes the event", () => {
    const f = fixture();
    const event = f.wheel({ deltaY: -48, clientX: 100, clientY: 50 });
    expect(event.defaultPrevented).toBe(true);
    expect(f.log).toContain(`zoomAt:0.5,0.5:${(2 ** (48 / 480)).toFixed(6)}`);
    f.log.length = 0;
    f.wheel({ deltaY: 100000, clientX: 20, clientY: 20 });
    expect(f.log).toContain(`zoomAt:0.1,0.2:${(2 ** (-240 / 480)).toFixed(6)}`);
  });

  it("normalizes line and page deltas explicitly", () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 }, 100)).toBe(48);
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 }, 100)).toBe(100);
    expect(wheelDeltaPixels({ deltaY: 10, deltaMode: 0 }, 100)).toBe(10);
    expect(wheelDeltaPixels({ deltaY: Number.NaN, deltaMode: 0 }, 100)).toBe(0);
    expect(wheelDeltaPixels({ deltaY: 0, deltaMode: 0 }, 100)).toBe(0);
    expect(wheelDeltaPixels({ deltaY: 5, deltaMode: 2 }, 0)).toBe(5);
  });

  it("leaves ordinary scroll, browser zoom chords and unusable events alone", () => {
    const f = fixture();
    for (const init of [
      { altKey: false },
      { altKey: true, ctrlKey: true },
      { altKey: true, metaKey: true },
      { altKey: false, ctrlKey: true },
      { cancelable: false },
      { deltaY: 0 },
    ]) {
      const event = f.wheel(init);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(f.log.filter((entry) => entry.startsWith("zoomAt"))).toEqual([]);
    f.setMeasurable(false);
    expect(f.wheel().defaultPrevented).toBe(false);
  });

  it("does not claim an event another handler already consumed", () => {
    const f = fixture();
    f.surface.addEventListener("wheel", (event) => event.preventDefault(), { capture: true });
    f.wheel();
    expect(f.log.filter((entry) => entry.startsWith("zoomAt"))).toEqual([]);
  });

  it("is blocked by an open instrument popup and consumed as a no-op during a color gesture", () => {
    const f = fixture();
    const close = () => undefined;
    claimShellPopup(f.root, close);
    expect(f.wheel().defaultPrevented).toBe(false);
    releaseShellPopup(f.root, close);
    f.setColorActive(true);
    expect(f.wheel().defaultPrevented).toBe(true);
    expect(f.log.filter((entry) => entry.startsWith("zoomAt"))).toEqual([]);
  });
});

describe("V09 pan lifecycle", () => {
  it("keeps the grabbed field point under the pointer after its host scrolls", () => {
    const f = fixture();
    let top = 0;
    f.ports.normalize = (clientX, clientY) => ({ x: clientX / 200, y: (clientY - top) / 100 });
    f.setPresented({ zoom: 4, center: { x: 0.5, y: 0.5 } });
    f.pointer("pointerdown", MIDDLE_DOWN);
    // The field moves up by 30 client pixels while the pointer remains at (100,40).
    top = -30;
    f.pointer("pointermove", { buttons: 4, clientX: 100, clientY: 40 });
    f.ports.flush();
    // The grabbed field point was (0.5,0.475). Its new viewport coordinate is (0.5,0.7),
    // requiring center.y = 0.475 - (0.7 - 0.5) / 4 = 0.425.
    expect(f.presented().center.x).toBe(0.5);
    expect(f.presented().center.y).toBeCloseTo(0.425, 12);
    f.pointer("pointerup", { button: 1, buttons: 0, clientX: 100, clientY: 40 });
    expect(f.viewport.active).toBe(false);
    expect(f.presented().center.y).toBeCloseTo(0.425, 12);
  });

  it.each(["interrupt", "dispose"] as const)(
    "%s drops an unpresented pan request before releasing ownership",
    (how) => {
      const f = fixture();
      const shown = { zoom: 4, center: { x: 0.5, y: 0.5 } };
      f.setPresented(shown);
      f.pointer("pointerdown", MIDDLE_DOWN);
      f.pointer("pointermove", { buttons: 4, clientX: 140, clientY: 40 });
      f.viewport[how]();
      expect(f.viewport.active).toBe(false);
      expect(hasInstrumentPointer(f.surface)).toBe(false);
      // Simulate the camera frame running after the lifecycle interruption.
      f.ports.flush();
      expect(f.presented()).toBe(shown);
      f.viewport.dispose();
    },
  );

  it("pans from the presented pose, applies the final displacement on release and stays color-silent", () => {
    const f = fixture();
    f.setPresented({ zoom: 4, center: { x: 0.5, y: 0.5 } });
    const down = f.pointer("pointerdown", MIDDLE_DOWN);
    expect(down.defaultPrevented).toBe(true);
    // The initiating event reads what is on screen, after dropping an unpresented request.
    expect(f.log.indexOf("discard")).toBeGreaterThan(f.log.indexOf("measure"));
    expect(f.captured.has(1)).toBe(true);
    expect(f.surface.hasAttribute("data-gp-viewport-panning")).toBe(true);
    f.pointer("pointermove", { buttons: 4, clientX: 120, clientY: 30 });
    f.pointer("pointerup", { button: 1, buttons: 0, clientX: 140, clientY: 20 });
    const pans = f.log.filter((entry) => entry.startsWith("panFrom"));
    expect(pans).toHaveLength(2);
    for (const [index, expected] of [
      [0.1, -0.1],
      [0.2, -0.2],
    ].entries()) {
      const [, zoom, coordinates] = pans[index]!.split(":");
      const [x, y] = coordinates!.split(",").map(Number);
      expect(Number(zoom)).toBe(4);
      expect(x).toBeCloseTo(expected[0]!, 12);
      expect(y).toBeCloseTo(expected[1]!, 12);
    }
    expect(f.presented().center.x).toBeCloseTo(0.45, 12);
    expect(f.presented().center.y).toBeCloseTo(0.55, 12);
    expect(f.log.at(-1)).toBe("flush");
    expect(f.captured.size).toBe(0);
    expect(f.viewport.active).toBe(false);
    expect(hasInstrumentPointer(f.surface)).toBe(false);
    expect(f.surface.hasAttribute("data-gp-viewport-panning")).toBe(false);
  });

  it("pans with Space plus primary and ends at its latest position when Space is released", () => {
    const f = fixture();
    f.key({ key: " ", code: "Space" });
    expect(f.viewport.spaceArmed).toBe(true);
    expect(f.surface.hasAttribute("data-gp-viewport-armed")).toBe(true);
    f.pointer("pointerdown", { button: 0, buttons: 1, clientX: 100, clientY: 40 });
    expect(f.viewport.active).toBe(true);
    f.pointer("pointermove", { buttons: 1, clientX: 110, clientY: 40 });
    document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
    expect(f.viewport.active).toBe(false);
    expect(f.viewport.spaceArmed).toBe(false);
    const settled = f.log.length;
    // Later movement and release of the same physical sequence do nothing at all.
    f.pointer("pointermove", { buttons: 1, clientX: 180, clientY: 90 });
    f.pointer("pointerup", { button: 0, buttons: 0, clientX: 180, clientY: 90 });
    expect(f.log).toHaveLength(settled);
    expect(f.log.at(-1)).toBe("flush");
  });

  it("keeps Space armed after a middle pan ends and disarms on its own key release", () => {
    const f = fixture();
    f.key({ key: " ", code: "Space" });
    f.pointer("pointerdown", MIDDLE_DOWN);
    f.pointer("pointerup", { button: 1, buttons: 0, clientX: 100, clientY: 40 });
    expect(f.viewport.spaceArmed).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
    expect(f.viewport.spaceArmed).toBe(false);
  });

  it("surface blur ends a Space pan at the presented pose and disarms it", () => {
    const f = fixture();
    const shown = { zoom: 4, center: { x: 0.5, y: 0.5 } };
    f.setPresented(shown);
    f.key({ key: " ", code: "Space" });
    f.pointer("pointerdown", { button: 0, buttons: 1, clientX: 100, clientY: 40 });
    f.pointer("pointermove", { buttons: 1, clientX: 140, clientY: 40 });
    f.surface.dispatchEvent(new FocusEvent("blur"));
    expect(f.viewport.spaceArmed).toBe(false);
    expect(f.viewport.active).toBe(false);
    f.ports.flush();
    expect(f.presented()).toBe(shown);
    f.viewport.dispose();
  });

  it("ends when the initiating button is released as a pointermove under a chord", () => {
    const f = fixture();
    f.pointer("pointerdown", MIDDLE_DOWN);
    // Middle released while the primary button stays held: only a pointermove reports it.
    f.pointer("pointermove", { button: 1, buttons: 1, clientX: 110, clientY: 40 });
    expect(f.viewport.active).toBe(false);
    expect(f.log.at(-1)).toBe("flush");
    const settled = f.log.length;
    f.pointer("pointermove", { buttons: 1, clientX: 190, clientY: 90 });
    expect(f.log).toHaveLength(settled);
  });

  it("ignores secondary-button transitions during a pan", () => {
    const f = fixture();
    f.pointer("pointerdown", MIDDLE_DOWN);
    const before = f.log.length;
    f.pointer("pointermove", { button: 2, buttons: 6, clientX: 190, clientY: 90 });
    expect(f.log).toHaveLength(before);
    expect(f.viewport.active).toBe(true);
  });

  it.each(["escape", "pointercancel", "lostpointercapture"] as const)(
    "%s restores the origin pose only and never finishes a pan",
    (how) => {
      const f = fixture();
      f.setPresented({ zoom: 2, center: { x: 0.4, y: 0.6 } });
      f.pointer("pointerdown", MIDDLE_DOWN);
      f.pointer("pointermove", { buttons: 4, clientX: 160, clientY: 40 });
      if (how === "escape")
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      else f.pointer(how);
      expect(f.log.at(-1)).toBe("show:2:0.4,0.6");
      expect(f.log).not.toContain("flush");
      expect(f.viewport.active).toBe(false);
      expect(hasInstrumentPointer(f.surface)).toBe(false);
    },
  );

  it("unwinds ownership without panning when capture cannot be acquired", () => {
    const f = fixture();
    f.surface.setPointerCapture = () => {
      throw new DOMException("no such pointer", "NotFoundError");
    };
    f.pointer("pointerdown", MIDDLE_DOWN);
    expect(f.viewport.active).toBe(false);
    expect(hasInstrumentPointer(f.surface)).toBe(false);
    expect(f.surface.hasAttribute("data-gp-viewport-panning")).toBe(false);
    f.pointer("pointermove", { buttons: 4, clientX: 160, clientY: 40 });
    expect(f.log.filter((entry) => entry.startsWith("panFrom"))).toEqual([]);
  });

  it("does not start while the surface cannot be measured", () => {
    const f = fixture({ measurable: false });
    f.pointer("pointerdown", MIDDLE_DOWN);
    expect(f.viewport.active).toBe(false);
    expect(f.captured.size).toBe(0);
  });

  it("ends at the presented pose when the window loses focus or hides", () => {
    for (const lose of [
      () => window.dispatchEvent(new Event("blur")),
      () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ]) {
      const f = fixture();
      f.key({ key: " ", code: "Space" });
      f.pointer("pointerdown", { button: 0, buttons: 1, clientX: 100, clientY: 40 });
      f.pointer("pointermove", { buttons: 1, clientX: 130, clientY: 40 });
      lose();
      expect(f.viewport.active).toBe(false);
      expect(f.viewport.spaceArmed).toBe(false);
      expect(f.log.at(-1)).toBe("discard");
      expect(f.captured.size).toBe(0);
      f.viewport.dispose();
      vi.restoreAllMocks();
    }
  });

  it("releases only its own capture and goes inert when disposed mid-pan", () => {
    const f = fixture();
    f.pointer("pointerdown", MIDDLE_DOWN);
    f.captured.add(99);
    f.viewport.dispose();
    expect(f.captured.has(99)).toBe(true);
    expect(f.captured.has(1)).toBe(false);
    expect(hasInstrumentPointer(f.surface)).toBe(false);
    const settled = f.log.length;
    f.pointer("pointermove", { buttons: 4, clientX: 150, clientY: 40 });
    f.pointer("pointerup", { button: 1, buttons: 0 });
    f.wheel();
    expect(f.log).toHaveLength(settled);
  });

  it("suppresses the middle button's own browser behavior on the owned surface", () => {
    const f = fixture();
    const down = new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true });
    const aux = new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true });
    const primary = new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true });
    f.surface.dispatchEvent(down);
    f.surface.dispatchEvent(aux);
    f.surface.dispatchEvent(primary);
    expect([down.defaultPrevented, aux.defaultPrevented, primary.defaultPrevented]).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe("keyboard and commands", () => {
  it("zooms about the center and fits from plain keys, ignoring chords", () => {
    const f = fixture();
    expect(f.key({ key: "+" }).handled).toBe(true);
    expect(f.key({ key: "=" }).handled).toBe(true);
    expect(f.key({ key: "-" }).handled).toBe(true);
    expect(f.key({ key: "0" }).handled).toBe(true);
    expect(f.log.filter((entry) => entry.startsWith("zoomAt") || entry === "fit")).toEqual([
      "zoomAt:0.5,0.5:1.250000",
      "zoomAt:0.5,0.5:1.250000",
      "zoomAt:0.5,0.5:0.800000",
      "fit",
    ]);
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(f.key({ key: "+", ...init }).handled).toBe(false);
      expect(f.key({ key: "0", ...init }).handled).toBe(false);
    }
    expect(f.key({ key: "a" }).handled).toBe(false);
    expect(f.key({ key: "+", isComposing: true }).handled).toBe(false);
  });

  it("leaves arrows, Home, End and Escape to the editor unless the camera owns them", () => {
    const f = fixture();
    for (const name of ["ArrowLeft", "ArrowUp", "Home", "End", "Escape"])
      expect(f.key({ key: name }).handled).toBe(false);
  });

  it("pans toward the pressed arrow while Space is armed and keeps color keys inert", () => {
    const f = fixture();
    f.key({ key: " ", code: "Space" });
    f.key({ key: "ArrowRight" });
    f.key({ key: "ArrowUp", shiftKey: true });
    f.key({ key: "Home" });
    f.key({ key: "End" });
    expect(f.log.filter((entry) => entry.startsWith("panBy"))).toEqual([
      "panBy:-0.1,0",
      "panBy:0,0.25",
    ]);
    expect(f.key({ key: "ArrowLeft" }).handled).toBe(true);
    expect(f.key({ key: "Home" }).handled).toBe(true);
    f.setColorActive(true);
    const before = f.log.length;
    expect(f.key({ key: "ArrowDown" }).handled).toBe(true);
    expect(f.log).toHaveLength(before);
  });

  it("disarms when the surface loses focus", () => {
    const f = fixture();
    f.key({ key: " ", code: "Space" });
    f.surface.dispatchEvent(new FocusEvent("blur"));
    expect(f.viewport.spaceArmed).toBe(false);
    expect(f.surface.hasAttribute("data-gp-viewport-armed")).toBe(false);
  });

  it("consumes color keys and Escape while pan owns the pointer", () => {
    const f = fixture();
    f.pointer("pointerdown", MIDDLE_DOWN);
    expect(f.key({ key: "ArrowLeft" }).handled).toBe(true);
    expect(f.key({ key: "Home" }).handled).toBe(true);
    // Escape reaches the pan's own capture-phase listener first and restores the origin.
    f.key({ key: "Escape" });
    expect(f.viewport.active).toBe(false);
    expect(f.log).toContain("show:1:0.5,0.5");
    expect(f.log).not.toContain("flush");
  });

  it("refuses buttons, zoom keys and Fit during a pan or a color gesture", () => {
    const f = fixture();
    f.viewport.zoomIn();
    f.viewport.zoomOut();
    f.viewport.fit();
    expect(f.log.filter((entry) => entry.startsWith("zoomAt") || entry === "fit")).toHaveLength(3);
    f.log.length = 0;
    f.setColorActive(true);
    f.viewport.zoomIn();
    f.viewport.fit();
    f.key({ key: "+" });
    expect(f.log).toEqual([]);
    f.setColorActive(false);
    f.pointer("pointerdown", MIDDLE_DOWN);
    const before = f.log.length;
    f.viewport.zoomIn();
    f.viewport.fit();
    f.key({ key: "0" });
    expect(f.log).toHaveLength(before);
  });
});

describe("pure helpers stay free of DOM state", () => {
  it("ViewportPoint and ViewportPose are structural", () => {
    const point: ViewportPoint = { x: 1, y: 2 };
    const pose: ViewportPose = { zoom: 2, center: point };
    expect(pose.center).toBe(point);
  });
});
