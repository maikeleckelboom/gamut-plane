# Performance

The renderer uses Canvas 2D with cached fields and sampled gamut guides. The contracts below describe current behavior. Timing results are historical measurements of specific source states and environments, not benchmarks of the current package or frame-rate guarantees.

## Rendering contracts

The synchronous renderer in `packages/render` owns buffers and draw-cache keys. Each Vue/React adapter owns its own scheduling and invalidation:

- Field drawing is scheduled through at most one pending `requestAnimationFrame`.
- Pointer movement stores only the latest point and applies it through at most one pending animation frame.
- Native range input stores only its latest clamped value and publishes at most once per animation frame. A native `change` cancels pending work, synchronously publishes the final value, and then commits it.
- Same-plane edits to the two visible axes move annotations without rebuilding the field or gamut contours.
- A fixed-axis change invalidates the field once and rebuilds each contour from its deterministic table.
- Size, actual device pixel ratio, granted Canvas color space, plane, and fixed axis form the field cache key.
- Canvas backing dimensions use the uncapped device pixel ratio. CSS dimensions remain the interaction coordinate system.
- The OKLab field is sampled into one reusable 80 × 80 offscreen buffer with 24 color samples per row, then scaled to the visible backing store.
- After native input begins during an OKLCH Hue pointer interaction, only the colored field uses one reusable 192-column preview buffer. Exact canonical state and contours remain live. Pointer completion immediately disables preview and schedules the ordinary full-width draw; rendered quality becomes full when that draw completes.
- Mutable color vectors, sampling scratch data, the offscreen canvas, Canvas contexts, and generated `Float32Array` tables are reused instead of allocated per sample.
- Generated boundary tables are loaded as static data. Generation never runs on startup or during interaction.

Unit tests cover invalidation, pointer-frame coalescing, generated-table determinism, and device-pixel-ratio handling. Playwright tests cover resize stability and interaction in a browser.

## Early observations

Early Windows measurements placed one uncached fixed-lightness OKLab field construction around 7.4–9.7 ms, warm generation of one gamut table around 6.8–7.0 ms, and a cached lookup around 0.02 ms.

The full environment and harness were not preserved for these observations. They provide historical context only and cannot serve as regression thresholds.

## Standalone-baseline measurements

The 2026-07-30 measurements used Windows 11 Pro 10.0.26200, an AMD Ryzen 7 8845HS, Node.js 24.16.0, pnpm 11.9.0, and Vite's SSR module loader. They timed the core functions with `performance.now()`, using 120 hue steps, 65 lightness steps, and 14 search iterations.

After 10 unrecorded warm-up generations, 100 uncached samples per gamut produced:

| Operation                 |   Median |      p95 |  Minimum |  Maximum |
| ------------------------- | -------: | -------: | -------: | -------: |
| Generate sRGB table       | 14.68 ms | 20.81 ms | 11.05 ms | 31.69 ms |
| Generate Display P3 table | 18.10 ms | 28.03 ms | 12.76 ms | 35.61 ms |

After priming the cache, 10,000 lookups per gamut had a 0.0005 ms median. The sRGB p95 was 0.0012 ms and the Display P3 p95 was 0.0008 ms.

No browser field-construction measurement was collected in this run. Its table-generation timings are not directly comparable to the early observations, whose hardware and harness were not preserved.

## 2026-07-31 Hue interaction measurements

The baseline was revision `fc9d7fd4f7deaea82e01efd95fb3415a66c0cb9e`. The candidate was an uncommitted Hue-preview implementation based on that revision; the raw record does not identify an exact candidate tree. Both runs used the same Windows 11 Pro 10.0.26200 machine, AMD Ryzen 7 8845HS CPU, NVIDIA RTX 4060 Laptop GPU plus AMD Radeon 780M Graphics, Balanced power scheme, Node.js 24.16.0, pnpm 11.9.0, headless Chromium 149.0.7827.55, a 1440 × 1000 viewport, device pixel ratio 1, and a granted Display P3 Canvas. The visible Canvas backing store was 518 × 518.

Both revisions were built for production and served by the pinned Vite preview server. Each run began with 20 unrecorded fixed-axis draws in OKLCH and 20 in OKLab. One native Hue range drag then used 100 Playwright pointer steps. The settled sample used 100 native `input`/`change` pairs and allowed two animation frames per value. Instrumentation measured `performance.now()` from the visible Canvas clear through its final `fillRect` or preview `drawImage`. Values are contextual main-thread construction costs, not universal frame-rate guarantees.

| Scenario                     | Horizontal samples | Sample count |  Median |     p95 | Minimum | Maximum |
| ---------------------------- | -----------------: | -----------: | ------: | ------: | ------: | ------: |
| Baseline drag, full field    |                518 |          100 | 43.8 ms | 58.0 ms | 29.6 ms | 61.5 ms |
| Candidate Hue drag preview   |                192 |          100 | 36.4 ms | 40.3 ms | 20.0 ms | 51.3 ms |
| Baseline settled full field  |                518 |          100 | 54.8 ms | 59.5 ms | 40.5 ms | 65.0 ms |
| Candidate settled full field |                518 |          100 | 54.1 ms | 60.0 ms | 49.3 ms | 76.4 ms |

