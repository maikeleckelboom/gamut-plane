# 0001 — Coordinate planes project canonical OKLCH

Status: accepted

## Decision

Gamut Plane presents two first-class views over one canonical `OklchColor`:

- OKLCH lightness/chroma at fixed hue;
- OKLab `a`/`b` at fixed OKLab lightness.

They are coordinate views, not separate color authorities. Switching planes changes view state only and must not round-trip or rewrite the active color.

## OKLCH lightness/chroma plane

The mapping is:

```text
x = C / 0.4
y = 1 - L
```

Hue is the fixed axis. Each chroma column contains sampled lightness color rather than a decorative two-stop approximation. The rectangular instrument may show and edit colors beyond both displayed RGB gamuts. It clamps pointer geometry only to the documented instrument bounds, never to a gamut boundary.

## OKLab a/b plane

The mapping projects canonical OKLCH through OKLab at fixed OKLab lightness. The square field shows color evidence outside the circular `C = 0.4` editable domain; a neutral circle identifies that domain without masking the corners.

Pointer and `a`/`b` keyboard edits are constrained to the circular instrument domain. Fixed-lightness edits preserve the raw transient `a`/`b` coordinate even when the visible marker projects to the domain edge. The disc is an instrument constraint, not an RGB gamut boundary.

## Dual-boundary evidence

Both planes show Display P3 and sRGB together:

- Display P3 is the primary solid boundary;
- sRGB is the secondary dashed boundary;
- the active point may cross either boundary;
- neither boundary clamps or replaces canonical OKLCH;
- the sRGB boundary projection remains a separate guide and value.

Boundary visibility is view state, not an output-policy selector.

## Exact facts and interpolated guides

The instrument distinguishes two evidence classes:

1. Exact inside/outside membership comes from direct color conversion for the active color.
2. Boundary contours, crossing ticks, and the sRGB boundary projection come from deterministic interpolation over generated gamut-boundary tables bundled with the web app.

Interpolated geometry is visualization. It cannot be used as exact membership, silently mutate the active color, or substitute for exact serialization.

## Interaction consequences

- Both planes provide pointer and complete keyboard operation.
- Live pointer movement is coalesced to one pending animation frame.
- A completed interaction emits one commit; cancellation restores the interaction origin.
- Plane switching performs no color round trip.
- Canvas capability changes painted preview colors only, never gamut truth.
- Canvas backing dimensions follow the actual device pixel ratio and are invalidated when display resolution changes.
- Generated numeric tables and reusable buffers stay outside component-owned domain logic.
- Same-plane visible-axis movement does not invalidate the field or contours; fixed-axis movement does.
- Additional editable coordinate spaces require a separate decision. This contract is not a plugin system.
