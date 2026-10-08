import { gpAttribute, gpMarker, gpPart } from "./parts.js";
import { planeAxisEnds, planeAxisSpans, type PlaneAxisBounds } from "./planeAxisEnds.js";
import { formatViewportZoom, viewportStatusCopy } from "./viewportCopy.js";

/** Everything one presented camera frame changes outside the raster, as plain computed values. */
export interface ViewportPresentation {
  readonly zoom: number;
  /** Zoom readout, for example `200%`. */
  readonly zoomText: string;
  readonly viewBox: string;
  /** Left and top of the reference marker, or `null` when there is none. */
  readonly reference: Readonly<Record<string, string>> | null;
  /** Box of the OKLab domain outline, or `null` for the stylesheet's own fit. */
  readonly domain: Readonly<Record<string, string>> | null;
  readonly axisEnds: Readonly<{
    xStart: string;
    xEnd: string;
    yStart: string;
    yEnd: string;
  }>;
  readonly status: string;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  readonly canFit: boolean;
}

export interface ViewportPresentationInput {
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Visible field window in normalized field coordinates. */
  readonly window: Readonly<{ left: number; top: number; width: number; height: number }>;
  readonly xAxis: PlaneAxisBounds & { readonly label: string };
  readonly yAxis: PlaneAxisBounds & { readonly label: string };
  readonly viewBox: string;
  readonly reference: ViewportPresentation["reference"];
  readonly domain: ViewportPresentation["domain"];
  /** The selected point is in the editor field but outside the visible region. */
  readonly selectionHidden: boolean;
}

/** Display values for one camera frame; ranges are descriptions and never feed camera math. */
export function viewportPresentation(input: ViewportPresentationInput): ViewportPresentation {
  const spans = planeAxisSpans(input.window);
  const x = planeAxisEnds(input.xAxis, spans.x);
  const y = planeAxisEnds(input.yAxis, spans.y);
  const zoomText = formatViewportZoom(input.zoom);
  const status = viewportStatusCopy({
    zoom: input.zoom,
    xLabel: input.xAxis.label,
    yLabel: input.yAxis.label,
    x,
    y,
    selectionHidden: input.selectionHidden,
  });
  return {
    zoom: input.zoom,
    zoomText,
    viewBox: input.viewBox,
    reference: input.reference,
    domain: input.domain,
    axisEnds: { xStart: x.start, xEnd: x.end, yStart: y.start, yEnd: y.end },
    status,
    canZoomIn: input.zoom < input.maxZoom,
    canZoomOut: input.zoom > input.minZoom,
    canFit: input.zoom > input.minZoom,
  };
}

const DOMAIN_PROPERTIES = ["left", "top", "width", "height"] as const;
const END_PART: Record<string, keyof ViewportPresentation["axisEnds"]> = {
  "x-start": "xStart",
  "x-end": "xEnd",
  "y-start": "yStart",
  "y-end": "yEnd",
};

function part(root: ParentNode, name: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-gp-part="${name}"]`);
}

function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

function setDisabled(element: Element | null, disabled: boolean): void {
  // aria-disabled keeps the button focusable so a command that reaches its limit does not drop focus.
  if (!element) return;
  if (disabled) element.setAttribute("aria-disabled", "true");
  else element.removeAttribute("aria-disabled");
}

/**
 * Applies the camera-dependent DOM for one frame: SVG view box, reference marker, domain outline,
 * axis readouts and the viewport controls. Called synchronously from the camera's present callback
 * and again after any framework patch that could have restored declarative field-space values.
 * The active marker is positioned by the adapter, which owns its element and preview state.
 */
export function applyViewportPresentation(plane: HTMLElement, next: ViewportPresentation): void {
  const guides = part(plane, gpPart.gamutGuides);
  if (guides && guides.getAttribute("viewBox") !== next.viewBox)
    guides.setAttribute("viewBox", next.viewBox);

  const reference = plane.querySelector<HTMLElement>(
    `[data-gp-part="${gpPart.marker}"][data-gp-marker="${gpMarker.reference}"]`,
  );
  if (reference && next.reference) Object.assign(reference.style, next.reference);

  const domain = part(plane, gpPart.domainBoundary);
  if (domain) {
    if (next.domain) Object.assign(domain.style, next.domain);
    else for (const property of DOMAIN_PROPERTIES) domain.style.removeProperty(property);
  }

  for (const end of plane.querySelectorAll<HTMLElement>(`[data-gp-part="${gpPart.axisEnd}"]`)) {
    const key = END_PART[end.dataset.gpEnd ?? ""];
    if (key) setText(end, next.axisEnds[key]);
  }

  plane.setAttribute(gpAttribute.viewportZoom, String(Number(next.zoom.toFixed(6))));
  setText(part(plane, gpPart.viewportZoom), next.zoomText);
  setText(part(plane, gpPart.viewportStatus), next.status);
  setDisabled(plane.querySelector(`[${gpAttribute.viewport}="in"]`), !next.canZoomIn);
  setDisabled(plane.querySelector(`[${gpAttribute.viewport}="out"]`), !next.canZoomOut);
  setDisabled(plane.querySelector(`[${gpAttribute.viewport}="fit"]`), !next.canFit);
}
