/** Stable v0.3 anatomy; adapters render their own native markup and lifecycle. */
export const gpPart = {
  viewControl: "view-control",
  viewOption: "view-option",
  workspace: "workspace",
  field: "field",
  controls: "controls",
  plane: "plane",
  surface: "surface",
  canvas: "canvas",
  domainBoundary: "domain-boundary",
  gamutGuides: "gamut-guides",
  gamutBoundary: "gamut-boundary",
  boundaryHit: "boundary-hit",
  marker: "marker",
  guideConnector: "guide-connector",
  warning: "warning",
  warningGlyph: "warning-glyph",
  axis: "axis",
  renderStatus: "render-status",
  channel: "channel",
  channelHeader: "channel-header",
  numericInput: "numeric-input",
  channelTrack: "channel-track",
  channelField: "channel-field",
  nativeRange: "native-range",
  gamutInterval: "gamut-interval",
  boundaryPreview: "boundary-preview",
  coordinateReadout: "coordinate-readout",
  targetResult: "target-result",
  targetHeading: "target-heading",
  targetSwatch: "target-swatch",
} as const;

export type GpPart = (typeof gpPart)[keyof typeof gpPart];

/** Only attributes that express the accepted current instrument contract. */
export const gpAttribute = {
  root: "data-gp-root",
  part: "data-gp-part",
  view: "data-gp-view",
  gamut: "data-gp-gamut",
  marker: "data-gp-marker",
  axis: "data-gp-axis",
  channel: "data-gp-channel",
  status: "data-gp-status",
  warning: "data-gp-warning",
  overflow: "data-gp-overflow",
  pointerFocus: "data-gp-pointer-focus",
} as const;

export const gpMarker = { active: "active", targetGuide: "target-guide" } as const;
export const gpAxis = { x: "x", y: "y" } as const;
export const gpChannel = { h: "h", l: "l", c: "c" } as const;
export const gpGamut = { srgb: "srgb", displayP3: "display-p3" } as const;
export const gpView = { oklch: "oklch", oklab: "oklab" } as const;
export const gpStatus = {
  inside: "inside",
  withinTolerance: "within-tolerance",
  outside: "outside",
} as const;
