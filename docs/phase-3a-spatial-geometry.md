# Phase 3A: Spatial boundary foundation

## Decision and qualification status

The implemented foundation is a renderer-independent, indexed, shared-seam RGB-cube surface transformed into OKLab. It supports the existing sRGB and Display P3 definitions. **Cubic knots in linear RGB are the preferred reference sampling method. No production resolution or continuous error guarantee is established.** Every generated mesh explicitly carries `quality.status = "unqualified-reference"`; callers must supply a resolution and distribution.

The three fixed methods were compared at identical logical vertex and triangle budgets. Cubic spacing reduced the largest sampled residual substantially without introducing adaptive topology, hanging nodes, or iterative stopping criteria. A conforming adaptive prototype is not justified in this phase: first establish the actual viewport, projection, zoom and section requirements in Phase 3B. The remaining near-black error means that blindly choosing a small uniform grid would not be a credible production policy.

This phase adds no renderer, graphics dependency, UI, camera, instrument state, mapping policy, or package export route. The existing compact Vue/React behavior and Phase 2O/2P contracts remain authoritative.

## Ownership and authority

- Core's existing internal capability entry exposes `linearRgbToOklabBatch`, its bounded input contract, the existing RGB representation identity type, and a numeric-definition revision. The bridge uses the same `@texel/color` linear-space definitions already owned by core. No conversion matrices were added to render.
- Render's unexported `src/spatial/boundaryMesh.ts` owns the scientific grid, knots, source provenance, bounds, resource budget and Float32 upload observation. `src/spatial/quality.ts` owns offline sampled approximation measurements.
- The existing core representation definitions supply the associated gamut identity. Both admitted spaces already declare the sRGB transfer function; encoded sampling uses core's existing coordinate decoder. This is a closed built-in capability, not a registry.
- `ColorValue`, `represent`, `analyzeGamut`, explicit mapping, product admission and all existing public exports retain their contracts. A mesh, mesh chord, intersection, or GPU position is never an exact membership authority.

The batch bridge accepts a packed Float64 input of linear RGB triples and returns packed Float64 **[L,a,b]** triples. It validates the space, buffer shape, point budget and every finite input before allocating its output. The conversion uses two reusable three-number scratch arrays and a caller-independent output; it creates no ColorValue per point. It returns explicit errors for invalid space/buffer, nonfinite input, resource budget and nonfinite conversion results. Finite extended inputs are retained, including negative and greater-than-one coordinates. No clipping, gamut mapping, rounding, transfer encoding, or neutral canonicalization is added. Raw kernel roundoff in neutral a/b coordinates is retained; existing authored-color neutral handling is unchanged.

## Construction and scientific coordinates

For each of the six faces, one linear RGB coordinate is fixed at 0 or 1. The two others take values from an increasing knot vector. Each parameter cell is divided on the same low/low-to-high/high diagonal into two triangles. Every sampled RGB triple is converted through core.

Scene coordinates are exactly **X = a, Y = L, Z = b**. There is no centering, axis stretching, normalization or presentation scale in the buffers. The permutation from [L,a,b] to [a,L,b] reverses orientation. Source-face triangle ordering compensates for this. Tests compare every triangle normal in the orientation fixtures against a locally mapped inward RGB displacement; they do not infer outwardness from a volume center or convexity.

Logical vertex identity is based on integer cube-grid coordinates, not approximate coordinate equality. The two B caps contain `2(n+1)^2` vertices; the `n-1` intermediate B layers each contribute a `4n` perimeter ring. Their deterministic indices give:

- Vertices: `V = 6n² + 2`.
- Triangles: `F = 12n²`.
- Undirected edges: `E = 18n²`.
- Euler characteristic: `V - E + F = 2`.

The six face blocks are R=0, R=1, G=0, G=1, B=0, B=1. A triangle's face byte is `2 * fixedChannelIndex + fixedValue`. All incident faces reference the same seam/corner logical vertex. The face provenance is per triangle because a seam vertex can belong to two or three constraints.

