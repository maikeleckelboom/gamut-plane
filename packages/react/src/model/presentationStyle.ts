import type { CSSProperties } from "react";

/** Private presentation variables; this does not widen the public style API. */
export function presentationStyle(
  style: CSSProperties & {
    [key: `--${string}`]: string | number | undefined;
  },
): CSSProperties {
  return style;
}
