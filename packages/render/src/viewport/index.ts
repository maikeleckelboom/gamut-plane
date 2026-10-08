/**
 * Internal sibling-package entry for the field camera. Adapters import it; it is not a consumer
 * API, and the UI package reaches it only through typed ports.
 */
export {
  assertViewport,
  constrainViewport,
  fieldToViewport,
  FIT_SAMPLE_WINDOW,
  FIT_VIEWPORT,
  isFitViewport,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  panViewport,
  sampleWindow,
  viewportsEqual,
  viewportToField,
  zoomViewportAt,
} from "./math.js";
export type { FieldSampleWindow, FieldViewport } from "./math.js";
export { createViewportCamera } from "./camera.js";
export type { ViewportCamera, ViewportCameraOptions } from "./camera.js";
export { viewportDomainStyle, viewportPointStyle, viewportSvgViewBox } from "./presentation.js";