The continuous unclipped conversion is an invertible composition of linear transforms and sign-preserving cube roots for these definitions. That fact does **not** establish that any particular piecewise-linear approximation is an embedded surface without intersections. Cube-root derivatives are singular at black; a coarse mesh can have credible topology and poor geometric accuracy.

## Scientific buffers and future GPU vertices

Each mesh retains:

| Data      | Representation                                            | Meaning                                                                       |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| positions | Float64, 3V                                               | Scientific [a,L,b] coordinates                                                |
| linearRgb | Float64, 3V                                               | Original source coordinates                                                   |
| triangles | Uint32, 3F                                                | Canonical logical indices                                                     |
| faces     | Uint8, F                                                  | Source face constraint                                                        |
| knots     | Float64, n+1                                              | Actual linear-domain sampling coordinates                                     |
| bounds    | numeric min/max triples                                   | Bounds of generated vertices, **not certified extrema of the curved surface** |
| identity  | space, gamut, coordinates, definition/generator revisions | Cache and provenance information                                              |
| quality   | reference status, conversion count, numeric buffer bytes  | Work/qualification metadata, not an inferred precision promise                |

The returned buffers are caller-owned and must be treated as immutable. No shared cache or hidden mutable singleton is introduced. The generator revision is `rgb-cube-grid-v1`; the conversion revision is `texel-1.1.11-linear-oklab-v1`. A change to the numeric definitions, knot policy, topology/indexing or metric must update its corresponding revision and requalify the evidence.

A future renderer can duplicate logical vertices to create separate face normals, sharp-edge attributes or picking attributes. It must keep a logical/source mapping. Normals, appearance colors, lighting and clipping are deliberately absent from the mandatory scientific representation. `quantizeBoundaryPositions` creates a separate Float32 position buffer and reports maximum/RMS vertex displacement; it never mutates the Float64 mesh.

## Sampling alternatives and measurement method

For grid parameter `t=i/n`, the three knot policies are:

1. **Linear:** `k(t)=t`.
2. **Encoded:** `k(t)=decode_sRGB(t)`, using the existing core transfer decoder for both shipped spaces.
3. **Cubic:** `k(t)=t³`.

All surfaces are parameterized and evaluated in the **same linear RGB domain**, including encoded sampling. Cube endpoints remain exactly 0 and 1. No RGB transfer curve is confused with spatial coordinates.

For every triangle, 13 held-out linear-domain barycentric points are evaluated through core: the centroid; three cyclic permutations of (0.6,0.3,0.1); and the quarter, midpoint and three-quarter points of each edge. These probes do not choose generator knots or topology. An additional **864 source probes** (144 per face) are identical across every method/resolution: all pairs from `[0, 1e-12, 1e-9, 1e-6, 1e-4, .001, .01, .1, .25, .5, .9, 1]`. They include black, corners, near-black points, edges and face interiors.

Let f be core's linear-RGB-to-scene conversion, q_i the three source vertices and w the barycentric weights:

- **Surface-to-triangle:** distance from `f(sum(w_i q_i))` to the _closed corresponding flat triangle_. The distance routine projects onto the triangle or its edges. This is an upper estimate of distance to the entire mesh, which might have a closer triangle elsewhere.
- **Paired correspondence:** distance from `sum(w_i f(q_i))` to `f(sum(w_i q_i))`. This also evaluates a triangle point against a known point on the underlying face. It is a valid correspondence residual in both directions, **not a nearest-surface distance**. Nonlinear parameterization can make it much larger even along a geometrically straight locus.
- **Common face probes:** distance from each independently specified surface point to the nearer of its source cell's two triangles. This is a second finite diagnostic with identical spatial source probes for all methods.

All distances use ordinary Euclidean OKLab units, preserved by the axis permutation. RMS is the unweighted RMS over probe evaluations, **not an area-weighted surface integral**. Shared edge points and face corners can be evaluated more than once; counts below are evaluations, not unique points. Approximation measurements use independently evaluated points but the production conversion kernel. Independent verification of the conversion mathematics is a separate core test.

