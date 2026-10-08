/** User-facing words for the field viewport. Layout and anatomy stay with the stylesheet. */
export const viewportCopy = {
  group: "Field viewport",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit",
  fitName: "Fit editor field to view",
  instructions:
    "Alt or Option plus mouse wheel zooms at the pointer. Hold Space and drag, or drag with the middle button, to pan. Plus and minus zoom, 0 fits the whole field. With Space held, arrow keys pan.",
  selectionHidden: "The selected color is outside the visible region. Fit shows the whole field.",
} as const;

/** Display only; the percentage never feeds back into camera mathematics. */
export function formatViewportZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export interface ViewportStatusInput {
  readonly zoom: number;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly x: Readonly<{ start: string; end: string }>;
  readonly y: Readonly<{ start: string; end: string }>;
  /** The selected point is in the editor field but outside the visible region. */
  readonly selectionHidden: boolean;
}

/** Description of the current camera, read on focus and never announced per wheel or pan event. */
export function viewportStatusCopy(input: ViewportStatusInput): string {
  return `Zoom ${formatViewportZoom(input.zoom)}. Horizontal ${input.xLabel} ${input.x.start} to ${input.x.end}. Vertical ${input.yLabel} ${input.y.start} to ${input.y.end}.${input.selectionHidden ? ` ${viewportCopy.selectionHidden}` : ""}`;
}
