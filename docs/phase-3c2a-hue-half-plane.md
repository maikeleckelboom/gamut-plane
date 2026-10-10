# Phase 3C.2A: Hue half-plane geometry and topology

Starting commit: `d2967ee19ab5c886041b697793a236366d2f1c66` on `dev`, fetched and clean before work. This milestone adds scientific geometry only. The lightness generator, core conversion and gamut tolerances, radial mesh, application, adapters and authored-color contracts are unchanged.

## Decision

Use **projective homogeneous radial construction** as the internal authority for hue-section geometry. Core remains the authority for numeric definitions, authoring and exact gamut analysis. The generator is `generateHueSection` in the existing unsupported `@gamut-plane/render/internal/spatial` entry. There is no public API addition.

The important finding is stronger than a folded maximum-chroma outline: **sRGB has hue sections with two area sectors whose interiors are disconnected and whose closures meet only at black**. At the canonical blue hue there is also an isolated boundary ray, outside the area contour. Its tip is a touching contact which core's membership-changing ray solver omits. A single loop, convex hull, or maximum-chroma envelope cannot express all three situations truthfully.

The delivered geometry preserves separate ordered loops, their shared black vertex, isolated contact rays, real RGB surface constraints and the artificial neutral-domain edge. It does not claim continuous approximation certification. Numerically ambiguous multiple roots return an explicit failure.

## Definition and derivation

World coordinates are `(a,L,b)`. Fix a **directed** hue `h` and define

\[
P_h(L,C)=(C\cos h,L,C\sin h),\qquad C\ge0.
\]

The section is the inverse image of the closed RGB cube under that embedding. Its in-plane orthonormal basis is `eC=(cos h,0,sin h)`, `eL=(0,1,0)`. Consequently ordinary Euclidean `(L,C)` distance equals world OKLab distance.

For core's matrices `A` (OKLab to cube-root LMS) and `B` (LMS to linear RGB), the inverse conversion is

\[
q(L,C)=B[A(L,C\cos h,C\sin h)^T]^{\circ3}.
\]