These are finite sampled diagnostics. They are not continuous Hausdorff bounds, topology certificates, perceptual just-noticeable-difference guarantees, or a guarantee about every future section.

## Observed approximation results

The full machine-readable evidence, including maxima, RMS, every face maximum, worst-point provenance, sample counts, Float32 error and work observations, is [phase-3a-spatial-measurements.json](phase-3a-spatial-measurements.json).

Largest observed surface-to-corresponding-triangle distance:

| Knots   |   n |           sRGB |     Display P3 | Triangle probes per mesh | Common probes |
| ------- | --: | -------------: | -------------: | -----------------------: | ------------: |
| Linear  |  16 |   0.0153926982 |   0.0164295576 |                   39,936 |           864 |
| Linear  |  32 |   0.0122171927 |   0.0130401485 |                  159,744 |           864 |
| Linear  |  64 |  0.00969679223 |   0.0103499727 |                  638,976 |           864 |
| Linear  | 128 |  0.00769634910 |  0.00821477880 |                2,555,904 |           864 |
| Encoded |  16 |  0.00670064188 |  0.00715200027 |                   39,936 |           864 |
| Encoded |  32 |  0.00520655649 |  0.00555727258 |                  159,744 |           864 |
| Encoded |  64 |  0.00413244662 |  0.00441081017 |                  638,976 |           864 |
| Encoded | 128 |  0.00327992506 |  0.00350086235 |                2,555,904 |           864 |
| Cubic   |  16 |  0.00242419806 |  0.00258749318 |                   39,936 |           864 |
| Cubic   |  32 |  0.00121209903 |  0.00129374659 |                  159,744 |           864 |
| Cubic   |  64 | 0.000606049515 | 0.000646873296 |                  638,976 |           864 |
| Cubic   | 128 | 0.000303024757 | 0.000323436648 |                2,555,904 |           864 |

At n=64:

| Method  |     sRGB RMS |       P3 RMS | sRGB paired max | P3 paired max | sRGB common max | P3 common max |
| ------- | -----------: | -----------: | --------------: | ------------: | --------------: | ------------: |
| Linear  | 0.0000862926 | 0.0000812031 |       0.0941080 |     0.0945527 |      0.00566667 |    0.00608984 |
| Encoded | 0.0000343173 | 0.0000333776 |       0.0401057 |     0.0402952 |      0.00263024 |    0.00282665 |
| Cubic   | 0.0000118100 | 0.0000122752 |      0.00588175 |    0.00590954 |    0.0000544635 |  0.0000490153 |

The worst cubic probe at n=64, for both spaces, lies on G=0 at linear RGB approximately `[9.5367431640625e-7, 0, 3.814697265625e-6]`. Doubling n halves this observed maximum in the recorded matrix. This behavior is consistent with the cube-root scaling near black; it is not a fitted convergence guarantee for arbitrary probes.

The large paired values are reported deliberately rather than relabeled as nearest-distance errors. A future bidirectional nearest-surface investigation can invert a chord point to RGB, search within its source face patch and independently evaluate candidates. It must specify convergence and work budgets; this phase does not claim that optimization.

## Resource and work bounds

Generation admits integer n in **1..128**, before allocating its main buffers. Core batches are limited to **400,000 triples**. Quality evaluation admits at most **2,600,000 probe evaluations** and batches at most 256 triangles (3,328 points) at a time. The n=128 measurement uses 2,556,768 evaluations. Rejected requests return errors, not partial meshes. Nonfinite conversion or zero/nonfinite triangle area returns numerical failure; there is no epsilon seam weld, silent triangle removal, retry or unbounded refinement. These budgets bound requested work and storage; process-wide out-of-memory termination is not represented as a recoverable geometry result.

