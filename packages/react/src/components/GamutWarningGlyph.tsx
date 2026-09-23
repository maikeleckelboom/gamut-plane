import { PICKER_WARNING_GLYPH_SIZE } from "@gamut-plane/render";

export function GamutWarningGlyph() {
  return (
    <svg
      className="gpr-gamut-warning-glyph"
      width={PICKER_WARNING_GLYPH_SIZE}
      height={PICKER_WARNING_GLYPH_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-gamut-warning-glyph=""
    >
      <path className="gpr-gamut-warning-glyph-keyline" d="M8 1.75 14.25 8 8 14.25 1.75 8Z" />
      <path className="gpr-gamut-warning-glyph-core" d="M8 5.15v4.15m0 2.15v.05" />
    </svg>
  );
}
