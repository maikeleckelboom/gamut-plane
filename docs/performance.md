# Performance

## Maintained contracts

The renderer is intentionally Canvas 2D and keeps work bounded through explicit invalidation:

- Field drawing is scheduled through at most one pending `requestAnimationFrame`.
- Pointer movement stores only the latest point and applies it through at most one pending animation frame.
- Native range input stores only its latest clamped value and publishes at most once per animation frame. A native `change` cancels pending work, synchronously publishes the final value, and then commits it.
- Same-plane edits to the two visible axes move annotations without rebuilding the field or gamut contours.
- A fixed-axis change invalidates the field once and rebuilds each contour from its deterministic table.
- Size, actual device pixel ratio, granted Canvas color space, plane, and fixed axis form the field cache key.
- Canvas backing dimensions use the uncapped device pixel ratio. CSS dimensions remain the interaction coordinate system.
- The OKLab field is sampled into one reusable 80 × 80 offscreen buffer with 24 color samples per row, then scaled to the visible backing store.
- While the OKLCH Hue range has an active pointer drag, only the colored field uses one reusable 192-column preview buffer. Exact canonical state and contours remain live; interaction completion or loss restores the ordinary full-width draw immediately.
- Mutable color vectors, sampling scratch data, the offscreen canvas, Canvas contexts, and generated `Float32Array` tables are reused instead of allocated per sample.
- Generated boundary tables are loaded as static data. Generation never runs on startup or during interaction.

These are correctness and workload-shape contracts, not universal frame-time promises. Unit tests assert invalidation behavior, pointer-frame coalescing, generated-table determinism, and device-pixel-ratio handling. Playwright tests exercise resize stability and interaction in a real browser.

## Reference observations

Earlier measurements on a Windows development machine placed one uncached fixed-lightness OKLab field construction around 7.4–9.7 ms. A separate audit measured warm generation of one gamut table around 6.8–7.0 ms and a cached lookup around 0.02 ms.

Those observations are contextual, not benchmark guarantees: the machines, browser/runtime versions, power state, and instrumentation were not identical to this baseline. They justify keeping generation off the interaction path and preserving cache keys; they do not establish a cross-machine regression threshold.

## Standalone-baseline measurements

The 2026-07-30 standalone audit used Windows 11 Pro 10.0.26200, an AMD Ryzen 7 8845HS, Node.js 24.16.0, pnpm 11.9.0, and Vite's SSR module loader. It measured `performance.now()` around the core functions only, using the checked-in table settings of 120 hue steps, 65 lightness steps, and 14 search iterations.

After 10 unrecorded warm-up generations, 100 uncached samples per gamut produced:

| Operation                 |   Median |      p95 |  Minimum |  Maximum |
| ------------------------- | -------: | -------: | -------: | -------: |
| Generate sRGB table       | 14.68 ms | 20.81 ms | 11.05 ms | 31.69 ms |
| Generate Display P3 table | 18.10 ms | 28.03 ms | 12.76 ms | 35.61 ms |

After priming the cache, 10,000 lookups per gamut had a 0.0005 ms median. The sRGB p95 was 0.0012 ms and the Display P3 p95 was 0.0008 ms.

Uncached generation on this environment is slower than the earlier 6.8–7.0 ms observation; cached lookup is faster than the earlier 0.02 ms observation. The comparison is directional only because the earlier hardware and harness were not preserved. No new browser field-construction number was collected, so the earlier 7.4–9.7 ms range must not be treated as a current result.

## 2026-07-31 Hue interaction measurements

The pre-change control was revision `fc9d7fd4f7deaea82e01efd95fb3415a66c0cb9e`. The candidate was measured from this change's working tree on that revision before commit. Both runs used the same Windows 11 Pro 10.0.26200 machine, AMD Ryzen 7 8845HS CPU, NVIDIA RTX 4060 Laptop GPU plus AMD Radeon 780M Graphics, Balanced power scheme, Node.js 24.16.0, pnpm 11.9.0, headless Chromium 149.0.7827.55, a 1440 × 1000 viewport, device pixel ratio 1, and a granted Display P3 Canvas. The visible Canvas backing store was 518 × 518.

