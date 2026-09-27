import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPlaneGesture } from "../src/interaction/planeGesture.js";

interface Value {
  definition: string;
  observed?: string;
}
interface Point {
  id: string;
}

function fixture() {
  const surface = document.createElement("div");
  document.body.append(surface);
  const origin: Value = { definition: "origin" };
  let value = origin;
  let viewKey = "oklch";
  let authorFails = false;
  let onChange: ((next: Value) => void) | undefined;
  const changes: Value[] = [];
  const commits: Value[] = [];
  const restored: Value[] = [];
  const log: string[] = [];
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const gesture = mountPlaneGesture<Value, Point>(surface, () => ({
    value,
    viewKey,
    pointFromPointer: (event) => (event.clientX < 0 ? null : { id: String(event.clientX) }),
    authorPoint: (_value, point) => (authorFails ? null : { definition: point.id }),
    definingEquals: (left, right) => left.definition === right.definition,
    onPointerStart: (event) => log.push(`start:${event.pointerId}`),
    onPointerEnd: (id) => log.push(`end:${id}`),
    onPreviewPoint: (point) => log.push(`preview:${point.id}`),
    onValueChange: (next) => {
      changes.push(next);
      log.push(`change:${next.definition}`);
      onChange?.(next);
    },
    onCommit: (next) => {
      commits.push(next);
      log.push(`commit:${next.definition}`);
    },
    onCancel: () => log.push("cancel"),
    onRestorePresentation: (next) => {
      restored.push(next);
      log.push(`restore:${next.definition}`);
    },
  }));
  function pointer(type: string, x = 1, id = 1, init: PointerEventInit = {}) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      pointerId: id,
      clientX: x,
      ...init,
    });
    surface.dispatchEvent(event);
    return event;
  }
  function flush() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  }
  return {
    surface,
    origin,
    gesture,
    changes,
    commits,
    restored,
    log,
    frames,
    pointer,
    flush,
    setValue(next: Value) {
      value = next;
      gesture.reconcile();
    },
    setView(next: string) {
      viewKey = next;
      gesture.reconcile();
    },
    setOnChange(callback: (next: Value) => void) {
      onChange = callback;
    },
    failAuthorship() {
      authorFails = true;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("shared plane pointer gesture", () => {
  it("qualifies one pointer, rejects secondary mouse, and ignores foreign pointers", () => {
    const f = fixture();
    f.pointer("pointerdown", 2, 8, { button: 2 });
    expect(f.gesture.active).toBe(false);
    f.pointer("pointerdown", -1);
    expect(f.gesture.active).toBe(false);
    const down = f.pointer("pointerdown", 1);
    expect(down.defaultPrevented).toBe(true);
    f.pointer("pointerdown", 2, 2);
    f.pointer("pointermove", 3, 2);
    f.pointer("pointerup", 4, 2);
    expect(f.log).toEqual(["start:1", "preview:1"]);
    f.pointer("pointerup", 5);
    expect(f.log).toContain("end:1");
    expect(f.commits).toHaveLength(1);
    f.gesture.dispose();
  });

  it("does not add an isPrimary rule for touch or pen", () => {
    const f = fixture();
    f.pointer("pointerdown", 1, 7, { pointerType: "touch", isPrimary: false });
    expect(f.gesture.active).toBe(true);
    f.gesture.dispose();
  });

  it("previews immediately and coalesces several moves into one latest publication", () => {
    const f = fixture();
    f.pointer("pointerdown", 1);
    expect(f.log).toEqual(["start:1", "preview:1"]);
    expect(f.changes).toHaveLength(0);
    f.pointer("pointermove", 2);
    f.pointer("pointermove", 3);
    expect(f.log.slice(-2)).toEqual(["preview:2", "preview:3"]);
    expect(f.frames.size).toBe(1);
    f.flush();
    expect(f.changes.map((value) => value.definition)).toEqual(["3"]);
    expect(f.frames.size).toBe(0);
    f.gesture.dispose();
  });

  it("sets expectation before reentrant defining-equal feedback", () => {
    const f = fixture();
    f.setOnChange((next) => f.setValue({ definition: next.definition }));
    f.pointer("pointerdown");
    f.flush();
    expect(f.gesture.active).toBe(true);
    expect(f.log).not.toContain("cancel");
    f.gesture.dispose();
  });

  it("accepts a separately allocated defining-equal origin before first publication", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.setValue({ definition: "origin" });
    expect(f.gesture.active).toBe(true);
    f.gesture.dispose();
  });

  it.each([false, true])(
    "parent replacement wins over queued work after publication=%s",
    (published) => {
      const f = fixture();
      f.pointer("pointerdown");
      if (published) f.flush();
      f.pointer("pointermove", 2);
      const replacement = { definition: "parent" };
      f.setValue(replacement);
      f.flush();
      f.pointer("pointerup", 3);
      f.pointer("lostpointercapture", 3);
      expect(f.gesture.active).toBe(false);
      expect(f.frames.size).toBe(0);
      expect(f.changes).toHaveLength(published ? 1 : 0);
      expect(f.restored.at(-1)).toBe(replacement);
      expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
      expect(f.commits).toHaveLength(0);
      f.gesture.dispose();
    },
  );

  it("interrupts on stale earlier feedback after a later acknowledged publication", () => {
    const f = fixture();
    f.pointer("pointerdown", 1);
    f.flush();
    const first = f.changes[0]!;
    f.setValue({ ...first });
    f.pointer("pointermove", 2);
    f.flush();
    f.setValue({ ...f.changes[1]! });
    f.setValue(first);
    expect(f.gesture.active).toBe(false);
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
    f.gesture.dispose();
  });

  it("uses defining equality even for an observed-equivalent replacement", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.setValue({ definition: "other-space", observed: "same-color" });
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
    f.gesture.dispose();
  });

  it.each([
    { up: 3, pending: 2, expected: "3" },
    { up: -1, pending: 2, expected: "2" },
  ])("pointerup prioritizes up coordinate over pending: $expected", ({ up, pending, expected }) => {
    const f = fixture();
    f.pointer("pointerdown", 1);
    f.pointer("pointermove", pending);
    f.pointer("pointerup", up);
    expect(f.changes.map((value) => value.definition)).toEqual([expected]);
    expect(f.commits[0]).toBe(f.changes[0]);
    expect(f.log.indexOf(`change:${expected}`)).toBeLessThan(f.log.indexOf(`commit:${expected}`));
    expect(f.frames.size).toBe(0);
    f.gesture.dispose();
  });

  it("uses the latest published point when up geometry and pending are absent", () => {
    const f = fixture();
    f.pointer("pointerdown", 1);
    f.flush();
    f.pointer("pointerup", -1);
    expect(f.changes.map((value) => value.definition)).toEqual(["1", "1"]);
    expect(f.commits[0]).toBe(f.changes[1]);
    f.gesture.dispose();
  });

  it("restores presentation without committing when authorship fails", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.failAuthorship();
    f.flush();
    expect(f.changes).toHaveLength(0);
    expect(f.restored).toEqual([f.origin]);
    f.pointer("pointerup");
    expect(f.commits).toHaveLength(0);
    f.gesture.dispose();
  });

  it("rolls back the exact origin object before restoring and cancelling", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.flush();
    expect(f.gesture.rollback()).toBe(true);
    expect(f.changes.at(-1)).toBe(f.origin);
    expect(f.restored.at(-1)).toBe(f.origin);
    expect(f.log.slice(-4)).toEqual(["end:1", "change:origin", "restore:origin", "cancel"]);
    expect(f.commits).toHaveLength(0);
    expect(f.gesture.rollback()).toBe(false);
    f.gesture.dispose();
  });

  it.each(["pointercancel", "lostpointercapture"])("%s takes rollback once", (event) => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer(event);
    f.pointer("pointerup");
    expect(f.changes).toEqual([f.origin]);
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
    f.gesture.dispose();
  });

  it("interrupts without publishing origin or committing", () => {
    const f = fixture();
    f.pointer("pointerdown");
    expect(f.gesture.interrupt()).toBe(true);
    expect(f.changes).toHaveLength(0);
    expect(f.commits).toHaveLength(0);
    expect(f.restored).toEqual([f.origin]);
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
    f.gesture.dispose();
  });

  it.each([false, true])("view change discards old points after publication=%s", (published) => {
    const f = fixture();
    f.pointer("pointerdown", 1);
    if (published) f.flush();
    f.pointer("pointermove", 2);
    f.setView("oklab");
    f.flush();
    f.pointer("pointerup", 3);
    expect(f.changes).toHaveLength(published ? 1 : 0);
    expect(f.commits).toHaveLength(0);
    expect(f.frames.size).toBe(0);
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
    f.gesture.dispose();
  });

  it.each([false, true])("disposes silently with published interaction=%s", (published) => {
    const f = fixture();
    f.pointer("pointerdown");
    if (published) f.flush();
    f.pointer("pointermove", 2);
    const before = f.changes.length;
    f.gesture.dispose();
    f.flush();
    f.pointer("pointerup", 3);
    expect(f.frames.size).toBe(0);
    expect(f.changes).toHaveLength(before);
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(0);
    expect(f.log).toContain("end:1");
  });

  it("does not continue a final callback after reentrant disposal", () => {
    const f = fixture();
    f.setOnChange(() => f.gesture.dispose());
    f.pointer("pointerdown");
    f.pointer("pointerup", 2);
    expect(f.changes).toHaveLength(1);
    expect(f.commits).toHaveLength(0);
    expect(f.log).not.toContain("cancel");
  });

  it("does not publish a stale queued point after a callback interrupts", () => {
    const f = fixture();
    f.setOnChange(() => f.gesture.interrupt());
    f.pointer("pointerdown");
    f.pointer("pointermove", 2);
    f.flush();
    f.flush();
    expect(f.changes.map((value) => value.definition)).toEqual(["2"]);
    expect(f.log.filter((entry) => entry === "cancel")).toHaveLength(1);
    expect(f.commits).toHaveLength(0);
    f.gesture.dispose();
  });
});