|   n | Logical vertices | Triangles | Scientific typed buffers, bytes | Separate Float32 positions, bytes |
| --: | ---------------: | --------: | ------------------------------: | --------------------------------: |
|  16 |            1,538 |     3,072 |                         113,896 |                            18,456 |
|  32 |            6,146 |    12,288 |                         455,016 |                            73,752 |
|  64 |           24,578 |    49,152 |                       1,819,240 |                           294,936 |
| 128 |           98,306 |   196,608 |                       7,275,624 |                         1,179,672 |

There are five retained numeric allocations per generated mesh. Their exact total is `48V + 13F + 8(n+1)` bytes. At n=64, Uint32 indices alone occupy 589,824 bytes, face provenance 49,152 bytes, and each Float64 triple buffer 589,872 bytes. A position-plus-index upload without duplication would be 884,760 bytes per mesh; normals, source attributes, renderer overhead, duplicate GPU vertices and materials are additional.

Construction converts exactly V vertices and checks F triangle areas, with O(n²) work and storage. No cubic-sized lookup table, per-vertex ColorValue, Map-based weld, or browser resource is allocated. Reported allocation counts cover owned typed buffers only; they are not a heap-profiler measurement of JS objects, library internals, GC or retained process memory. Offline quality evaluation allocates temporary vector objects and is not intended for each interactive frame.

Observed on Node 24.16.0, Windows x64, AMD Ryzen 7 8845HS: the n=64 cubic median of seven sequential generation repeats was **3.55 ms for sRGB and 8.84 ms for P3**; at n=128, **15.30 ms and 28.72 ms**. Quality evaluation was timed separately (n=64 cubic: 120.73 ms and 235.70 ms). The JSON contains all initial/min/median/max observations and environment information. These are local mixed thermal/JIT/GC observations, not a controlled cross-device benchmark or browser performance gate. No GPU performance was measured.

## Float32 observations and exact-analysis separation

At n=64 cubic, the largest vertex displacement after Float32 quantization was **3.304e-8** OKLab units for sRGB and **3.331e-8** for P3. Across all 24 recorded configurations, the maximum was below **3.38e-8**. This is separate from the much larger tessellation residual. Linear interpolation of quantized vertex errors cannot exceed the maximum vertex displacement for the same barycentric weights (nonnegative weights summing to one); that mathematical observation does not bound rasterization, shader transforms or display-color error.

Core's gamut analysis tolerance remains **1e-9 in linear RGB**, which is a different metric and unit. Tests demonstrate that both chord samples and Float32 vertices can be reported outside by exact core analysis. That is expected and is not corrected by clipping or by enlarging the scientific tolerance.

## Verification and evidence limits

Core tests compare 16 source fixtures per space against an independently transcribed CSS Color 4 linear-RGB -> XYZ D65 -> LMS -> OKLab path. This covers black, white, primaries, secondaries, neutral gray, near-black, face-interior and extended negative/greater-than-one coordinates. The per-component regression threshold is 2e-12 for this fixture set. A published rounded sRGB-red anchor provides an additional recognizable check. This does not mean that all possible extended numeric inputs have 2e-12 accuracy.

