# 0003 - Coordinate planes project canonical OKLCH

Status: accepted.

## Decision

Chromavert has two first-class planar instruments:

- OKLCH Lightness/Chroma at fixed hue;
- OKLab a/b at fixed OKLab lightness.

Both are central Pick views over one canonical `ChromavertColor`. They are not separate color authorities, optional demonstrations, or competing product modes. Switching planes changes view state only and must not rewrite the color, regenerate the scale, change Theme assignments, alter exports, or affect the output hash.

Edits unproject through `@chromavert/color` into canonical OKLCH. Input syntax records provenance; it does not select another canonical RGB, Display P3, OKLab, or CIE Lab editing model.

## OKLCH Lightness/Chroma plane

The accepted mapping is:

    x = C / 0.4
    y = 1 - L

Hue is the fixed axis. The field preserves the accepted gradient-like construction: each chroma column contains sampled lightness color rather than a decorative two-stop approximation. The rectangular instrument may show and edit colors beyond both displayed RGB gamuts. It clamps pointer geometry only to its documented instrument bounds, never to a gamut boundary.

## OKLab a/b plane

The accepted mapping projects canonical OKLCH through OKLab at fixed OKLab lightness. The square field continues to show truthful color evidence outside the circular `C = 0.4` editable domain; a neutral one-pixel circle identifies that domain without masking the corners.

Pointer and a/b keyboard edits remain constrained to the circular instrument domain. Fixed-lightness edits preserve the raw transient a/b coordinate even when the visible marker projects to the domain edge. The disc is an instrument constraint, not an RGB gamut boundary.

## Dual-boundary evidence

Both planes show Display P3 and sRGB together:

- Display P3 is the primary boundary;
- sRGB is the secondary boundary;
- the active point may cross either boundary;
- neither boundary clamps or replaces canonical OKLCH;
- any derived sRGB fallback remains a separate guide and value.

The plane selector is view state. The dual-boundary contract is not replaced by an output-policy selector.

## Exact facts and interpolated guides

The interface distinguishes two evidence classes:

1. Exact inside/outside membership comes from direct color conversion for the active color.
2. Boundary contours, slider intervals, crossing ticks, and interaction fallback guides come from deterministic interpolation over generated gamut-boundary tables bundled with the web application.

Interpolated geometry must be labeled and treated as visualization. It cannot be used as exact membership, silently mutate authored state, or substitute for the exact fallback and serialization paths used by Proof and Export.

## Interaction consequences

- Both planes provide pointer and complete keyboard operation.
- Live movement may update connected Scale, Theme, and Proof context without committing route state on every frame.
- Commit events update the shareable authored color once.
- Plane switching performs no color round trip.
- Canvas capability changes preview rendering only, never gamut truth.
- Canvas backing dimensions follow the actual device pixel ratio and are invalidated when display resolution changes.
- Generated numeric tables and reusable buffers stay out of component-owned domain logic; table generation never runs during application startup or interaction.
- Additional editable coordinate spaces require a separate product decision; the plane contract is not a plugin system.
