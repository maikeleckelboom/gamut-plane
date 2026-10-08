# Phase 2O boundary certification investigation

Historical investigation under the original formal contract. **Subsequent explicit product decision, 8 October 2026:** the user accepted Outcome B and adopted the empirically validated visual-approximation alternative. See [ADR 0004](decisions/0004-field-viewport.md#approved-acceptance-revision-8-october-2026) and [current acceptance](phase-2o-acceptance.md). The findings, failed obligations, partial certificates and recommendation below remain the investigation's original conclusions; its then-current acceptance blocker is superseded by that decision.

8 October 2026. **Outcome B: the investigated certification paths are disproportionate for production adoption. Phase 2O remains unaccepted.** No runtime, test, dependency, export, screenshot or acceptance-criterion change was made. This is an engineering recommendation, not an accepted contract change.

## 1. Baseline

Branch `dev`, HEAD `d726a65fc3a44010c2edc92f92406fbc7f9a1136`. Initial tree: 87 modified tracked files, 27 untracked files, no staged files. The untracked files include the current Phase 2O numerical implementation. Node 24.16.0, pnpm 11.9.0, Windows 10.0.26300, Ryzen 7 8845HS. The package manager is pinned; the repository supports Node >=24 rather than pinning one patch version globally.

The [independent review](phase-2o-independent-review.md), [specification](phase-2o-field-viewport-spec.md), [historical acceptance report](phase-2o-acceptance.md), [ADR 0004](decisions/0004-field-viewport.md), architecture, testing, performance and native RGB contracts were read against live implementations. All 471 files in the independent review's final input manifest still match their recorded SHA-256 hashes. This supports reuse of that review's historical evidence; it does not turn its mathematical claims into proof or make its verification commands newly executed here.

New scratch evidence is isolated in ignored `.artifacts/phase-2o-certification-20261008/`. `baseline.json` hashes the 114 initially changed/new files; `initial-status.txt` preserves the starting status. Earlier evidence was preserved. No reset, overwrite of existing work, staging, commit, push, merge, tag, publication or deployment occurred.

## 2. Decision

Certification of the polynomial reference model appears possible. This investigation established conservative domain coverage, continuous witnesses for some regular segments, and exact rational isolation of L/C event roots. It did **not** establish a complete, fast certificate for either perceptual guide family. Automatically replacing the production tracer would therefore be unjustified.

The measured interval cover takes about 1–4 seconds on representative normal slices, even before finishing topology and reverse accuracy. The straightforward exact rational L/C event prototype takes 0.38–2.48 seconds before feasible-branch selection or curve approximation. These costs are incompatible with the current synchronous fixed-coordinate update route, whose contour costs are below about 1 ms in typical cases. Caching cannot conceal this difference during Hue or Lightness changes.

Outcome B applies to these investigated paths and the resulting implementation/maintenance scope. It is **not** a proof that every specialized algorithm must be slow, that binary64 certification is impossible, or that an optimized algebraic implementation cannot succeed. A complete inequality arrangement, regular-chart certificates and explicit event handling are a substantial numerical subsystem, not a midpoint-refinement patch. The small prototypes do not justify introducing it as accepted production code now.

Recommended next decision: retain the existing guarantee and keep acceptance blocked while evaluating a dedicated specialized algebraic certifier with an explicit interactive work target. If the product instead accepts empirically accurate visual guidance, the precise alternative in section 13 requires an explicit human decision. The existing requirement remains in force.

## 3. Mathematical model

Only the shipped sRGB and Display P3 gamuts, OKLCH L/C and OKLab a/b geometries are considered. No claim extends to third-party gamuts or future representations.

The pinned library is `@texel/color@1.1.11`. Its inverse OKLab implementation evaluates an affine LMS-prime transform, cubes each component with two multiplications, then applies the target linear-RGB matrix. The matrices used by core's `boundaryTrace.ts` match the pinned library. The reference coefficients are the **exact real values represented by those binary64 literals**, not decimal constants treated as infinite-precision color science and not the library's rounded execution itself:

```text
S_i = L + A_i a + B_i b
R_j = sum_i M_ji S_i^3

(A_i, B_i):
( 0.3963377773761749,  0.2158037573099136)
(-0.1055613458156586, -0.0638541728258133)
(-0.0894841775298119, -1.2914855480194092)

sRGB M:
[ 4.076741636075959,   -3.307711539258062,   0.2309699031821041 ]
[-1.2684379732850313,   2.6097573492876878, -0.3413193760026569 ]
[-0.004196076138675526,-0.703418617935936,   1.7076146940746113 ]

Display P3 M:
[ 3.1277689713618737, -2.2571357625916395,  0.1293667912297651 ]
[-1.091009018437798,   2.413331710306923,  -0.3223226918691248 ]
[-0.02601080193857041,-0.5080413317041669,  1.5340521336427373 ]
```

The six inequalities are `R_j >= 0` and `R_j <= 1`. Equality is only a candidate locus: the other channels must be feasible and the locus must belong to the actual boundary of the feasible set. For example, `(x-1/2)^2 = 0` is an equality inside a fully feasible region, while `-(x-1/2)^2 >= 0` defines a genuine degenerate line. Sign-change ray queries alone do not cover all meaningful degeneracies.

L/C uses `x=C/0.4`, `y=1-L`, `0<=L<=1`, `0<=C<=0.4`. Hue direction is frozen to the runtime's binary64 cosine/sine after the tracer's normalization. Thus `S_i=1-y+0.4*x*(A_i*cos(h)+B_i*sin(h))` is affine in field coordinates.

a/b uses `x=0.5+a/0.8`, `y=0.5-b/0.8`, with fixed L and the closed disc `a^2+b^2<=0.4^2`, equivalently radius 0.5 about `(0.5,0.5)`. Here `S_i=L+A_i*(-0.4+0.8x)+B_i*(0.4-0.8y)`. Both models have total degree at most three, even though the interval prototype uses tensor degree three in each axis.

Let G be the feasible set in the complete real slice. B is its actual target-gamut boundary restricted to the supported editor domain D; it is not the relative boundary formed by adding D's rectangle/disc edges. The gray axis and editor-disc outline must never be inferred as gamut contours. Restriction to D precedes camera cropping. Black/white endpoint classifications require their own model-consistency argument; a small outer cover alone does not prove a canonical point, line or empty slice.

**Metric.** For the geometric centerline P, use Euclidean distance in normalized field coordinates:

```text
H(B,P) = max(sup_b in B inf_p in P ||b-p||_2,
             sup_p in P inf_b in B ||p-b||_2)
```

Both empty sets have distance zero; a nonempty set against an empty set cannot obtain a finite certificate. For width W, height T and zoom z, the screen metric is `||diag(W,T)*z*(b-p)||_2`, bounded by `max(W,T)*z*||b-p||_2`. Translation does not affect distance. Stroke width, device pixels and antialiasing are separate presentation effects.

CSS caps the instrument at 480 px and sets the default plane maximum to 420 px; gutters/padding make the actual product field smaller. Render's `MAX_VIEWPORT_ZOOM` is 8. Thus `delta=1/3840` is a conservative normalized limit for product fields with displayed dimensions <=480 CSS px. Host overrides or CSS scale beyond that envelope scale the pixel bound; arbitrary externally enlarged fields are not certified by this target. Separately clipping B and P to the moving viewport can change Hausdorff distance at crop endpoints and is not the stated full-domain metric.

## 4. Completeness

The interval prototype begins with the **whole enclosing square**, including the a/b disc's bounding square. It never relies on tracer seeds to decide where a component might exist. Each cell carries outward interval Bernstein coefficients for the three channels. A cell can be discarded only when:

- One channel's entire range is outside `[0,1]`, so the cell contains no feasible point; or
- Every channel is strictly in `(0,1)`, so it contains no ambient target boundary; or
- An outward lower bound proves the whole cell is outside the disc.

Bernstein basis functions are nonnegative and sum to one. The min/max coefficient hull therefore encloses every polynomial value in a cell. Outward de Casteljau subdivision preserves inclusion. Closed child cells cover the parent, including shared edges. These facts provide an exhaustive **outer cover** of B. They do not prove existence in retained cells.

The independent path checker accepts a retained box only when all four corners are conservatively close to the **same** serialized segment. Distance to a convex segment in the L-infinity metric is convex; the box-wide bound follows from its corners. A heuristic projection chooses a segment parameter, but the actual acceptance uses outward interval evaluation of that particular segment point. No endpoint/midpoint sampling of the implicit curve is used in this implication.

This closes B-to-P distance for the reference model in completed runs. It does not provide component identities. The synthetic near-loop fixture omits a separate loop centered 0.0001 from a genuine line, radius `2^-18`, while both Hausdorff directions remain within the allowed envelope. Its coverage check succeeds correctly; a topology claim based on that check would be false. No full certificate is returned.

**Specialized L/C route.** For L>0, set `q=C/L`. Then `R_j=L^3*g_j(q)`, where each g is cubic. Feasible q bands are determined by signs of the g polynomials. Upper binding changes occur at roots of `g_i-g_j`; upper curves have `L=g_j(q)^(-1/3)` where that channel is positive and maximal. Domain clipping adds `g_j-1` and `0.4^3*g_j-q^3` events. This accounts for multiple chroma intervals rather than assuming radial convexity.

The scratch Sturm prototype isolates all distinct positive roots of those 12 polynomials, using exact rational coefficients built from frozen binary64 parameters and a Cauchy upper bound. Repeated roots are counted without requiring sign changes. Still missing: cross-polynomial ordering/coincidence, feasible-side selection, infinity/L=0 analysis, clipping and verified branch assembly. L/C homogeneity does not solve a/b: that family needs a bivariate arrangement or an independently proved global structure. Both remain unimplemented production proof obligations.

## 5. Continuous accuracy

Completed box/path checks establish only:

```text
sup_b in B distance(b,P) <= sqrt(2)*0.000175
```

Using the rational upper bound 1.415 for sqrt(2), this is <=0.95088 CSS px at 480 px/8x. The compared path already incorporates Float32 conversion and actual two-decimal SVG serialization. This is an auditable reference-model one-way enclosure, not the complete product certificate.

For reverse accuracy, an independent segment-strip test composes the RGB polynomials with `p(t)+s*n`, `t in [0,1]`, `s in [-r,r]`, `||n||_infinity<=1`, `r=0.000175`. It requires opposite **strict polynomial range signs over the entire two sides**, a strict transverse derivative range, strict feasibility of the remaining channels throughout the strip, and domain containment. The intermediate value theorem and monotonicity then give a unique qualifying membership crossing for every t. Every point of that segment is within the same 0.95088 px envelope of B.

There were 1,602 successful strip witnesses out of 2,240 tested segments. The remaining 638 are unresolved: 392 SVG-collapsed segments, 14 domain-endpoint strips, 232 sign/regularity/remaining-channel failures. Collapse does not itself prove geometric error: the checker needs a point witness or a neighboring certified event enclosure. Neither successful checks for other segments nor averaging permits these failures to be ignored. No tested slice has a full reverse certificate.

Output reserves, for normalized coordinates in `[0,1]`:

| Contribution                             | Conservative bound                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Float32 conversion                       | `sqrt(2)*2^-25` normalized Euclidean                                                                 |
| SVG two decimals / 1000 view box         | `sqrt(2)*5e-6` normalized Euclidean                                                                  |
| Combined, using 1.415                    | <=0.027330 CSS px at 480 px/8x                                                                       |
| View-box six-decimal rounding            | Each normalized window coordinate <=5e-10; visible-point displacement <=0.000006 CSS px at 480 px/8x |
| Marker percentage eight-decimal rounding | <=2.4e-8 CSS px per coordinate at 480 px, plus floating projection arithmetic                        |

Linear interpolation preserves the vertex-perturbation bound over whole segments. The SVG and Float32 numbers are per-coordinate bounds before Euclidean combination; treating `5e-6` as the Euclidean serialization bound would undercount it. Exact decimal parsing versus the prototype's normalized binary64 parse adds less than 1e-15 normalized per coordinate in this domain. These presentation costs are small; they do not repair missing topology, failed root witnesses or an unbounded model-to-library geometric discrepancy. Browser raster centerline implementation precision was not independently certified.

## 6. Numerical soundness

The interval implementation uses adjacent binary64 values via DataView bit operations to widen every nontrivial `+`, `-`, multiplication and positive division. It handles signed zero and subnormal adjacency. Bounds do not assume that rounding to the nearest value is outward rounding. The chosen domain keeps these polynomial operations finite. The certificate comparisons use L-infinity bounds and the rational constant 1.415 rather than needing transcendental interval functions.

An independent BigInt rational audit decodes binary64 inputs as dyadics and tests containment of arithmetic, polynomial evaluation and subdivided Bernstein evaluation: 7,961 checks. The exact Sturm experiment also distinguishes roots separated by `2^-80` (82 isolation levels), preserves a repeated root, and explicitly rejects an identically zero/coincident polynomial. These checks challenge the mechanisms; they are not a machine-checked proof of the entire program.

For the direct OKLab inverse, `|S_i|<=1.553` and the largest absolute target-matrix row sum is <=7.616 in the supported domain. With unit roundoff `u=2^-53`, an LMS-prime error allowance of `2e-15` covers normalized affine input formation and the three-product/two-add dot product. For L/C the coordinate formation contributes at most `u + 1.381*gamma_2*0.4`; for a/b it contributes at most `1.381*gamma_2*1.2`, before the dot-product allowance, where `gamma_n=n*u/(1-n*u)`. Both fit this allowance. Propagating through cubing and the final dot product yields:

```text
cube error <= 3*(1.553+2e-15)^2*2e-15 + gamma_2*(1.553+2e-15)^3
channel error <= 7.616*cube error + gamma_5*7.616*(1.553+2e-15)^3
              <= 1.324e-13
conservative direct-inverse reserve: 4e-13 per linear channel
```

The scratch `numericalBudget.mts` evaluates this reserve outward. An underflow allowance below `100*Number.MIN_VALUE` fits the reserve. A separate 12,138-point comparison over 42 slices measured a largest channel discrepancy of `6.67e-15`; this is secondary evidence, not the reason for the bound.

**This is not a geometric model-discrepancy bound.** Near a tangency, channel error e can move roots by order sqrt(e); with vanishing gradients, repeated roots or component creation there is no universal conversion `channel error / slope`. A defensible product certificate needs interval-conditioned geometry or exact exceptional-case proofs, and can fail when these cannot be established.

Core `represent()` additionally canonicalizes neutral RGB/OKLab conversions. Exact Status takes an encoded conversion and linear roundtrip, using its independent `1e-9` tolerance; it is not identical to polynomial membership. Library polar conversion and the core tracer also differ in hue normalization/evaluation order. Frozen runtime cosine/sine parameters do not establish a portable error bound against mathematical trigonometry. ECMAScript specifies sine and cosine as implementation-approximated values ([specification](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.cos)). These distinctions, especially canonical black/white and near-endpoint cases, remain unresolved for the full fidelity claim. Floating-point roots are not exact arithmetic.

## 7. Algorithm and alternatives

| Strategy                                                         | Soundness/completeness assessment                                                                                                                      | Decision                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Current tracer with more samples                                 | Neither continuous extrema nor unobserved events excluded                                                                                              | Not certification                                                     |
| Natural interval subdivision                                     | Sound with outward arithmetic; dependency/cancellation enlarge covers; no root-existence implication                                                   | Bernstein chosen for the cover experiment                             |
| Bernstein domain cover + independent path checker                | Exhaustive exclusion and continuous one-way distance; no existence or component identity                                                               | Prototype only; too slow here                                         |
| Segment strips / interval Newton charts                          | Existence, regularity and continuous distance on successful charts; tangencies, event neighborhoods and global accounting still required               | Useful primitive, incomplete solution                                 |
| Plantinga-Vegter subdivision                                     | Nonsingular zero-set topology requires its stated assumptions; inequalities, clipping and singular loci need additional treatment                      | Cannot be adopted as a generic theorem for these guides               |
| Singular-curve certified meshing                                 | Establishes a credible theoretical route with singularity/branch machinery                                                                             | Substantial new numerical subsystem                                   |
| L/C homogeneous root arrangement                                 | Removes finite-seed discovery dependence; exact root isolation demonstrated                                                                            | Promising narrower future route; currently slow/incomplete            |
| General constraint-curve arrangement / algebraic event isolation | Can account for qualifying branches, intersections and components; needs gcd/coincidence, root ordering, predicates and regular/singular approximation | Plausible complete solution, not implemented or performance-certified |

The [Plantinga thesis, chapter 4](https://cs.nyu.edu/exact/pap/mesh/vegter/plantingaThesis.pdf) distinguishes isotopy from Hausdorff accuracy. [Burr, Choi, Galehouse and Yap](https://cs.nyu.edu/~exact/doc/subdiv2-journal.pdf) supply a complete meshing route for algebraic curves with isolated singularities. Applying these results to the intersection of six inequalities and a domain is an additional engineering/mathematical task; merely citing them does not discharge our proof obligations.

The cell prototype bounds visits to 16,384 or 262,144 and binary subdivision depth to 48 (24 per axis). Per-cell polynomial degree and arithmetic count are fixed; segment searches are bounded by the candidate's existing vertex limit. It returns `incomplete` on budget/depth failure. The exact root prototype bounds rational operations to 200,000, numerator/denominator sizes to 8,192 bits, and root-isolation depth to 160. Operation ceilings give deterministic finite work; they do not promise an acceptable wall time.

Prospective ownership remains core for color constraints/general root or interval primitives, render for topology/approximation certificate policy, screen tolerance, output precision, work limits and memoization. Neither requires a public headless API or camera-dependent science. No ownership migration was made.

## 8. Prototype evidence

The design/proof-obligation record `design.md` was written before prototype execution. It explicitly prohibited calling outer coverage a full certificate.

- **42 real slices:** both gamuts, eight L/C hues (0, 109.5, 264, 264.1, 264.125, 264.75, 265.5, 328) and 13 a/b lightnesses (0, 0.001, 0.2, 0.44, 0.4775, 0.6, 0.97, 0.999, `1e-13`, `1-1e-13`, 1, -0.1, 1.1). This includes cusps, notches, stitching difficulty, black/white, near endpoints, and extended empties.
- At 262,144 cells, all 42 outer-cover runs completed. All 38 available current paths completed **one-way** coverage checks. Four current endpoint traces returned their real `approximation-budget` failure; the prototype never substituted a contour for them.
- At 16,384 cells, 26/42 outer runs and 26/38 candidate checks exhausted the cell budget. The original 16,384-ray ceiling is a different work unit and must not be treated as an equivalent runtime limit.
- Largest full cover: 206,675 visited cells, 103,337 splits, 40,313 retained outer boxes. Largest candidate check: 162,785 visits, 81,392 splits, 27,738 covered boxes. Candidate-check maximum binary depth was 34. These boxes are geometric covers, not certified branches. Zero full certificates.
- Largest queued coefficient-payload estimate was 20,736 bytes, excluding JS array/object overhead, temporary arrays and candidate storage. Millions of interval operations allocate short-lived arrays; this implementation does not have low total allocation cost. GC/heap peaks were not independently profiled. Existing returned candidates had at most 259 vertices in this matrix; scratch certifiers emitted no replacement vertices.
- Synthetic fixtures rejected a separated omitted component, a loop of radius `2^-16` missed by coarse grid samples, a cubic interior excursion invisible at endpoint/midpoint, a shifted segment, and budget exhaustion. Repeated-root false equality, a clipped tangency, an isolated genuine point and the near omitted loop expose the distinction between enclosure, existence and topology.
- 16 L/C algebraic slices isolated 168 event roots without a reported isolation failure: 19,474–48,758 rational operations, maximum depth 49. Root boxes are per polynomial; they are not globally ordered events or completed branch certificates.
- Independent library scan/bisection supplied 17,874 qualifying boundary samples over 14 selected slices. Largest measured boundary-to-serialized-path error was 0.5014 CSS px at 480 px/8x. The chroma scan step was 0.001 and can miss narrow intervals. This is finite one-direction accuracy evidence only.

Raw counts, root enclosures, errors, timings and reasons are in `matrix.json`, `strips.json`, `self-test.json`, `algebraic-events.json`, `oracle.json` and `numerical-budget.json`. The prototype records deliberately distinguish `outer-cover`, `boundary-to-path-only`, `witness` and `incomplete`; none is relabeled as a complete certificate.

## 9. Implementation

No production implementation was changed. Documentation adds this report and a link from the historical acceptance report. Scratch native TypeScript programs have no experimental dependencies and are ignored by repository checks. They use built core/render for candidate comparison, and independently implemented interval/rational logic for verification. Core/render were rebuilt from the live source before comparison.

Current ownership remains `core/src/gamut/boundaryTrace.ts` for numerical cubic ray crossings/intervals; `render/src/perceptualGuides.ts` for finite-seed tracing, midpoint refinement, stitching, tolerance, work and four memo slots; `guideResolution.ts` for explicit failure forms; `current/referenceDisplay.ts` for spatial annotations. Cache identity is gamut/plane kind plus fixed coordinate, and successes are returned as caller-owned copies. Failure results are memoized for that same slice, without stale-success fallback.

Core uses a chroma ceiling of 1, up to 80 root iterations, numerical derivative splits and sign/membership decisions, without outward root enclosures. Render uses `1/3840` as its target, half that as the midpoint threshold, `1e-13` event resolution, depth 24 and 16,384 ray/vertex ceilings. Traversal completeness refers to discovered branches. These policies do not constitute the missing continuous certificate.

Reference selects the exit ending the in-gamut interval containing the authored chroma, or the nearest preceding exit in an out-of-gamut gap. Non-convex rays can have multiple Chroma intervals. Both retain the current numerical ray authority; successful root isolation in the scratch program does not retroactively certify those forms. A failed requested contour already suppresses spatial Reference, while preserving sampled facts and independently requested exact Outside warnings. Camera state is absent from these operations. Native RGB full/partial/empty and point/line/area semantics, genuine contour restriction and its separate transfer-curvature bound were inspected and left untouched.

## 10. Performance

The controlled Node comparison ran without concurrent repository tests or another benchmark job. Current tracer: 20 warmups per case, then 100 uncached and 100 same-slice cache-hit samples per case. L/C cases are 0, 109.5, 264.125; a/b cases are 0.44, 0.6; both gamuts. The prototype includes interval model construction and one-way candidate coverage. Three passes reverse case/budget order. The small prototype sample counts make p95 equal to the maximum; this is disclosed rather than suggesting a well-estimated tail.

Values are **median / p95 / maximum milliseconds**:

| Gamut / field | Current uncached (n)        | Current cached median | One-way prototype (n)  | 16,384-cell failure path median |
| ------------- | --------------------------- | --------------------- | ---------------------- | ------------------------------- |
| sRGB L/C      | 0.440 / 0.773 / 1.094 (300) | 0.0011                | 1189 / 3749 / 3749 (9) | 271                             |
| sRGB a/b      | 0.760 / 1.061 / 1.448 (200) | 0.0017                | 1328 / 1408 / 1408 (6) | 339                             |
| P3 L/C        | 0.336 / 0.527 / 1.538 (300) | 0.0015                | 1577 / 1949 / 1949 (9) | 290                             |
| P3 a/b        | 0.673 / 0.981 / 1.445 (200) | 0.0019                | 1394 / 1555 / 1555 (6) | 315                             |

At sRGB Hue 264.125 specifically, current uncached median was 0.652 ms, while the prototype median was 3361 ms. Both normal and difficult slices make the direct cell-cover implementation unacceptable for synchronous interactions. The exact rational L/C prototype's 0.38–2.48 s are single timings per distinct slice, not repeated latency distributions. An optimized integer/subresultant or filtered method was not benchmarked, so its potential remains open.

The initial broad feasibility matrix briefly overlapped owner tests; its timings are exploratory only. The separate controlled benchmark above is the performance evidence. Raw samples are in `benchmark.json` and `performance-summary.json`.

No certified production candidate exists, so a new guide-on/off browser comparison would not compare an implemented change. The unchanged source hashes preserve the independent review's counterbalanced interaction evidence; that review found no consistent guide-induced regression. No new wheel/pan guide computation was added. Fresh viewport owner checks still pass. No browser frame-rate claim, physical input measurement or new visual review is asserted here.

## 11. Verification

Fresh results, with logs in the scratch directory:

| Check                                                                                     | Result                                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Core build; render build                                                                  | Passed                                                                                                                      |
| Core `boundaryTrace.test.ts`                                                              | 3 tests / 1 file passed                                                                                                     |
| Render perceptual, traced integration, RGB guide/budget, viewport and raster owners       | 88 tests / 6 files passed                                                                                                   |
| Scratch strict TypeScript, including unchecked indexed access / exact optional properties | Passed                                                                                                                      |
| Exact arithmetic / certificate adversarial self-test                                      | Passed; 7,961 checks and deliberate incomplete/one-way outcomes                                                             |
| Exact rational root fixtures and real event matrix                                        | Passed the recorded root-isolation checks; no complete contour claim                                                        |
| Baseline preservation hash audit                                                          | 113/114 pre-existing changed/new files unchanged; the historical acceptance report gains only the stated investigation link |
| Independent review input comparison                                                       | All 471 recorded input hashes match before documentation additions                                                          |

The implementation decision was not Outcome A. Consequently `pnpm verify:prepush`, `pnpm test:e2e`, `pnpm test:production`, `pnpm test:package:built`, `pnpm test:react-vite:built`, `pnpm test:nuxt:built`, `pnpm test:next:built`, the pinned Linux visual matrix and packed-domain checks were **not rerun** for a production change. Their prior passing evidence remains historical, as documented in the independent review. No new export or packed contract required validation. The new documents received focused formatting checks; Markdown has no applicable Oxlint check. No aggregate command is reported as newly passed.

No geometry, DOM, CSS or screenshot changed. No new Fit/4x/8x, enlarged text, narrow-layout, accessibility or framework lifecycle visual acceptance is claimed. The review's 92 captures are preserved evidence for the unchanged candidate, not fresh captures for a certifier. Physical hardware, manual screen readers and portable transcendental equivalence retain the review's limitations.

## 12. Remaining limitations

Outstanding before Outcome A:

1. Define and reconcile the geometric reference model with all library/core exceptional and polar paths; bound geometric discrepancy, not just channel error.
2. Order and classify all events, including coincidences, multiplicity, folds, constraints intersecting clipping domains, singular/degenerate endpoint slices and projective/infinite chart ends.
3. Account for each actual component independently of Hausdorff proximity; a contour representation incapable of multiple components must explicitly fail or gain an internal representation that preserves them.
4. Complete reverse witnesses and continuous approximation across every segment/event/point; reject residual uncertainty deterministically.
5. Produce a bounded algorithm that normally completes within a realistic interactive budget. The prototypes have finite work but unacceptable synchronous costs.
6. Tie successful Chroma/Reference geometry to that model and certificate, preserve explicit contour failure propagation, then perform the entire Outcome A matrix and actual visual review.

None of these is closed by the existing sampled sweeps. The exact L/C root reduction is a promising path to reduce scope, but its success must not be generalized into acceptance of the a/b family.

## 13. Acceptance verdict and product decision

**Phase 2O does not satisfy its current contract and is not ready for final human acceptance as certified.** Passing owner tests, strong sampled evidence, partial conservative certificates and complete product acceptance are distinct. This investigation improves the mathematical basis and exposes useful routes; it leaves zero fully certified product slices.

Recommended decision: retain the current contract and allocate a dedicated bounded evaluation of the specialized algebraic arrangement, including a/b event completeness and filtered/exact arithmetic performance, before allowing a production switch. A fresh broad bug-hunting/refactoring campaign is unnecessary.

If that cost is disproportionate to the product's visual-guide value, the following is a **proposed alternative only**:

> For built-in sRGB/P3 guides in the nominal L/C rectangle or a/b disc, on fields <=480 displayed CSS px and zoom <=8, a successful guide means the deterministic numerical tracer completed its discovered-branch traversal within its documented budgets. Each documented numerical acceptance fixture must measure both sampled boundary-to-path and sampled path-to-boundary distance <=1 CSS px, including actual output serialization. Successful geometry is explicitly an uncertified visual approximation. No continuous maximum-distance, exhaustive-event or component-completeness guarantee is made. Detected numerical/traversal/budget failure remains unavailable and suppresses spatial Reference; exact Status keeps its independent authority.

This loses **all-point guarantees in both Hausdorff directions and the no-omitted-component guarantee**. It does not merely adjust epsilon. The present finite reverse-search evidence would also need to be specified as a stable acceptance protocol before adopting this alternative. No fallback table, fabricated editor edge, stale contour, changed camera semantics or weakened failure labeling is proposed.

Until the user explicitly accepts a revised contract, the existing criterion and open acceptance blocker remain unchanged.