Each channel is a homogeneous cubic in `L,C`. In particular `q(sL,sC)=s³q(L,C)`. These are consequences of the conversion, not observed properties of a mesh. The existing core numeric bridge supplies both matrices; this phase adds no conversion engine. The independent experiment uses the separately transcribed [CSS Color 4 XYZ route](https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code). The underlying linear/cube-root construction is also described in [Ottosson's OKLab definition](https://bottosson.github.io/posts/oklab/).

For the built-in gamuts, `L>0` away from black: the sufficient monotonicity condition already established for the lightness section holds for these matrices. The generator checks `lightnessMonotonicityMargin > 1` on every invocation. Black is therefore the only in-gamut point with `L=0`. This justifies a radial chart, but does not justify any monotonicity in chroma.

`t=C/L` is useful algebraically but has an unbounded parameter domain. We instead use its compactification

\[
u={C\over L+C},\quad D(u)=(1-u,u\cos h,u\sin h),\quad 0\le u\le1.
\]

Let `q_i(u)` be the three inverse-RGB cubics at `D(u)`. Write each cone coordinate as `p_k+d_k u`; the coefficients are explicitly `sum_k B_ik * binomial(3,j) * p_k^(3-j) * d_k^j` for powers `j=0..3`.

The admissible direction set and radial cap are

\[
U=\{u:q_i(u)\ge0\ \forall i\},\qquad
s_{max}(u)=[\max_i q_i(u)]^{-1/3}.
\]

Then the complete section, including lower-dimensional contacts, is

\[
\{0\}\ \cup\ \{s(1-u,u):u\in U,\ 0<s\le s_{max}(u)\}.
\]

This is a two-way equivalence: scaling an admissible direction by the cap satisfies all six RGB inequalities; every nonblack section point has exactly one `u` and such a scale. `max q` is positive on admissible nonzero directions because the invertible conversion cannot map a nonzero direction to RGB black. `u=1` is inadmissible by positive lightness, checked by the generated topology. There is no arbitrary chroma ceiling.

## What is proved and what is sampled

- **Proved for the admitted conversion structure:** the section is star-shaped about black, hence path-connected and contractible. Every point contracts to black without leaving the section. Every hue includes a positive-area neighborhood on the positive-chroma side of an interior neutral, so a wholly empty, point-only or line-only success is unreachable.
- **Proved algebraically:** `U` is a finite union of intervals and possibly isolated directions. All interval endpoints occur among the roots of three cubics. Their signs are constant between roots. Outer constraint ownership can change only where `q_i=q_j`, again finitely many cubic roots unless constraints coincide identically.
- **Proved conditionally on resolved roots:** each nontrivial component of `U` gives one boundary loop: a ray from black to its first cap point, the cap curve in increasing `u`, and a ray back to black. Different sectors share only the actual vertex black. An isolated admissible direction gives a line contact, not a fabricated area loop.
- **Not implied:** chroma intervals at fixed lightness are connected, the section is convex, its interior is connected, or its boundary is a graph `C(L)`.
- **Sampled:** one or two sectors for sRGB and one for Display P3 over the reported sweep. This is not a universal one-sector theorem for P3. The algorithm does not rely on it.
- **Numerical rather than formal:** double-precision root isolation and canonical-source residual checks. This implementation does not use exact predicates or outward-rounded interval arithmetic.

The observed sRGB two-sector band begins just above the blue primary hue, approximately `264.05202261637°`. The finite sweep first records two at `264.0522°` and one again at `264.208°`; those sampled endpoints are not exact bifurcation coordinates. At `264.1°`, the directional intervals are approximately `[0,0.3734258836]` and `[0.4060512132,0.4091930947]`. The intervening red-negative pocket excludes directions. Near the upper end that pocket closes as two roots of the red constraint coalesce. Near the lower end the additional sector is born from the blue-edge contact. The section remains connected through black throughout.

A smooth cap can in general turn in `L` under this formulation. On a face with cap polynomial `q=a+bu+cu²+du³`, its stationary lightness parameters solve `3q+(1-u)q'=0`, the quadratic with coefficients `[3a+b,2b+2c,c+3d]`. Chroma stationary parameters solve `3q-uq'=0`, with coefficients `[3a,2b,c]`. The generator inserts active stationary points. The ordinary hue sweep did not reveal a smooth upper-cap lightness turn; the difficult cases here arise from the extra directional sector. The complete contour reverses lightness along its radial sides regardless. No smooth-fold claim is inferred merely from seeing three crossings.

## Alternatives investigated

| Construction                       | Finding                                                                                                                                                                                                                                                                  | Decision                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core fixed-L chroma rays           | Retains multiple membership-changing crossings, but requires lightness sampling and topology tracking across birth/death. Uses a C≤1 search domain. Omits touching contacts; the blue-edge example is reproduced below.                                                  | Independent oracle, not sole topology authority. This supersedes the tentative Phase 3C.1 handoff recommendation to use rays as the primary hue solver. |
| Direct RGB cube-face intersection  | Solve `b(q) cos h - a(q) sin h = 0`, additionally requiring `a(q) cos h + b(q) sin h≥0`. Source-edge identity is strong, but a general face tracer must find all branches and tangent contacts. The positive-lightness face monotonicity proof does not transfer to hue. | Credible but unnecessarily complex for these homogeneous built-ins. No complete competing implementation or timing claim is made.                       |
| Unbounded C/L radial chart         | Gives the same complete radial set, but requires a derived upper parameter bound and care at L=0.                                                                                                                                                                        | Compactify to u; black is explicit, not evaluated through division.                                                                                     |
| Selected compact radial chart      | Complete sign partition from bounded cubic problems, exact lower-cone rays, upper-face ownership from pair differences, no mesh and no geometric welding.                                                                                                                | Smallest construction found that preserves the actual topology.                                                                                         |
| Mesh cut / hull / maximum envelope | Depends on approximating triangles or erases valid topology.                                                                                                                                                                                                             | Rejected as scientific authority.                                                                                                                       |

## Numerical construction and provenance

1. Validate the built-in space, finite explicit hue, tolerance and hard resource ceilings. Normalize with `((h % 360)+360)%360`. `0`, `360`, negative and large finite angles are supported; floating remainder precision is the limit for very large inputs. `h+180` is the opposite half-plane. Null, absent, infinite and NaN hue are invalid, never zero.
2. Form three directional cubics using core-owned matrices. Recursively partition each polynomial by derivative roots, then bisect sign-changing monotone pieces. This isolates close simple-root pairs without relying on a uniform scan.
3. Canonical primary hues are recognized by **exact equality of normalized hue** to the hue observed through core's converted RGB primary. The two lower roots are verified against this named black-to-primary source edge and replaced by that single source event. This is not proximity welding of unrelated structures or a nearest-primary hue policy. Their direction is derived from the same core source point. Nearby hues do not acquire this identity.
4. Classify open intervals between ordered lower roots and retain every admissible interval. At canonical source-edge events, retain isolated admissible rays too.
5. Split cap arcs at active pair-difference roots and active stationary parameters. Evaluate source RGB as `q/max(q)` without clipping or snapping channels. Each arc carries its owning upper face. Each radial side carries its lower face mask; coincident lower faces carry both bits.
6. Refine each curved arc using quarter, midpoint and three-quarter point-to-chord distances. Subdivide at its parameter midpoint until all three probes satisfy the target. Retain endpoint IDs across adjacent arcs. Lower rays and the neutral axis are analytic straight segments and need no refinement.
7. Return Float64 world/source buffers, ordered loops, separate contact arcs and measured quality. An error never includes partial geometry.

Face bits use the established `2*channel+bound` convention. Vertex masks record all constraints binding within `2e-11` linear RGB. Thus two bits identify a cube edge, three bits a corner. These masks describe numerical provenance, not a change to core membership tolerance. Source RGB is retained unmodified, including rounding-scale excursions. The highest observed binding residual is `8.18e-13` in the reported sweep.

The neutral edge has `kind="domain-neutral"`, zero interior face mask, and `geometry="line"`. Its interior is generally inside the 3D gamut. Its endpoints retain black/white surface provenance. All other arcs have `kind="gamut-surface"`; upper caps are `sampled-curve` and lower-cone generators are `line`. An endpoint's constraint mask conveys corner/coincident semantics. `events` distinguish constraint changes and smooth coordinate-stationary points. `contacts` references isolated line arcs outside the area loops.

## Degeneracy and failure semantics

The canonical sRGB blue hue has one region loop **and an isolated black-to-blue contact ray**. The ray carries `R=0,G=0` (mask 5); its tip additionally binds `B=1` (mask 37). At `L=0.4520137181744236`, core returns the ordinary exit near `C=0.2655916254` but omits the blue touching point at `C=0.3132143886`. The generator retains it. Independent CSS inverse probes along the complete ray verify `(0,0,s³)`, including near black. This is an explicit reproduction of core's established limitation, not a core correction.

The other canonical primaries and the secondaries are also covered; all 12 gamut/corner fixtures produce geometry. Their maximum independent source-corner distance is below `1e-15` in the report.

| Outcome                  | Meaning                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok: true, kind: region` | A positive-area region, potentially several area loops sharing black, with optional isolated contact rays. No wholly empty/degenerate success category is invented. |
| `invalid-options`        | Unsupported space, nonfinite/missing hue, invalid tolerance, invalid limits or limits above hard ceilings.                                                          |
| `resource-budget`        | Polynomial work, bisection iteration, refinement depth or vertex limit reached. The contour is unavailable, not empty.                                              |
| `numerical-failure`      | Unresolved multiple root/coincident lower-root ordering, invalid radial cap, cube residual failure, unverifiable source edge or unsupported numeric structure.      |

**Remaining numerical exclusion:** a polynomial critical value within `64*epsilon*sum(abs(coefficients))` of zero cannot reliably distinguish a double contact from a tiny pair, so it fails closed. Two lower root parameters less than `1e-12` apart also fail unless the canonical source identity above resolves them. Identically coincident polynomials fail explicitly. These diagnostics are conservative floating-point guards, not certified error intervals. Very near a bifurcation, including hues ±`1e-12` from canonical blue in the tests, callers must handle unavailable geometry. We do not silently snap the hue, remove a lobe, join close rays or label that result successful. Resolving every such binary64 input would require stronger root predicates; it is not established here.

## Result contract and resource limits

`HueSectionOptions` accepts `{space,hue,chordTolerance?,limits?}`. It accepts no `ColorValue`, cache, camera or DOM object. `HueSection` contains space, requested and normalized hue, coordinate/revision identity, Float64 positions and source RGB, `(L,C,u)` vertex facts, face masks, indexed ordered arcs, area loops, isolated contact arcs, events, section-coordinate bounds and measured quality/work. `u=null` at the sole shared black vertex. Loops run counterclockwise in `(L,C)` coordinates; this is clockwise if displayed with C horizontal and L vertical, which a future fill triangulator must account for.

The bounds include sampled cap vertices and resolved stationary extrema, but remain numerical bounds rather than certified enclosures. Arc vertex arrays encode connectivity without a GPU topology contract. No triangulation or universal section abstraction is introduced.

Hard ceilings, reducible per invocation:

- 100,000 scalar polynomial evaluations, covering sign/root work and directional conversions.
- 80 bisection iterations per monotone root interval; degree is at most three.
- 20 refinement levels and 8,192 output vertices. Arc/segment counts are consequently bounded.
- Three fixed primary conversions in addition to directional polynomial evaluations. Their batch input is nine doubles.

The roots/events are bounded by the fixed polynomial degrees: three lower cubics, three pair-difference cubics and six stationary quadratics. Temporary coordinate/source arrays contain six numeric slots per output vertex before Float64 copying. Refinement uses depth-first recursion, retaining at most `5+3*depth` point records. Retained typed buffers are exactly 48 bytes per vertex. JS arrays, vertices, indices, events and object headers cost additional engine-dependent memory; no precise heap-byte measurement is claimed. The report includes actual buffer bytes and the structural point-record peak, not invented allocation profiler results. No worker or global cache is used.

## Independent qualification and measurements

Full data and worst-case coordinates are in [phase-3c2a-hue-measurements.json](phase-3c2a-hue-measurements.json). Reproduce after package builds:

```powershell
node packages/render/scripts/qualifyHueSection.ts > docs/phase-3c2a-hue-measurements.json
pnpm --filter @gamut-plane/render exec vitest run test/spatialHueSection.test.ts
```

The independent reference uses CSS RGB→XYZ→LMS matrices and their separately computed inverse, not the production coefficient construction or root solver. It scans 16,384 projective intervals, bisects raw channel sign changes, builds a dense cap and includes lower radial edges. Scans can miss sub-grid root pairs. They are independent numerical evidence, not proof of global topology. The production root partition supplies the structural argument.

True-reference boundary vertices are measured against the production polyline. Nine positions per production segment (including endpoints) are measured against the dense independent reference polyline in the reverse direction. The latter reference itself has finite discretization error. Both are explicitly sampled distances, not a continuous Hausdorff bound. Worst coordinates and hue are retained per case. Core comparisons independently exercise fixed-lightness rays, including near-black and near-white levels. Any crossing-count discrepancy is retained with a separate raw CSS scan and fails the harness gate; touching-corner fixtures are reported separately instead of being forced through a membership-changing-crossing assertion.

| Measurement                                      |                     sRGB |               Display P3 |
| ------------------------------------------------ | -----------------------: | -----------------------: |
| Generated hue cases (each repeated for equality) |                    3,439 |                    3,439 |
| Independent dense contour cases                  |                      113 |                      113 |
| Core fixed-L rays                                |                   20,384 |                   20,384 |
| Core crossing-count discrepancies                |                        0 |                        0 |
| Max reference-to-polyline distance               |                 9.996e-6 |                 9.999e-6 |
| Max polyline-to-reference distance               |                 9.996e-6 |                 9.999e-6 |
| Max core-crossing distance                       |                 9.905e-6 |                 9.974e-6 |
| Vertices (min / median / max)                    |              9 / 52 / 70 |             10 / 49 / 70 |
| Scalar evaluations (median / max)                |            1,733 / 2,330 |            1,582 / 2,397 |
| Directional + primary conversions (median / max) |                308 / 413 |                290 / 413 |
| Retained typed buffers (max)                     |              3,360 bytes |              3,360 bytes |
| Structural live refinement point records (max)   |                       23 |                       23 |
| CPU generation median / p95 / worst              | 0.089 / 0.228 / 1.106 ms | 0.183 / 0.520 / 1.494 ms |

Timing is Windows x64, Node 24.16.0, the CPU named in JSON, after 100 warmups. The difficult hue band is deliberately overrepresented, so these medians are not uniform-hue user-traffic estimates. Tail timings include runtime noise; no browser/GPU/thermal claim follows. The report records generator revision and SHA-256 digests of the actual source, oracle and harness bytes, including platform line endings. No worker is justified by these costs. A future host can coalesce hue changes to the latest accepted direction once per frame and measure real interaction before changing scheduling.

All measured repeats are identical, no sampled vertex is outside according to core, and the independently converted source RGB differs by at most `5.2e-15`. The hard fixtures `(L,h)=(0.44,264.1)` and `(0.006,264.125)` retain all three crossings; independent raw CSS scans confirm them. Ordinary hues, neighboring difficult hues, cube corners, opposite directions, near-white/black levels down to `1e-12`, explicit work exhaustion, missing hue, unchanged inputs and ambiguous-root failures are tested.

The default `1e-5` sampled chord target corresponds to approximately `0.076` CSS pixels at the existing declared 900px/1.42-unit stage and 12× zoom. This justifies the target as a presentation judgment; it is neither a display guarantee nor a reason to weaken topology.

## Validation and boundaries

Focused tests and the qualification harness cover numerical construction, independent conversion/contours, graph identity, source constraints, deterministic output, multiple sectors, the canonical isolated contact, normalization and failure/resource semantics. Existing lightness tests and tolerances are untouched. Installed-package checks exercise the new internal export and multi-sector output through Node; the explicit export inventory is updated. The public root remains unchanged and the scientific entry allocates no DOM/GPU resources.

Repository gates and exact-final-commit CI results are recorded in the delivery report. No pre-push or pending CI check is asserted by this document. There are no rendered behavior changes in this phase; the existing complete browser and SSR matrices remain regression gates in CI.

## Phase 3C.2B handoff

Use `eC=(cos h,0,sin h)` as screen right and `eL=(0,1,0)` as screen up. Their cross product is `n=(-sin h,0,cos h)`, the vector **from section toward camera**. A camera on `center+d*n`, looking at center with world up `eL`, gives C right and L up without mirroring. Viewing from the opposite side reverses horizontal orientation. Preserve equal unit scaling. Do not infer an undirected hue axis from a full clipping plane.

The smallest coherent next implementation is a host-owned follow/inspect hue model plus renderer presentation of these arcs/contact rays, followed by browser journeys proving editor correspondence. A future cap fill must triangulate each sector independently and must not fill contact rays or bridge sectors across black. Distinguish the neutral domain edge visually from the RGB surface. Unavailable geometry requires explicit current-state feedback; never retain a stale contour as if it represented the current hue.

Keep three intentions separate: authored color, inspected hue, and camera/presentation. Follow hue uses an accepted meaningful observed chromatic hue. An achromatic color's undefined hue is valid color state; retain a previous viewing direction if one exists, or establish a disclosed initial inspection direction. Neither is recovered authorship. Missing hue must not be passed as zero to this generator or inserted into `ColorValue`.

Independent inspection keeps the selected marker at its true `(a,L,b)`. Report its signed normal displacement and radial coordinate: a point can lie on the full plane but on the opposite half-plane, so plane distance alone is insufficient. Any drop/projection cue must be explicitly secondary and must not move the marker or create an apparent selected point on the section. Keep the Phase 3C.1-R explicit alignment, comparison framing, user-owned camera, persistent cut-side intent, Fit section, Fit visible and surface-hiding marker recovery. Choosing or scrubbing hue must not silently refit, flip the cut or reauthor the color.

## Remaining limits

This is bounded double-precision scientific geometry with sampled curved-segment accuracy. It is not exact arithmetic, a proof of the error between probes, a claim that every finite hue resolves successfully, or browser/GPU qualification. Conservative unavailable bands around unresolved multiple roots remain. Exact canonical primary contacts are supported by source identity; arbitrary rounded nearby hues do not receive that identity. P3's observed single-sector behavior is not promoted to a theorem. Core's touching-contact omission is reproduced and left unchanged. No interactive controls, camera behavior, cap triangulation, new color spaces or mesh changes are included.
