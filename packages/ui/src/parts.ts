/** Shared generalized anatomy; adapters render their own native markup and lifecycle. */
export const gpPart = {
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
  referenceConnector: "reference-connector",
  referenceWarning: "reference-warning",
  axis: "axis",
  renderStatus: "render-status",
  channel: "channel",
  channelSymbol: "channel-symbol",
  channelHeader: "channel-header",
  numericInput: "numeric-input",
  channelTrack: "channel-track",
  channelField: "channel-field",
  nativeRange: "native-range",
  gamutInterval: "gamut-interval",
  representationControl: "representation-control",
  authorshipContext: "authorship-context",
  inspectionReadout: "inspection-readout",
  exactResults: "exact-results",
  exactResult: "exact-result",
  gamutDisclosure: "gamut-disclosure",
  guidePreference: "guide-preference",
  availabilityMessage: "availability-message",
} as const;

export type GpPart = (typeof gpPart)[keyof typeof gpPart];

/** Attributes shared by both adapters. */
export const gpAttribute = {
  root: "data-gp-root",
  part: "data-gp-part",
  view: "data-gp-view",
  gamut: "data-gp-gamut",
  marker: "data-gp-marker",
  axis: "data-gp-axis",
  channel: "data-gp-channel",
  status: "data-gp-status",
  overflow: "data-gp-overflow",
  pointerFocus: "data-gp-pointer-focus",
  visuallyHidden: "data-gp-visually-hidden",
} as const;

export const gpMarker = { active: "active", reference: "reference" } as const;
export const gpAxis = { x: "x", y: "y" } as const;
export const gpGamut = { srgb: "srgb", displayP3: "display-p3" } as const;
