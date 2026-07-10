export interface PickerInstrumentOffset {
  x: number;
  y: number;
}

export const PICKER_WARNING_GLYPH_SIZE = 14;
export const PICKER_WARNING_PREFERRED_OFFSET: Readonly<PickerInstrumentOffset> = Object.freeze({
  x: 16,
  y: -16,
});
export const PICKER_WARNING_SURFACE_INSET = 3;
export const PICKER_WARNING_MARKER_CLEARANCE = 3;
export const PICKER_ACTIVE_MARKER_RADIUS = 9;
export const PICKER_FALLBACK_MARKER_RADIUS = 5.5;

export const PICKER_BRACKET_CAP_LENGTH = 4;
export const PICKER_BRACKET_LANE_INSET = 2;
export const PICKER_BRACKET_CORE_WIDTH = 1;
export const PICKER_BRACKET_KEYLINE_WIDTH = 3;
export const PICKER_SRGB_DASH_LENGTH = 3;
export const PICKER_SRGB_DASH_GAP = 3;

export const PICKER_SLIDER_FIELD_INSET = 5;
export const PICKER_SLIDER_THUMB_WIDTH = 10;
export const PICKER_SLIDER_EDGE_CLEARANCE = 2;
export const PICKER_SLIDER_WARNING_TOP = -5;