Both revisions were built for production and served by the pinned Vite preview server. Each run began with 20 unrecorded fixed-axis draws in OKLCH and 20 in OKLab. One native Hue range drag then used 100 Playwright pointer steps. The settled sample used 100 native `input`/`change` pairs and allowed two animation frames per value. Instrumentation measured `performance.now()` from the visible Canvas clear through its final `fillRect` or preview `drawImage`. Values are contextual main-thread construction costs, not universal frame-rate guarantees.

| Scenario                     | Horizontal samples | Sample count |  Median |     p95 | Minimum | Maximum |
| ---------------------------- | -----------------: | -----------: | ------: | ------: | ------: | ------: |
| Baseline drag, full field    |                518 |          100 | 43.8 ms | 58.0 ms | 29.6 ms | 61.5 ms |
| Candidate Hue drag preview   |                192 |          100 | 36.4 ms | 40.3 ms | 20.0 ms | 51.3 ms |
| Baseline settled full field  |                518 |          100 | 54.8 ms | 59.5 ms | 40.5 ms | 65.0 ms |
| Candidate settled full field |                518 |          100 | 54.1 ms | 60.0 ms | 49.3 ms | 76.4 ms |

Source coalescing is still required: deterministic tests prove that multiple native inputs before one animation frame publish only the latest value, and that `change` cannot lose the final value. It was not sufficient by itself in the serialized native-drag trace. The baseline produced 101 model publications and 202 visible contour-path mutations for 101 input events; after coalescing, the same Playwright trace still produced 100 publications and 200 path mutations because the automation protocol yielded between almost every pointer step. Each canonical publication still updates both exact fixed-hue contour paths. The per-draw full-field work therefore remained well beyond one 60 Hz frame in this environment.

That evidence justified the second, interaction-only layer. During a Hue pointer drag, the Canvas field alone uses 192 reusable horizontal samples. Canonical hue, inspector output, exact membership, CSS serialization, and both contours continue to use the exact current color. `change`, pointer completion, cancellation, capture loss, blur, and component teardown leave no preview active; the next settled draw uses the original full-width algorithm and backing dimensions. No preview applies to Lightness, Chroma, keyboard edits, or OKLab fixed-lightness edits.

The settled before/after distributions overlap and should be treated as unchanged, not as a claimed settled-render improvement. The candidate retained 518 columns and a 518 × 518 backing store. Raw measurements and the harness description are preserved in [`performance-data/2026-07-31-hue-slider.json`](performance-data/2026-07-31-hue-slider.json).

## Reproducible benchmark protocol

Use the following protocol when a renderer, sampling, or table algorithm change needs numeric evidence:

1. Record the Git revision, operating system, CPU, GPU, power mode, browser and Node versions, viewport, device pixel ratio, and granted Canvas color space.
2. Use a production build and close unrelated high-load applications.
3. Warm the instrument with at least 20 draws of each plane before recording.
4. Measure at least 100 iterations for each scenario: cached same-axis update, fixed-axis redraw, resize redraw, OKLCH field, OKLab field, and contour construction for each gamut.
5. Use browser performance marks around the exact draw or contour function; do not time user input, Vue mounting, dev-server startup, or screenshot capture as renderer work.
6. Report median, 95th percentile, minimum, maximum, and sample count. Preserve raw samples with the change under review.
7. Compare the same scenario and environment before and after the change. Treat a result smaller than normal run-to-run variance as inconclusive.
8. Run unit, browser, and screenshot tests after instrumentation is removed or disabled.

Any accepted performance optimization must preserve exact membership, plane geometry, boundary semantics, interaction cancellation, high-DPI sharpness, and the visible color-space capability report.