Frame coalescing had little effect in the serialized native-drag trace: 101 input events produced 101 model publications and 202 contour-path mutations before coalescing, then 100 publications and 200 mutations afterward. Playwright yielded between almost every pointer step, so events rarely shared a frame. Unit tests cover bursts within one frame and final-value delivery on `change`. Each publication still updates both sampled contour paths, and full-field construction exceeded one 60 Hz frame in this environment.

The Hue preview reduces field sampling to 192 columns during pointer dragging. It leaves the authored hue, inspector output, membership, serialization, and contour calculations unchanged. Completion or interruption ends the preview; the next settled draw uses the full-width algorithm. Lightness, Chroma, keyboard edits, and OKLab fixed-lightness edits do not use this preview.

The settled before/after distributions overlap and should be treated as unchanged, not as a claimed settled-render improvement. The candidate retained 518 columns and a 518 × 518 backing store. Raw measurements and the harness description are preserved in [`performance-data/2026-07-31-hue-slider.json`](performance-data/2026-07-31-hue-slider.json).

## 2026-09-11 interaction hardening measurements

The baseline was `1a4adfd391cdc74bd9782faee39d7fc960ba3308`; the candidate was the uncommitted `dev` tree identified by source digests in [the raw measurements](performance-data/2026-09-11-hardening.json). Both used Windows 11 Pro 10.0.26200, Ryzen 7 8845HS, RTX 4060 Laptop/AMD Radeon 780M graphics, Balanced power, Node 24.19.0, pnpm 11.9.0, Vite 8.1.4 production builds and headless Chromium 149.0.7827.55. Viewport was 1440 × 1000, DPR 1, with a granted Display P3 Canvas and 518 × 518 backing store in both views.

Each scenario had 20 warm-ups and 100 recorded iterations. Field construction was timed from visible-context `clearRect` to its final `fillRect`/`drawImage`; fixed-axis input/change pairs had two animation frames between them. Pointer timing covered synchronous dispatch of a down, ten moves and an up, including geometry and final publication, with synthetic capture stubbed. It excludes subsequent Vue rendering and is not physical input latency. Raw samples, sample counts, minima and maxima are retained alongside these medians/p95 values:

| Scenario            | First baseline median / p95 | First candidate median / p95 | Repeated baseline median / p95 | Repeated candidate median / p95 |
| ------------------- | --------------------------: | ---------------------------: | -----------------------------: | ------------------------------: |
| OKLCH full field    |            31.30 / 34.80 ms |             69.75 / 90.40 ms |               63.00 / 82.20 ms |                68.20 / 83.90 ms |
| OKLab full field    |              3.10 / 4.00 ms |               7.35 / 9.70 ms |                 7.40 / 8.00 ms |                  6.45 / 8.40 ms |
| OKLCH pointer burst |              0.20 / 0.30 ms |               0.30 / 0.60 ms |                 0.30 / 0.50 ms |                  0.30 / 0.50 ms |
| OKLab pointer burst |              0.20 / 0.30 ms |               0.30 / 0.60 ms |                 0.30 / 0.50 ms |                  0.40 / 0.60 ms |

The repeated baseline used an isolated source archive and produced the same asset hashes as the original baseline build, but its timings shifted substantially. These distributions do not isolate a consistent rendering regression or improvement. Full-field work remains expensive, and pointer differences approach the timer's resolution.

Both revisions produced zero field redraws during visible-axis pointer bursts. Full OKLCH sampling, the 80 × 24 OKLab sampling scheme and the existing 192-column Hue preview are unchanged. The scheduling fixes invalidate a changed view even when its fixed-axis number matches the previous view, and preserve small fixed-axis changes in the cache key. Unit regressions cover those correctness cases separately from timing.

## Package size and loading

The render package contains two 120 × 65 Float32 tables (62,400 decoded bytes; 83,200 base64 characters), shared statically by both adapters. Import decodes the data without running the table-generation search. Framework runtimes and package dependencies remain external. Packed-consumer runners print compressed tarball sizes and included file lists.

React parity does not change the renderer/sampling algorithm or generated bytes, so it introduces no new benchmark claims. React package tests directly verify reusable OKLab 80 × 80 buffering with 24 samples per row, the 192-column Hue pointer preview, full-quality restoration, plane/fixed-axis invalidation and visible-axis reuse. Packed browser tests verify uncapped DPR, hidden/revealed sizing and visible compositing. The recorded measurements in this document describe their historical environment, not new React timings.

The renderer uses synchronized Canvas contexts. With `desynchronized: true`, the pinned Windows Chromium consumer produced valid bitmap pixels for the second instance but failed to composite its field. A browser regression checks visible light-to-dark field variation in both instances. This was a rendering correction; no latency comparison was recorded.

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
