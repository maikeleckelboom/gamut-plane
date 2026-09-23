# 0001: Coordinate planes project canonical OKLCH

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

The mapping projects canonical OKLCH through OKLab at fixed OKLab lightness. The square field shows colors outside the circular `C = 0.4` editable domain; a neutral circle identifies that domain without masking the corners.

Pointer and `a`/`b` keyboard edits are constrained to the circular instrument domain. Fixed-lightness edits preserve the raw transient `a`/`b` coordinate even when the visible marker projects to the domain edge. Canonical colors supplied outside either active plane remain unchanged while their marker is positioned at the visible edge; last-bit normalized-coordinate noise at that edge is treated as in-domain. The disc is an instrument constraint, not an RGB gamut boundary.

## Gamut boundaries

Both planes show Display P3 and sRGB together:

- Display P3 is the primary solid boundary;
- sRGB is the secondary dashed boundary;
- the active point may cross either boundary;
- neither boundary clamps or replaces canonical OKLCH;
- the explicit sRGB or Display P3 target remains independent from guide visibility, which controls all visual guide/projection overlays for that gamut.

Boundary target is controlled projection/reference state and defaults to sRGB. Boundary visibility is independent view state, not an output-policy or target selector.

## Exact facts and interpolated guides

Membership and guides use different calculations:

1. Exact inside/outside membership comes from direct color conversion for the active color.
2. Boundary contours, channel intervals, boundary-guide colors and target projections come from deterministic interpolation over generated gamut-boundary tables bundled with the render package.

Interpolated geometry is visualization. It cannot be used as exact membership, silently mutate the active color, or substitute for exact serialization.

## Interaction consequences

- Both planes provide pointer and complete keyboard operation.
- Live pointer movement is coalesced to one pending animation frame.
- Completed color edits emit a commit. Cancelling a plane drag restores its starting color unless a parent replacement or view change supersedes it. Native ranges retain published values when interrupted; see the [interaction lifecycle](../architecture.md#interaction-lifecycle).
- Plane switching performs no color round trip.
- Canvas capability changes painted preview colors only, never gamut truth.
- Canvas backing dimensions follow the actual device pixel ratio and are invalidated when display resolution changes.
- Core owns projection and sampling math. The Vue package owns the generated table artifact and reusable rendering buffers.
- Same-plane visible-axis movement does not invalidate the field or contours; fixed-axis movement does.
- Additional editable coordinate spaces require a separate decision. This contract is not a plugin system.
