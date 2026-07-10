# 0003 — Coordinate planes project canonical OKLCH

Status: accepted.

## Decision

Chromavert remains a high-gamut OKLCH color-system instrument. `ChromavertColor` remains the one canonical editable color model throughout the engine, scale generation, Proof, fallback, export, and deterministic hashing paths.

Editable coordinate planes are projections over canonical OKLCH state, not alternative canonical models. Changing the active plane changes view state only. Edits made within a plane unproject through `@chromavert/color` into a canonical `ChromavertColor`.

The existing OKLCH Lightness/Chroma plane at fixed hue remains supported. An OKLab a/b plane at fixed OKLab lightness is accepted because it adds useful Cartesian perceptual reasoning with limited engine and product complexity.

CIE Lab a*/b* planar editing is not approved by this decision.

## Conversion boundary

CIE Lab/LCH parsing, serialization, readouts, and conversion pages belong to the existing Phase 3 conversion work. That work is timeboxed and narrow: truthful parsing, serialization, readouts, copyable conversions, and a small number of supported routes. It is not an open-ended generic converter.

The CIE Lab plane must later be weighed directly against starting full Proof. Proof retains strategic priority as Chromavert's signature surface.

## Consequences

- no `OKLCH | OKLab | Lab | RGB` union becomes canonical state
- plane selection cannot affect scale generation, fallback, export artifacts, or output hashes
- plane switching cannot perform a projection round trip or write a new color
- pointer and a/b keyboard edits use the active plane's instrument-constrained unprojection path
- fixed-axis editing uses a separate axis-only path; changing OKLab L preserves the raw transient a/b coordinates even when the visible marker is projected to the instrument boundary
- the plane contract is limited to the accepted OKLCH and OKLab views rather than becoming a plugin system
- CIE Lab/LCH and unrelated editable coordinate spaces remain outside this decision
