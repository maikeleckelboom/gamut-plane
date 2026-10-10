# Phase 3B: Spatial rendering experiment

> Updated by [Phase 3B-R](phase-3b-refinement.md): the comparison cage described below is replaced by an outline of the other gamut, the scene now uses the radial boundary generator at m = 64 (24,960 triangles per gamut), and the fixed-grid figures below remain the record of the original construction.

## Decision and scope

The standalone application now serves a real orthographic gamut scene at `/spatial`. The default `/` compact instrument retains its composition, state and exact-analysis behavior. Start with `pnpm dev`, then open the spatial path. An exact static-host proxy rule admits `/spatial`, and `/spatial/` redirects there, preserving 404s for unknown paths; see [deployment routing](deployment.md#routing-headers-and-caching). This is the surface-rendering foundation for the section-led product, not the finished Spatial Explorer.

The production direction is **Three.js 0.186.1, WebGLRenderer, WebGL2**. `three` is pinned exactly in the standalone application; `@types/three` 0.186.0 is development-only. The registry's stable dist-tag and upstream r186 release were checked on 9 October 2026. No GPU dependency enters core, render, UI, Vue or React packages.

The bounded renderer comparison used the installed r186.1 renderer, color-management, node-material and WebGPU-backend source alongside the official documentation. WebGLRenderer is WebGL2-only and permits an explicit GLSL3 fragment path with synchronous framebuffer readback. WebGPURenderer supplies a WebGPU backend with a WebGL fallback and a node/TSL material pipeline; adopting it would require a different shader material and output qualification. The tiny matrix/cube/transfer computation has no demonstrated compute, precision or maintenance advantage from that change. Consequently there is **no second renderer implementation or speculative WebGPU benchmark**. The bounded GPU experiment instead tests the material and drawing-buffer questions that can change this decision: unlit fragment conversion, raw floating-point output, encoded output and P3 buffer tagging.

Sources: [Three.js releases](https://github.com/mrdoob/three.js/releases), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [WebGPURenderer source at r186](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgpu/WebGPURenderer.js), [drawingBufferColorSpace](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawingBufferColorSpace).

## Ownership and buffer construction

The new unsupported `@gamut-plane/render/internal/spatial` route exposes only the scientific generator, its separate quantization helper, types, and core-owned color parameters. It is an intentional standalone experiment bridge, not a public framework Spatial Explorer API. Export maps and packed import/Node checks admit this route explicitly. There are no cross-package source imports.

The Phase 3A `BoundaryMesh` is unchanged: Float64 `[a,L,b]` positions, original linear RGB, logical triangle indices, source-face bytes, knots, revisions and `unqualified-reference` status remain authoritative. All original core exact tolerances and ColorValue semantics remain unchanged.

The application creates an indexed Float32 upload with a distinct vertex for each `(source face, logical vertex)` pair. Triangle order remains identical, so triangle-to-face provenance is retained directly. Separate Uint32 logical-vertex and Uint8 source-face maps accompany the upload. Area-weighted normals share only within a source face; real cube-face creases are not smoothed across. Scientific positions are neither centered, stretched nor normalized. Camera transformations operate on the scene only.

For each n=64 gamut there are 24,578 scientific vertices, 25,350 uploaded vertices and 49,152 triangles. Black's face-local normals are finite accumulated incident-triangle normals; no undefined analytic derivative at black is evaluated. The source generator's winding is preserved and the renderer draws front-facing triangles with back-face culling, without a DoubleSide workaround. Focused tests check every uploaded triangle at n=8 for both spaces, including source mapping, positive area, normals aligned with winding and separated corner normals. The existing larger Phase 3A topology and science fixtures remain in the normal suite.

## Presentation and camera

Shape mode uses a neutral Lambert surface, one white directional light and an ambient fill. There is no specular response, texture, environment, glass, shadow, tone mapping or post-processing. Light reveals existing normals; it does not alter positions. Color mode is a separate unlit raw shader.

Exactly one visible gamut is the opaque focused surface. A second visible gamut becomes a four-interval cube-face parameter cage evaluated from the scientific mesh, without triangle diagonals. Depth-tested solid lines identify exposed reference geometry; dim dashed lines identify geometry behind the surface. These lines do not imply a section, exact membership, or an exact curved silhouette. Hiding the focused gamut selects the remaining visible gamut; both may be hidden. Focusing a hidden gamut shows it. The UI identifies the surface and labels display limitations.

The orthographic Home target is `[0, 0.5, 0]`; eye direction is normalized `[1.35, 0.8, 1.65]` at distance 3. Vertical extent is 1.42 scientific units, near/far 0.01/20, zoom 1. Resize changes aspect while retaining a common scientific scale; zoom is bounded to 0.25–12. Fit visible projects the union of sampled visible bounds into the current orientation and leaves 12% margin. Bounds are sampled, not certified curved extrema. Home and Fit are immediate, so there is no queued transition or damping to fight during direct interaction. Reduced motion uses the same immediate behavior. Mouse/touch OrbitControls and keyboard arrows, Shift+arrows, +/- and Home control only this camera. Camera actions never regenerate meshes or consult instrument state.

Axes identify X=a, Y=L, Z=b. The screen-plane ruler uses the orthographic scale and chooses a readable 1/2/5 unit step as zoom changes; projected individual axes may be foreshortened by the camera. Axis labels have small screen offsets for readability.

## Color pipeline and device capability

The vertex shader passes `position.yxz`, recovering `[L,a,b]`. Orthographic interpolation therefore produces the represented point on each rendered triangle. The fragment shader evaluates OKLab → LMS′ → component-wise cube → linear output RGB → extended sign-preserving sRGB transfer. It does **not** interpolate source RGB as if those values were the exact color at an interior triangle point.

Core's new numeric-only `spatialColorDefinition()` returns caller-owned copies of the existing OKLab→LMS′ coefficients and the existing `@texel/color` 1.1.11 `fromLMS_M` definition, with its existing numeric revision. It also supplies the shared sRGB/P3 transfer parameters. There is no independent production color engine in the app. The numerical tests compare this path against a test-only CSS Color 4 XYZ D65 conversion/inverse, separately transcribed from [the dated specification](https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code). Existing core tests independently check the original coefficients against texel as well.

The production RawShaderMaterial includes no Three lighting, tone-mapping, exposure or output-color chunks. The renderer has NoToneMapping and exposure 1. The shader applies the transfer exactly once and writes to an explicitly sRGB-tagged drawing buffer. Negative and greater-than-one linear RGB survive through conversion and transfer; normalized framebuffer storage supplies the final saturation. This is display-preview clipping, never scientific gamut mapping. Mesh chords themselves need not be exactly on the nonlinear boundary.

The [color evidence JSON](phase-3b-color-measurements.json) records 24 fixtures per output encoding: both spaces' black/white, primaries, secondaries, near-black, transfer-threshold gray and middle gray, plus nonconstant interpolated OKLab and extended coordinates. The harness changes only clip positioning, retaining the production coordinate varying and fragment calculation. A second test material changes only the final output statement to read raw linear values into RGBA32F. Back-facing test triangles are culled to the clear color.

On recorded Chromium/ANGLE SwiftShader:

| Path     | Observed maximum 8-bit channel difference | Gate | Observed maximum raw linear difference |  Gate |
| -------- | ----------------------------------------: | ---: | -------------------------------------: | ----: |
| sRGB     |                             0 byte levels |   ≤1 |                               5.153e-7 | <4e-6 |
| P3 probe |                             0 byte levels |   ≤1 |                               5.310e-7 | <4e-6 |

The tolerances separate shader precision from 8-bit quantization. Raw-float checks run when `EXT_color_buffer_float` exists; the evidence records support. These are finite shader/framebuffer fixtures, not universal GPU or display accuracy claims.

The context accepted `drawingBufferColorSpace = "display-p3"` and the isolated raw material correctly encoded P3 values for readback. However `(color-gamut: p3)` was false and the renderer was software-based. This does not qualify compositor output, physical display primaries, operating-system color management or P3 reproduction. **The application deliberately stays on labeled sRGB preview.** There is no P3 output toggle and no claim of accurate P3 display. A wider-capability monitor alone would not constitute qualification.

## Fixed-grid screen-space experiment

[Full results and exact camera matrices](phase-3b-screen-measurements.json) are reproducible with `node apps/web/scripts/measureSpatialScreen.ts`. The base viewport is **1440×900 CSS pixels**. Three views are evaluated: Home, a blue-facing view with eye direction `[-0.4,0.1,-2]`, and a side view `[2,0.1,0.1]`. All share the Home target/extent. Zooms are 1, 2, 4, 8 and 12. All probes are retained even when outside the zoomed viewport, making this stricter than a cropped visible-only measurement. Orthographic CSS residuals scale linearly with zoom and stage height; DPR does not change CSS-pixel error. For a 1920×1080 stage multiply tabulated values by 1.2; for a 390×440 stage multiply by 440/900, retaining the same vertical extent and orientation.

Each scientific triangle receives the Phase 3A set of 13 held-out linear-domain barycentric probes, evaluated independently through the CSS XYZ oracle. The corresponding rendered triangle uses Float32 positions and Float32 projection/view coefficients with CPU projection arithmetic. Distances are to the closed corresponding projected triangle; Euclidean OKLab distances to the 3D triangle are reported separately. This does not measure GPU transform arithmetic or raster coverage.

Near-black probes (`L < 0.05`) are reported separately. A second diagnostic finds mesh silhouette edges by opposite adjacent-face viewing signs, evaluates seven independent source points along each edge, and measures screen distance to its segment. This qualifies those sampled silhouette-edge chords, **not the true curved surface's extremal silhouette**, exhaustive topology, or continuous Hausdorff distance. A full silhouette-extremum investigation remains open.

Maximum surface-to-corresponding-triangle residual, Home view, 900 CSS-pixel height:

| Gamut |   n | OKLab units | 1× CSS px | 2× CSS px | 4× CSS px | 12× CSS px |
| ----- | --: | ----------: | --------: | --------: | --------: | ---------: |
| sRGB  |  32 |  0.00121210 |   0.75346 |   1.50691 |   3.01383 |    9.04149 |
| sRGB  |  64 | 0.000606050 |   0.37673 |   0.75345 |   1.50691 |    4.52073 |
| sRGB  | 128 | 0.000303025 |   0.18836 |   0.37672 |   0.75345 |    2.26034 |
| P3    |  32 |  0.00129375 |   0.79947 |   1.59894 |   3.19788 |    9.59364 |
| P3    |  64 | 0.000646873 |   0.39973 |   0.79947 |   1.59893 |    4.79680 |
| P3    | 128 | 0.000323437 |   0.19987 |   0.39973 |   0.79946 |    2.39838 |

All maxima in the table occur in the near-black subset. At n=64, Home-view sampled silhouette-edge maxima are 0.20091/0.16382 CSS px at 1×, and 2.41094/1.96580 at 12× (sRGB/P3). The JSON retains other orientations, RMS, sample counts and the separate near-black silhouette results. Each n=64 mesh has 638,976 triangle-probe evaluations; n=128 has 2,555,904.

**The proposed 0.5 CSS-pixel target fails at high magnification, even at n=128.** n=64 is an explicit experimental resource choice, not an accepted production resolution or an all-camera quality guarantee. The UI identifies experimental quality. No resolution is silently increased and the exact gamut tolerance stays unchanged.

## Bounded conforming-adaptive experiment

Because fixed tessellation misses the target, `measureSpatialAdaptive.ts` runs an offline experiment starting at cubic n=32, limited to 10 rounds and 150,000 triangles per gamut. Four training probes mark failing triangles at a conservative 0.35-pixel spatial threshold for a 1080px stage at 12×. All edges of a marked triangle split at globally shared RGB midpoints. Every incident touched triangle fans around a newly converted scientific RGB centroid, retaining face provenance and winding. This avoids hanging nodes; no production mesh or cache is mutated.

Twelve different held-out weights independently evaluate the final Float32 triangles. Their 3D residual times orthographic pixels-per-unit is a conservative projected estimate **at those samples**, with no continuous certificate. The [adaptive results](phase-3b-adaptive-experiment.json) record every round, exact counts and work observations.

| Gamut | Final vertices | Final triangles | Held-out OKLab max | Projected estimate at 1080px / 12× | Scientific numeric bytes estimate |
| ----- | -------------: | --------------: | -----------------: | ---------------------------------: | --------------------------------: |
| sRGB  |         54,662 |         109,320 |       0.0000376675 |                         0.34378 px |                         4,044,936 |
| P3    |         61,079 |         122,154 |       0.0000369362 |                         0.33711 px |                         4,519,794 |

Seven refinement steps reached the training target. Both results retain Euler characteristic 2, exactly two opposite directed incidences per edge, positive triangle areas and source-face constraints. These checks do not certify embedding, arbitrary section fidelity or true silhouettes. Observed Node work was 4.69s / 7.74s on the recorded local run, unsuitable for a synchronous interaction path. The experiment is not shipped to the browser. A future adoption needs offline caching/worker ownership, broader independent probes, normal behavior, projected-silhouette and section evidence; it must not merely promote this result to a production guarantee.

## Lifecycle and resource evidence

Mounted ownership is explicit: one renderer/context, scene, orthographic camera, OrbitControls, two scientific meshes and their upload resources, shared materials, reference axes, context/key listeners and at most one requested frame. Initialization has a cleanup stack; render/shader failure becomes an explicit unavailable state. Disposal is idempotent and releases native listeners, controls, geometries, materials, programs and the owned context. Context loss prevents rendering and disconnects interaction; native restoration reuses scientific arrays and causes Three to reupload resources. The UI exposes a recovery action where the context-loss extension allows restoration.

VueUse `useResizeObserver`, `useDocumentVisibility` and `useEventListener` handle framework-owned browser observation and cleanup. Renderer scheduling, camera state and resource ownership remain explicit controller responsibilities. Browser globals and GPU allocation begin only after mount. The renderer module is also imported under a Node test environment with no `document`.

No loop, auto-rotation, damping, animation transition or `setAnimationLoop` exists. Changes coalesce into a single requestAnimationFrame; settled interaction schedules none. Hidden documents, explicit suspension and zero-sized hosts cancel pending work and disconnect active input. Restoration/resizing schedules one fresh frame. Backing dimensions cap DPR at 2 and total allocation at **3,000,000 pixels**; larger hosts lower effective DPR without changing scientific scale. No screenshot or physical-performance claim follows from the budget alone.

Per gamut at n=64:

| Storage                                                                   |     Bytes |
| ------------------------------------------------------------------------- | --------: |
| Scientific typed arrays                                                   | 1,819,240 |
| Potential GPU attributes/indices, including sparse cage and line distance | 1,296,528 |
| Logical/source upload maps retained on CPU                                |   126,750 |

Two gamuts total 3,638,480 scientific bytes plus 2,593,056 potential GPU buffer bytes and 253,500 mapping bytes. Three retains CPU copies of upload attributes too. The axes add 168 position bytes. Actual buffers upload lazily when used: the initial view reports three geometries; selecting the other gamut activates its surface/cage buffers. A focused surface plus comparison cage/hidden pass/axes is four draw calls and 49,152 surface triangles; a surface alone is two draw calls. Lines add their own vertices. These estimates exclude JS objects, renderer/driver overhead and browser compositor copies.

The recorded 900×700 context reports 4× MSAA. A color+depth estimate of `pixels × (8 × max(samples,1) + 4 when multisampled)` is 22,680,000 bytes at that size and at most 108,000,000 at the backing budget. This is an attachment estimate, not measured VRAM; browser buffering and driver formats can differ.

[Lifecycle/browser observations](phase-3b-lifecycle-measurements.json) record initial CPU generation/upload construction, first render submission, draw calls, matrices, backing size, restoration and disposal. A recorded run took about 85.1ms to construct the scene and 22.6ms for the first CPU render call, including shader/driver work. This is a single browser observation with JIT/GC/driver variability, not steady-state GPU timing. The environment is **Chromium/ANGLE SwiftShader software rendering**, not a physical integrated-GPU benchmark. The GPU timer-query extension was unavailable. Physical integrated-GPU responsiveness, thermal behavior and sustained interaction remain unqualified.

## Visual and test evidence

The inspected captures are [Shape](phase-3b-evidence/desktop-shape.png), [Color](phase-3b-evidence/desktop-color.png), [P3 focus](phase-3b-evidence/desktop-p3.png), and [phone P3](phase-3b-evidence/phone-p3.png). Desktop is 1600×1150, phone is 390×850, DPR 1, reduced motion, Playwright Chromium on Windows with the reported software renderer. Phone uses Fit visible. These are reproducible visual records, not portable GPU pixel baselines. Existing compact screenshot thresholds and references are unchanged.

Focused verification covers uploads/normals/provenance, independent color parameters, camera bounds/equal scale, backing budget, browser-global-free import, real native orbit, keyboard camera control, visibility/focus changes, Shape/Color raster differences, 320/390px layout, axe accessibility, WebGL2 fallback, framebuffer/raw shader checks, front/back faces, suspended/zero-size scheduling, context loss/restore, listener counts, resource disposal and remount. Host tests additionally verify server rendering without allocation, canvas content-box measurement and window-resize cleanup. Production verification proves no spatial chunk fetch on `/` and a working `/spatial` render. The production manifest gate separately walks eager imports and excludes Three/OrbitControls/generator code and spatial CSS.

Local validation passed `pnpm verify:prepush` (1,026 unit/component tests), core no-DOM and packed-domain checks, packed Vue/Vite (4 browser cases), React/Vite (8), Nuxt (8 development, 8 production, 6 generated with 2 intentional SSR skips), and Next (8 development, 8 production, 10 Strict Mode). Exact-commit CI is verified separately at delivery.

Early focused failures exposed low-contrast role text, a 320px toolbar overflow and a test harness that reacquired an unavailable extension during context loss; each was corrected before the exit gates. The broad local browser run recorded 188 passes and one listener-audit failure caused by Playwright window instrumentation; controller canvas/document ownership was isolated from the separately tested Vue window listener, then the lifecycle case passed three repeats and the full five-case spatial selection passed. Packed Nuxt first encountered the temporary review server on its required port; after that server was stopped, the unchanged consumer gate passed. The production suite initially recorded two passes and a spatial 404. Explicit host routing corrected that integration defect; focused revalidation and all three production cases passed. Local Wrangler additionally accepted both route declarations and verified the spatial 200 response, canonical slash redirect, no-cache HTML and unknown/configuration-path 404s. This is local Workers evidence, not a deployment claim.

Reproduce the measurements and captures from the repository root:

```powershell
pnpm build:packages
node apps/web/scripts/measureSpatialScreen.ts > screen.json
node apps/web/scripts/measureSpatialAdaptive.ts > adaptive.json
$env:SPATIAL_EVIDENCE = "$PWD/.artifacts/phase3b"
$env:SPATIAL_SCREENSHOTS = "$PWD/.artifacts/phase3b/screenshots"
pnpm --filter @gamut-plane/web exec playwright test e2e/spatial.spec.ts
pnpm --filter @gamut-plane/web exec vitest run test/spatial.test.ts test/spatialHost.test.ts
```

The scripts run natively on the repository's Node 24 floor and are type-checked by the web scripts configuration. Reports are explicit commands, not expensive normal-test inner loops. Regeneration does not overwrite committed reports unless explicitly redirected there. Hardware and timing fields can change between runs.

## Remaining Phase 3C work

Add hue half-planes and constant-lightness sections with scientific provenance, preserving disconnected components, tangencies and multiple chroma intervals. Qualify mesh/section approximation against core boundaries independently of the renderer. Decide whether and how to adopt conforming refinement or precomputed geometry without blocking interaction. Develop section-led selection, labeling and focus using this scene/camera/upload boundary; a public Vue/React Spatial Explorer API remains a later decision. Physical GPU performance and physical P3 display output need separate evidence. None requires redesigning the authoritative Phase 3A scientific representation.