Reference sources: [CSS Color 4, section 19, 9 October 2026](https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code) and [Ottosson's OKLab definition and examples](https://bottosson.github.io/posts/oklab/). The independent reference matrices are test-only; production color conversion remains in core's existing library.

Render tests cover both spaces, every face and all three knot policies at n=1,2,7,16; maximum-budget cubic meshes at n=128 receive the topology checks as well. They check canonical seam/corner sharing, a literal n=1 indexing fixture, deterministic repeated construction, unique source vertices, opposite directed edge incidence, connectivity, Euler characteristic, finite coordinates, positive triangle area, bounds, resource/error behavior and scene-space outward winding. Maximum-budget topology checks do not imply a maximum-budget embedding certificate.

All 386 vertices of a cubic n=8 mesh per space are also observed through existing ColorValue/gamut analysis; reconstructed linear RGB agrees within 1e-12 on this fixture set and none is classified outside. Float32 effects and the existence of outside chord samples are tested separately.

An embedding diagnostic checks all nonincident triangle pairs for six n=8 meshes (768 triangles each), using AABB rejection and separating axes, including coplanar axes. The diagnostic itself has intersecting, coplanar and separated fixtures. It found no intersections. Shared-vertex pairs are excluded and arithmetic uses a 1e-12 spatial separation tolerance. **This is a limited geometric check, not exact predicates, a check of every resolution, or proof that all incident triangles cannot overlap.** Abstract manifold tests do not replace it or strengthen its claim.

## Section compatibility

Constant lightness is the horizontal plane `Y=L0`. Constant hue is the radial half-plane `[X,Y,Z]=[C cos(h),L,C sin(h)]`, with C>=0. Source RGB, face IDs and scientific positions let Phase 3C associate crossings with actual source constraints and evaluate curved-face points independently of the chords.

Ten section fixture configurations cover two spaces at (L,h)=(0.44,264.1), (0.006,264.125), (0.6,30), (0.5,180), (0.99,90): **14 boundary points** total. The two sRGB notch configurations each retain three crossings (exit, entry, exit). They are compared with the existing numerical ray solver, an independently scanned/bisected oracle, source-face constraints, core analysis and distance to the corresponding face of the n=64 cubic mesh. The finite fixture gate is 0.0007 OKLab units; it is not an arbitrary-section guarantee. The scan oracle shares the conversion kernel and can miss narrower intervals; it is independent of the ray solver, not independent conversion mathematics.

No interactive section construction is implemented. Phase 3C must retain disconnected components, tangencies, points and multiple chroma intervals; it must not assume convexity or fill arbitrary sections with a convex hull. Mesh-plane intersections will be chord approximations. Numerical core boundaries remain a separate source of comparison and scientific analysis. Constant encoded RGB coordinates transform into curved surfaces in OKLab and must not be represented as flat planes.

## Reproduction and Phase 3B requirements

From the repository root, with the pinned Node/pnpm environment and installed workspace:

```powershell
pnpm --filter @gamut-plane/core build
pnpm --filter @gamut-plane/render build
pnpm --filter @gamut-plane/core exec vitest run test/capabilities/rgbBatch.test.ts
pnpm --filter @gamut-plane/render exec vitest run test/spatialBoundary.test.ts test/spatialEmbedding.test.ts test/spatialSections.test.ts
pnpm --filter @gamut-plane/render measure:spatial
pnpm verify:prepush
```

For a clean JSON report without package-manager progress lines, run `node packages/render/scripts/measureSpatialGeometry.ts > report.json`. The script writes only stdout; results are not regenerated by ordinary tests/builds. Floating-point values and timings are not promised bit-identical across JS engines. Same-engine repeated geometry/index determinism is tested.

Phase 3B must:

1. Keep Float64 source authority and explicit [a,L,b] mapping while building renderer-specific GPU vertices. Choose normals, seams, picking provenance and materials without modifying scientific data.
2. Choose a screen-space quality target using actual viewport dimensions, projection and maximum magnification. A possible experimental gate is <=0.5 CSS px over independently held-out projected probes; it is **proposed**, not an achieved or continuous guarantee. Perspective requires depth-dependent projection analysis.
3. Reuse generated geometry for camera changes. If cubic n=64/128 misses the chosen target, prototype bounded conforming refinement with shared edge splits, preserved face provenance, deterministic queues and independently checked stopping evidence. Increasing a hidden default or permitting cracks is not acceptable.
4. Keep displayed color and lighting separate from coordinates and exact membership. No tone mapping, gamut clipping or appearance mapping may mutate ColorValue or scientific geometry.
5. Establish browser lifecycle, SSR/lazy loading, context loss/disposal, demand-driven rendering, DPR policy and measured integrated-GPU budgets in the renderer phase. This foundation has no browser or DOM dependency at import time.
6. Qualify arbitrary section fidelity in Phase 3C; the current 14-point fixtures establish correspondence and preserve the known multi-interval case, not the accuracy of a future section algorithm.
