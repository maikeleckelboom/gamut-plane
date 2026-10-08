import type { PlanePoint } from "@gamut-plane/core";
import { pointStyle, VIEWBOX_SIZE } from "../geometry.js";
import { fieldToViewport, isFitViewport, sampleWindow, type FieldViewport } from "./math.js";

/** A raw RGB marker can be far outside the field; keep the projected CSS value finite. */
const MAX_PROJECTED_COORDINATE = 1e300;

/** `left`/`top` for an HTML annotation at a field point. Fit emits exactly the unprojected style. */
export function viewportPointStyle(
  viewport: FieldViewport,
  point: Readonly<PlanePoint>,
): Record<string, string> {
  if (isFitViewport(viewport)) return pointStyle(point);
  const projected = fieldToViewport(viewport, point);
  const bound = (value: number) =>
    Math.max(-MAX_PROJECTED_COORDINATE, Math.min(MAX_PROJECTED_COORDINATE, value));
  return pointStyle({ x: bound(projected.x), y: bound(projected.y) });
}

function viewBoxNumber(value: number): string {
  return String(Number(value.toFixed(6)));
}

/** Guide SVG view box: the visible field window in the SVG's fixed field coordinates. */
export function viewportSvgViewBox(viewport: FieldViewport): string {
  const window = sampleWindow(viewport);
  return [window.left, window.top, window.width, window.height]
    .map((value) => viewBoxNumber(value * VIEWBOX_SIZE))
    .join(" ");
}

/**
 * Box of the whole field square inside the viewport, for the OKLab domain outline. Fit returns
 * `null`: the stylesheet's own `inset: 0` already describes it.
 */
export function viewportDomainStyle(viewport: FieldViewport): Record<string, string> | null {
  if (isFitViewport(viewport)) return null;
  const origin = fieldToViewport(viewport, { x: 0, y: 0 });
  const percentage = (value: number) => `${(value * 100).toFixed(8)}%`;
  return {
    left: percentage(origin.x),
    top: percentage(origin.y),
    width: percentage(viewport.zoom),
    height: percentage(viewport.zoom),
  };
}
