import { setPointerOwnership } from "./pointerOwnership.js";

/** The temporary pointer gesture. Authorship, geometry, and presentation stay with the caller. */
export interface PlaneGestureInput<Value, Point> {
  value: Value;
  viewKey: string;
  pointFromPointer(event: PointerEvent): Point | null;
  authorPoint(value: Value, point: Point): Value | null;
  definingEquals(left: Value, right: Value): boolean;
  onPointerStart(event: PointerEvent): void;
  onPointerEnd(pointerId: number): void;
  onPreviewPoint(point: Point): void;
  onValueChange(value: Value): void;
  onCommit(value: Value): void;
  onCancel(): void;
  onRestorePresentation(value: Value): void;
}

export interface PlaneGestureBinding {
  readonly active: boolean;
  readonly hasPendingPoint: boolean;
  reconcile(): void;
  rollback(): boolean;
  interrupt(): boolean;
  dispose(): void;
}

/** Mount only from a client lifecycle; importing this module has no DOM effects. */
export function mountPlaneGesture<Value, Point>(
  surface: HTMLElement,
  current: () => PlaneGestureInput<Value, Point>,
): PlaneGestureBinding {
  let disposed = false;
  let pointerId: number | null = null;
  let origin: Value | null = null;
  let expected: Value | null = null;
  let pending: Point | null = null;
  let latest: Point | null = null;
  let frame: number | null = null;
  let viewKey = current().viewKey;

  function end(): void {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    pending = latest = null;
    const owned = pointerId;
    pointerId = null;
    setPointerOwnership(surface, false);
    origin = expected = null;
    if (owned !== null) current().onPointerEnd(owned);
  }

  function publish(point: Point, owned: boolean): Value | null {
    if (disposed) return null;
    current().onPreviewPoint(point);
    if (disposed || (owned && pointerId === null)) return null;
    const input = current();
    const result = input.authorPoint(input.value, point);
    if (disposed || (owned && pointerId === null)) return null;
    if (result === null) {
      current().onRestorePresentation(current().value);
      return null;
    }
    if (owned && pointerId !== null) expected = result;
    current().onValueChange(result);
    return result;
  }

  function queue(point: Point): void {
    pending = latest = point;
    current().onPreviewPoint(point);
    if (disposed || pointerId === null || frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      if (disposed || pointerId === null || pending === null) return;
      const point = pending;
      pending = null;
      publish(point, true);
    });
  }

  function down(event: PointerEvent): void {
    if (disposed || pointerId !== null || (event.pointerType === "mouse" && event.button !== 0))
      return;
    const point = current().pointFromPointer(event);
    if (point === null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    setPointerOwnership(surface, true);
    origin = current().value;
    expected = null;
    current().onPointerStart(event);
    if (!disposed && pointerId === event.pointerId) queue(point);
  }

  function move(event: PointerEvent): void {
    if (disposed || pointerId !== event.pointerId) return;
    const point = current().pointFromPointer(event);
    if (point === null) return;
    event.preventDefault();
    queue(point);
  }

  function up(event: PointerEvent): void {
    if (disposed || pointerId !== event.pointerId) return;
    const point = current().pointFromPointer(event) ?? pending ?? latest;
    end();
    if (disposed || point === null) return;
    const result = publish(point, false);
    if (result !== null && !disposed) current().onCommit(result);
  }

  function rollback(): boolean {
    if (disposed || pointerId === null) return false;
    const start = origin!;
    end();
    if (disposed) return true;
    current().onValueChange(start);
    if (disposed) return true;
    current().onRestorePresentation(start);
    if (!disposed) current().onCancel();
    return true;
  }

  function interrupt(): boolean {
    if (disposed || pointerId === null) return false;
    end();
    if (disposed) return true;
    current().onRestorePresentation(current().value);
    if (!disposed) current().onCancel();
    return true;
  }

  function lost(event: PointerEvent): void {
    if (pointerId === event.pointerId) rollback();
  }

  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", lost);
  surface.addEventListener("lostpointercapture", lost);

  return {
    get active() {
      return pointerId !== null;
    },
    get hasPendingPoint() {
      return pending !== null;
    },
    reconcile() {
      if (disposed) return;
      const input = current();
      const viewChanged = input.viewKey !== viewKey;
      viewKey = input.viewKey;
      if (pointerId === null) return;
      if (viewChanged || !input.definingEquals(input.value, expected ?? origin!)) interrupt();
    },
    rollback,
    interrupt,
    dispose() {
      if (disposed) return;
      disposed = true;
      end();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", lost);
      surface.removeEventListener("lostpointercapture", lost);
    },
  };
}
