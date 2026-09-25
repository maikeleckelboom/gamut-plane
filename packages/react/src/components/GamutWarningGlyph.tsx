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
      <path d="M8 1.5 14.25 13.5H1.75Z" />
    </svg>
  );
}
