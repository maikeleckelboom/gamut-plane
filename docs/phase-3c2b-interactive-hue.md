# Phase 3C.2B: Interactive hue half-plane

## Checkpoint A: numerical hardening

Baseline: `36fc968e7bb3df2094529c16a5766ae3c7c8a9a1`, fetched on clean `dev`.
The original isolator rejects `(u-0.5)^3-0.01` with `unresolved multiple root near u=0.5`.
The original polynomial has a simple root; only its derivative has a repeated stationary root.

For a cubic, the derivative is quadratic. Around its vertex, a rounding-scale critical value
now produces an uncertainty **interval**, wide enough to include a possible pair of derivative
roots under the existing coefficient-scale diagnostic envelope. The mean-value bound
`sum(abs(derivative coefficients))*radius` bounds variation of the original polynomial on
that interval inside `[0,1]`. Only if its value exceeds this bound plus its own rounding
envelope is the interval excluded as root-free. The remaining monotone pieces are bisected
normally. No roots are merged, snapped, or inferred at the stationary point.

This is still conservative binary64 numerical reasoning, not outward-rounded interval
certification. Original double/triple roots, ambiguous close pairs and coincident constraints
remain unavailable. Tests cover both offset cubics, three ordinary roots, close distinct roots,
near-endpoint roots, unresolved pairs, resource exhaustion and deterministic output.

The unchanged Phase 3C.2A qualification harness is extended with independent filled-region
interpretation. Even/odd polygon tests are performed separately for each returned sector;
contacts contribute no area. Rectangular and directional samples cover ordinary hues,
264.1/264.125 degrees, sector gaps, source-corner hues, and near-black/white points.
Authoritative `analyzeGamut` checks use the original sampled OKLab color. Points within twice
the sampled chord tolerance or a `2e-6` independent inverse-RGB boundary margin are counted
separately, not claimed as unambiguous membership evidence.

Results: [machine-readable qualification](phase-3c2b-hue-measurements.json).
The prior Phase 3C.2A report is retained. Polynomial evaluation counts gain the explicit
derivative-vertex check, and source digests identify the implementation. Node timings are CPU
observations, not browser or physical-GPU guarantees.

Integration exposed a second numerical defect: `((h % 360) + 360) % 360` can perturb an
already positive normalized double on a second invocation. Canonical blue therefore lost
its exact source-edge identity when fed back through a positive-valued UI control. Revision
`hue-section-projective-v2` adds 360 only to negative remainders, preserving already normalized
values exactly. A regression passes the canonical result hue back into the generator and
requires identical positions and contact indices. The full qualification is rerun for this
revision; no near-hue snapping is introduced.

Reproduce after building packages:

```powershell
pnpm --filter @gamut-plane/render exec vitest run test/huePolynomial.test.ts test/spatialHueSection.test.ts
node packages/render/scripts/qualifyHueSection.ts > docs/phase-3c2b-hue-measurements.json
```

Checkpoint A validation: 18 focused tests passed; the complete scientific qualification passed
for 3,439 generated hues per gamut, with no membership disputes in the added sample set.
