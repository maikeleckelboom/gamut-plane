# Phase 2O review evidence

This is historical repair-pass evidence. The [independent review](phase-2o-independent-review.md) records fresh measurements. In particular, the finite oracle scan below cannot establish every crossing or a continuous two-way approximation bound.

Raw evidence for the [Phase 2O acceptance](phase-2o-acceptance.md) review round: guide fidelity (blocker A), sustained redraw (blocker B) and Gamuts popup placement (question D). The working tree was based on `d726a65fc3a44010c2edc92f92406fbc7f9a1136` and uncommitted. Machine: Windows 11 Pro 10.0.26300, 16 logical cores. Browser: Playwright-bundled Chromium 149.0.7827.55.

## A. Guide fidelity

Method:

- **Oracle:** independent of the tracer. It uses @texel/color's own `convert(OKLCH -> linear RGB)` with exact `[0, 1]` membership, scans chroma in 0.001 steps along each ray and bisects every membership change 52 times. This finds every crossing, including the re-entries of notched rays.
- **Metric:** the Euclidean distance from each oracle crossing, mapped into normalized field coordinates (OKLCH: `x = C / 0.4`, `y = 1 - L`; OKLab: `x = 0.5 + a / 0.8`, `y = 0.5 - b / 0.8`), to the guide polyline exactly as it is drawn. This is a normal, spatial displacement, not a chroma difference.
- **Pixels:** distance × field size × zoom. The 386 px field is the e2e fixture's measured surface; 480 px is the contract size.
- **"Previous table":** the unchanged `OKLCH_LIGHTNESS_CHROMA_PLANE` / `OKLAB_AB_PLANE.buildGamutContour` over the 120 by 65 tables.
- **"Traced":** the new `traceLightnessChromaGuide` / `traceOklabGuide`.
- **Slices:**
  - L/C: every 1.5° of hue, plus every 0.25° over 100–118° and every 0.125° over 258–272°.
  - a/b: every 0.01 of L, plus every 0.0025 over 0.40–0.50 and every 0.005 over 0.95–0.995.
  - Oracle lightness rows were spaced every 0.0004 near black and white and every 0.002 elsewhere; oracle hues every 0.05°.

| gamut      | plane     | slices | oracle points | guide          | mean px 1x / 4x / 8x  | p95 px 1x / 4x / 8x   | max px 1x / 4x / 8x        | max px at 8x, 480 px field |
| ---------- | --------- | ------ | ------------- | -------------- | --------------------- | --------------------- | -------------------------- | -------------------------- |
| srgb       | OKLCH L/C | 426    | 324,204       | previous table | 0.286 / 1.143 / 2.286 | 1.081 / 4.324 / 8.648 | 33.020 / 132.081 / 264.163 | 328.492                    |
| srgb       | OKLCH L/C | 426    | 324,204       | traced         | 0.004 / 0.015 / 0.029 | 0.017 / 0.069 / 0.139 | 0.050 / 0.201 / 0.402      | 0.499                      |
| srgb       | OKLab a/b | 149    | 1,073,196     | previous table | 0.060 / 0.240 / 0.479 | 0.076 / 0.304 / 0.608 | 16.223 / 64.894 / 129.787  | 161.394                    |
| srgb       | OKLab a/b | 149    | 1,073,196     | traced         | 0.004 / 0.016 / 0.032 | 0.024 / 0.096 / 0.192 | 0.054 / 0.214 / 0.428      | 0.533                      |
| display-p3 | OKLCH L/C | 426    | 323,760       | previous table | 0.129 / 0.516 / 1.031 | 0.490 / 1.958 / 3.916 | 14.944 / 59.775 / 119.549  | 148.662                    |
| display-p3 | OKLCH L/C | 426    | 323,760       | traced         | 0.003 / 0.014 / 0.027 | 0.017 / 0.066 / 0.132 | 0.050 / 0.201 / 0.401      | 0.499                      |
| display-p3 | OKLab a/b | 149    | 1,072,800     | previous table | 0.055 / 0.219 / 0.437 | 0.082 / 0.330 / 0.660 | 25.297 / 101.188 / 202.376 | 251.659                    |
| display-p3 | OKLab a/b | 149    | 1,072,800     | traced         | 0.004 / 0.018 / 0.035 | 0.025 / 0.100 / 0.201 | 0.051 / 0.206 / 0.411      | 0.512                      |

Worst locations (normalized plane distance, OKLCH L, hue, chroma of the oracle point):

- srgb lc previousTable: distance 8.554e-02 at L 0.4520, h 264.125, C 0.3130
- srgb lc traced: distance 1.301e-04 at L 0.9612, h 105.250, C 0.1329
- srgb ab previousTable: distance 4.203e-02 at L 0.9650, h 110.850, C 0.2119
- srgb ab traced: distance 1.387e-04 at L 0.0400, h 263.050, C 0.0203
- display-p3 lc previousTable: distance 3.871e-02 at L 0.8480, h 145.500, C 0.3667
- display-p3 lc traced: distance 1.300e-04 at L 0.9960, h 110.750, C 0.0160
- display-p3 ab previousTable: distance 6.554e-02 at L 0.9650, h 110.200, C 0.2421
- display-p3 ab traced: distance 1.332e-04 at L 0.1100, h 263.400, C 0.0706

| gamut      | plane     | vertices mean / p95 / max | cold trace ms mean / p95 / max | budget failures |
| ---------- | --------- | ------------------------- | ------------------------------ | --------------- |
| srgb       | OKLCH L/C | 108 / 112 / 364           | 0.52 / 0.92 / 2.28             | 0               |
| srgb       | OKLab a/b | 311 / 358 / 386           | 1.38 / 1.93 / 7.76             | 0               |
| display-p3 | OKLCH L/C | 108 / 113 / 148           | 0.60 / 1.06 / 1.68             | 0               |
| display-p3 | OKLab a/b | 255 / 308 / 312           | 1.19 / 1.80 / 3.96             | 0               |

The contract (spec §16.1) is `GUIDE_FIDELITY_BOUND` = 1/(8 × 480) of the field span, which is 1 px at 8x on a 480 px field. The traced guides measure 0.499–0.533 of it. "Cold trace" is one uncached call in Node 26.6 on this machine; within an instrument the last slice per gamut and plane is remembered, so dragging inside a plane does not retrace.

## B. Sustained redraw

Method:

- **Pages:** production build (`vite build`, served by `apps/web/scripts/serveProduction.ts`) and the Vite dev server. Same 1440x1000 viewport, DPR 1, dark scheme, reduced motion. A fresh browser context per run.
- **Field:** the first instrument's field (386 x 386 CSS px) in OKLCH L/C, OKLab a/b, sRGB R/G and Display P3 R/G.
- **Scenario "camera":** zoom to exactly 4x, then 200 frames, each one Space+Arrow pan alternating left/right, so every frame samples a new window.
- **Scenario "fixed":** Fit (1x, no camera involvement), then 200 real ArrowLeft/ArrowRight key presses on the fixed-coordinate slider (Hue, OKLab lightness or Blue). This exercises the pre-existing field renderer only.
- **Timing:** each `requestAnimationFrame` callback with `performance.now()`; a frame's time is the sum of its callbacks.
- **Instrumented runs:** additionally wrap `fillRect`, `drawImage`, `createLinearGradient` and `addColorStop` to separate native Canvas time from JS (sampling, string building, math). The wrappers add overhead, so absolute instrumented values are higher than plain ones.
- **Statistics:** windows over frames 1–20, 80–100 and 180–200; median / p95 / max in ms, nearest rank.
- **Controls:** run on `about:blank` with no app code. They do the same column-gradient work: 386 gradients x 40 color stops, either with fresh strings per frame or identical strings every frame. The JS-only control builds the same strings without touching Canvas.
- **Keyboard:** the fixed-coordinate scenario uses real keyboard input from Playwright; a first headless pass that dispatched synthetic key events did not move the native range and was discarded.

### Headless Chromium 149.0.7827.55 (200 frames per run, fresh page per run)

| build | editor      | scenario | instrumented | frames 1-20 median / p95 / max ms | frames 80-100      | frames 180-200     |
| ----- | ----------- | -------- | ------------ | --------------------------------- | ------------------ | ------------------ |
| prod  | oklch       | camera   | no           | 20.9 / 26.4 / 26.5                | 30.3 / 33.7 / 34.3 | 30.4 / 31.2 / 35.3 |
| prod  | oklch       | camera   | yes          | 24.9 / 27.5 / 27.6                | 42.0 / 46.0 / 46.5 | 49.3 / 51.3 / 53.5 |
| prod  | oklch       | fixed    | no           | 19.4 / 23.1 / 29.4                | 36.6 / 43.6 / 45.7 | 32.4 / 45.7 / 46.0 |
| prod  | oklch       | fixed    | yes          | 25.7 / 29.5 / 32.4                | 48.6 / 56.1 / 63.6 | 45.4 / 57.6 / 71.5 |
| prod  | oklab       | camera   | no           | 3.7 / 5.2 / 5.4                   | 3.3 / 3.8 / 4.1    | 3.4 / 3.6 / 4.7    |
| prod  | oklab       | camera   | yes          | 4.0 / 5.0 / 5.1                   | 4.0 / 4.2 / 4.2    | 7.2 / 10.5 / 10.6  |
| prod  | oklab       | fixed    | no           | 3.3 / 3.9 / 4.1                   | 5.3 / 7.0 / 7.1    | 5.3 / 6.2 / 6.5    |
| prod  | srgb        | camera   | no           | 21.5 / 22.6 / 22.8                | 37.9 / 41.2 / 42.9 | 37.2 / 38.0 / 38.1 |
| prod  | srgb        | camera   | yes          | 30.1 / 32.9 / 36.6                | 49.1 / 52.4 / 53.4 | 56.5 / 66.1 / 67.9 |
| prod  | srgb        | fixed    | no           | 23.9 / 30.1 / 30.4                | 36.8 / 43.1 / 47.5 | 41.5 / 49.0 / 52.6 |
| prod  | display-p3  | camera   | no           | 21.3 / 25.5 / 32.5                | 40.7 / 44.9 / 45.2 | 35.9 / 41.6 / 41.8 |
| prod  | display-p3  | camera   | yes          | 27.2 / 28.5 / 28.9                | 47.8 / 51.6 / 54.7 | 48.0 / 51.3 / 57.6 |
| prod  | display-p3  | fixed    | no           | 20.7 / 22.0 / 23.4                | 36.4 / 45.0 / 47.5 | 42.5 / 47.0 / 51.3 |
| dev   | oklch       | camera   | no           | 18.4 / 20.9 / 21.9                | 34.3 / 36.5 / 37.4 | 28.0 / 29.6 / 30.8 |
| dev   | oklch       | camera   | yes          | 21.9 / 23.8 / 25.4                | 43.2 / 47.7 / 47.7 | 40.9 / 49.6 / 55.7 |
| dev   | oklch       | fixed    | no           | 18.3 / 20.7 / 20.9                | 28.5 / 31.3 / 39.7 | 36.3 / 39.2 / 42.4 |
| dev   | oklch       | fixed    | yes          | 24.1 / 27.1 / 27.2                | 42.7 / 62.6 / 66.9 | 39.8 / 67.9 / 69.1 |
| dev   | oklab       | camera   | no           | 3.8 / 4.4 / 4.9                   | 5.4 / 6.7 / 6.9    | 5.0 / 6.1 / 6.7    |
| dev   | oklab       | camera   | yes          | 4.4 / 4.9 / 5.0                   | 9.1 / 10.2 / 10.5  | 6.5 / 6.9 / 7.1    |
| dev   | oklab       | fixed    | no           | 3.4 / 4.0 / 4.4                   | 5.0 / 6.3 / 7.6    | 6.1 / 7.3 / 8.1    |
| dev   | srgb        | camera   | no           | 21.4 / 26.2 / 26.2                | 34.7 / 41.5 / 46.1 | 32.0 / 35.2 / 35.7 |
| dev   | srgb        | camera   | yes          | 24.3 / 28.9 / 29.6                | 45.8 / 60.1 / 62.5 | 49.7 / 55.7 / 56.2 |
| dev   | srgb        | fixed    | no           | 21.0 / 26.1 / 29.4                | 34.3 / 36.1 / 38.8 | 36.0 / 40.2 / 41.2 |
| dev   | display-p3  | camera   | no           | 20.1 / 22.4 / 24.6                | 33.8 / 36.9 / 37.5 | 35.0 / 39.0 / 39.7 |
| dev   | display-p3  | camera   | yes          | 26.2 / 27.9 / 28.3                | 46.6 / 49.9 / 57.7 | 46.6 / 49.4 / 53.1 |
| dev   | display-p3  | fixed    | no           | 20.4 / 22.6 / 25.3                | 32.3 / 40.0 / 40.2 | 36.9 / 41.9 / 44.9 |
| none  | canvas-only | fresh    | no           | 19.4 / 24.9 / 26.2                | 35.4 / 49.9 / 51.2 | 34.3 / 38.8 / 40.7 |
| none  | canvas-only | same     | no           | 17.2 / 20.5 / 20.8                | 16.8 / 18.3 / 21.3 | 31.8 / 36.5 / 36.5 |

JS versus native Canvas split (instrumented runs; native is time inside `fillRect`, `drawImage`, `createLinearGradient` and `addColorStop`; JS is the frame callback minus native):

| build | editor     | scenario | window  | frame median ms | native median ms | JS median ms |
| ----- | ---------- | -------- | ------- | --------------- | ---------------- | ------------ |
| prod  | oklch      | camera   | 1-20    | 24.9            | 20.3             | 4.4          |
| prod  | oklch      | camera   | 80-100  | 42.0            | 34.4             | 7.4          |
| prod  | oklch      | camera   | 180-200 | 49.3            | 40.1             | 8.7          |
| prod  | oklch      | fixed    | 1-20    | 25.7            | 21.3             | 5.3          |
| prod  | oklch      | fixed    | 80-100  | 48.6            | 37.8             | 9.9          |
| prod  | oklch      | fixed    | 180-200 | 45.4            | 35.6             | 9.1          |
| prod  | oklab      | camera   | 1-20    | 4.0             | 2.8              | 1.3          |
| prod  | oklab      | camera   | 80-100  | 4.0             | 2.5              | 1.3          |
| prod  | oklab      | camera   | 180-200 | 7.2             | 4.9              | 2.4          |
| prod  | srgb       | camera   | 1-20    | 30.1            | 23.3             | 6.4          |
| prod  | srgb       | camera   | 80-100  | 49.1            | 38.8             | 10.6         |
| prod  | srgb       | camera   | 180-200 | 56.5            | 44.0             | 13.4         |
| prod  | display-p3 | camera   | 1-20    | 27.2            | 21.6             | 5.7          |
| prod  | display-p3 | camera   | 80-100  | 47.8            | 37.9             | 9.6          |
| prod  | display-p3 | camera   | 180-200 | 48.0            | 37.9             | 9.6          |
| dev   | oklch      | camera   | 1-20    | 21.9            | 18.0             | 4.3          |
| dev   | oklch      | camera   | 80-100  | 43.2            | 33.4             | 10.0         |
| dev   | oklch      | camera   | 180-200 | 40.9            | 32.4             | 8.1          |
| dev   | oklch      | fixed    | 1-20    | 24.1            | 18.5             | 5.6          |
| dev   | oklch      | fixed    | 80-100  | 42.7            | 34.4             | 9.0          |
| dev   | oklch      | fixed    | 180-200 | 39.8            | 31.8             | 8.7          |
| dev   | oklab      | camera   | 1-20    | 4.4             | 3.1              | 1.4          |
| dev   | oklab      | camera   | 80-100  | 9.1             | 5.4              | 3.5          |
| dev   | oklab      | camera   | 180-200 | 6.5             | 4.1              | 2.3          |
| dev   | srgb       | camera   | 1-20    | 24.3            | 19.4             | 5.4          |
| dev   | srgb       | camera   | 80-100  | 45.8            | 35.9             | 9.5          |
| dev   | srgb       | camera   | 180-200 | 49.7            | 38.9             | 11.1         |
| dev   | display-p3 | camera   | 1-20    | 26.2            | 20.6             | 5.6          |
| dev   | display-p3 | camera   | 80-100  | 46.6            | 37.8             | 9.4          |
| dev   | display-p3 | camera   | 180-200 | 46.6            | 38.4             | 8.5          |

### Headed Chromium 149.0.7827.55 (200 frames per run, fresh page per run)

| build | editor      | scenario | instrumented | frames 1-20 median / p95 / max ms | frames 80-100      | frames 180-200     |
| ----- | ----------- | -------- | ------------ | --------------------------------- | ------------------ | ------------------ |
| prod  | oklch       | camera   | no           | 18.1 / 19.6 / 21.1                | 17.8 / 19.2 / 20.1 | 17.4 / 18.4 / 18.4 |
| prod  | oklch       | camera   | yes          | 25.0 / 26.5 / 29.2                | 25.7 / 35.6 / 35.9 | 32.6 / 35.9 / 37.9 |
| prod  | oklch       | fixed    | no           | 19.2 / 23.7 / 26.9                | 24.2 / 28.5 / 28.8 | 21.2 / 24.5 / 26.3 |
| prod  | oklch       | fixed    | yes          | 25.6 / 31.1 / 31.2                | 35.3 / 39.5 / 41.7 | 32.2 / 38.7 / 39.4 |
| prod  | oklab       | camera   | no           | 3.4 / 4.3 / 4.6                   | 3.3 / 4.3 / 4.4    | 3.3 / 4.4 / 4.4    |
| prod  | oklab       | camera   | yes          | 4.2 / 4.8 / 4.9                   | 4.1 / 5.1 / 5.3    | 3.9 / 4.8 / 5.0    |
| prod  | oklab       | fixed    | no           | 4.0 / 5.2 / 5.3                   | 3.1 / 4.1 / 4.6    | 2.8 / 4.2 / 5.8    |
| prod  | srgb        | camera   | no           | 22.4 / 23.8 / 28.5                | 21.5 / 22.8 / 23.9 | 26.8 / 30.2 / 30.7 |
| prod  | srgb        | camera   | yes          | 28.5 / 29.3 / 30.0                | 38.2 / 42.4 / 43.3 | 36.6 / 41.8 / 41.9 |
| prod  | srgb        | fixed    | no           | 22.1 / 23.8 / 24.0                | 25.5 / 32.4 / 32.6 | 22.9 / 24.6 / 25.0 |
| prod  | display-p3  | camera   | no           | 20.5 / 21.9 / 23.1                | 20.1 / 21.2 / 22.2 | 23.2 / 25.3 / 26.0 |
| prod  | display-p3  | camera   | yes          | 27.4 / 28.9 / 29.1                | 30.5 / 33.1 / 42.1 | 30.8 / 33.1 / 33.1 |
| prod  | display-p3  | fixed    | no           | 21.8 / 24.6 / 25.8                | 22.2 / 23.8 / 26.3 | 22.4 / 24.4 / 25.9 |
| dev   | oklch       | camera   | no           | 17.0 / 17.7 / 18.2                | 16.2 / 18.4 / 19.8 | 21.0 / 24.5 / 24.8 |
| dev   | oklch       | camera   | yes          | 23.4 / 24.8 / 29.6                | 21.8 / 24.8 / 26.1 | 25.0 / 28.6 / 30.7 |
| dev   | oklch       | fixed    | no           | 17.6 / 19.4 / 20.0                | 17.2 / 20.1 / 21.4 | 17.4 / 19.3 / 19.3 |
| dev   | oklch       | fixed    | yes          | 23.3 / 25.3 / 27.6                | 24.2 / 27.0 / 27.2 | 24.0 / 25.6 / 28.9 |
| dev   | oklab       | camera   | no           | 3.3 / 4.0 / 4.4                   | 3.2 / 3.7 / 4.1    | 3.2 / 3.9 / 4.1    |
| dev   | oklab       | camera   | yes          | 3.9 / 5.1 / 5.6                   | 4.0 / 4.6 / 4.7    | 3.6 / 4.5 / 4.5    |
| dev   | oklab       | fixed    | no           | 4.1 / 4.9 / 5.3                   | 3.6 / 4.3 / 4.3    | 3.8 / 4.9 / 5.3    |
| dev   | srgb        | camera   | no           | 18.4 / 19.2 / 20.2                | 17.5 / 18.9 / 19.3 | 19.6 / 21.3 / 21.6 |
| dev   | srgb        | camera   | yes          | 24.2 / 25.8 / 26.1                | 25.4 / 28.2 / 29.0 | 27.4 / 28.5 / 28.5 |
| dev   | srgb        | fixed    | no           | 18.9 / 20.8 / 20.9                | 18.6 / 19.8 / 22.2 | 19.2 / 24.4 / 27.6 |
| dev   | display-p3  | camera   | no           | 17.8 / 19.3 / 19.9                | 18.2 / 19.7 / 20.4 | 21.2 / 23.4 / 27.2 |
| dev   | display-p3  | camera   | yes          | 23.8 / 25.4 / 25.8                | 23.2 / 25.6 / 25.8 | 25.9 / 26.8 / 27.6 |
| dev   | display-p3  | fixed    | no           | 21.9 / 27.9 / 29.8                | 22.3 / 25.3 / 26.2 | 19.3 / 21.4 / 26.7 |
| none  | canvas-only | fresh    | no           | 18.9 / 23.3 / 23.8                | 17.1 / 18.5 / 18.8 | 21.2 / 24.5 / 24.6 |
| none  | canvas-only | same     | no           | 18.2 / 27.1 / 27.1                | 17.1 / 18.9 / 19.1 | 36.1 / 40.6 / 50.7 |

JS versus native Canvas split (instrumented runs; native is time inside `fillRect`, `drawImage`, `createLinearGradient` and `addColorStop`; JS is the frame callback minus native):

| build | editor     | scenario | window  | frame median ms | native median ms | JS median ms |
| ----- | ---------- | -------- | ------- | --------------- | ---------------- | ------------ |
| prod  | oklch      | camera   | 1-20    | 25.0            | 20.6             | 4.4          |
| prod  | oklch      | camera   | 80-100  | 25.7            | 21.0             | 4.6          |
| prod  | oklch      | camera   | 180-200 | 32.6            | 25.9             | 5.7          |
| prod  | oklch      | fixed    | 1-20    | 25.6            | 19.9             | 5.5          |
| prod  | oklch      | fixed    | 80-100  | 35.3            | 27.5             | 8.0          |
| prod  | oklch      | fixed    | 180-200 | 32.2            | 25.0             | 7.0          |
| prod  | oklab      | camera   | 1-20    | 4.2             | 2.7              | 1.4          |
| prod  | oklab      | camera   | 80-100  | 4.1             | 2.6              | 1.5          |
| prod  | oklab      | camera   | 180-200 | 3.9             | 2.7              | 1.3          |
| prod  | srgb       | camera   | 1-20    | 28.5            | 22.4             | 6.1          |
| prod  | srgb       | camera   | 80-100  | 38.2            | 28.6             | 8.4          |
| prod  | srgb       | camera   | 180-200 | 36.6            | 27.8             | 8.1          |
| prod  | display-p3 | camera   | 1-20    | 27.4            | 22.0             | 5.6          |
| prod  | display-p3 | camera   | 80-100  | 30.5            | 24.1             | 6.4          |
| prod  | display-p3 | camera   | 180-200 | 30.8            | 24.7             | 6.4          |
| dev   | oklch      | camera   | 1-20    | 23.4            | 18.3             | 4.8          |
| dev   | oklch      | camera   | 80-100  | 21.8            | 17.7             | 4.3          |
| dev   | oklch      | camera   | 180-200 | 25.0            | 20.1             | 4.8          |
| dev   | oklch      | fixed    | 1-20    | 23.3            | 17.9             | 5.8          |
| dev   | oklch      | fixed    | 80-100  | 24.2            | 18.3             | 5.8          |
| dev   | oklch      | fixed    | 180-200 | 24.0            | 18.1             | 5.6          |
| dev   | oklab      | camera   | 1-20    | 3.9             | 2.6              | 1.5          |
| dev   | oklab      | camera   | 80-100  | 4.0             | 2.6              | 1.3          |
| dev   | oklab      | camera   | 180-200 | 3.6             | 2.4              | 1.2          |
| dev   | srgb       | camera   | 1-20    | 24.2            | 19.3             | 4.9          |
| dev   | srgb       | camera   | 80-100  | 25.4            | 20.0             | 5.6          |
| dev   | srgb       | camera   | 180-200 | 27.4            | 21.3             | 5.7          |
| dev   | display-p3 | camera   | 1-20    | 23.8            | 19.3             | 4.1          |
| dev   | display-p3 | camera   | 80-100  | 23.2            | 18.9             | 4.3          |
| dev   | display-p3 | camera   | 180-200 | 25.9            | 21.3             | 4.3          |

### Control workloads, headless (about:blank, no app code)

| workload     | frames 1-20        | frames 80-100      | frames 180-200     |
| ------------ | ------------------ | ------------------ | ------------------ |
| js           | 2.8 / 3.3 / 5.0    | 3.7 / 6.7 / 6.9    | 5.6 / 5.9 / 6.0    |
| canvas-fresh | 17.4 / 18.0 / 21.5 | 33.2 / 40.4 / 44.3 | 36.1 / 41.5 / 43.3 |
| canvas-same  | 17.1 / 19.2 / 20.0 | 29.9 / 43.9 / 44.3 | 35.1 / 44.0 / 44.1 |
| js           | 2.7 / 3.3 / 4.5    | 2.9 / 7.0 / 7.0    | 4.9 / 5.9 / 5.9    |
| canvas-fresh | 17.1 / 18.4 / 20.5 | 27.6 / 43.2 / 44.3 | 34.3 / 41.6 / 43.3 |

### Control workloads, headless with renderer backgrounding disabled (about:blank, no app code)

| workload     | frames 1-20        | frames 80-100      | frames 180-200     |
| ------------ | ------------------ | ------------------ | ------------------ |
| js           | 2.8 / 3.7 / 4.3    | 3.7 / 5.8 / 5.9    | 5.8 / 6.7 / 7.1    |
| canvas-fresh | 17.5 / 19.4 / 19.8 | 35.2 / 41.4 / 41.7 | 35.9 / 43.9 / 43.9 |
| canvas-same  | 17.5 / 18.8 / 21.0 | 32.4 / 40.2 / 41.5 | 36.0 / 40.7 / 42.3 |
| js           | 2.6 / 3.2 / 3.8    | 3.1 / 6.6 / 6.7    | 5.5 / 6.4 / 6.5    |
| canvas-fresh | 17.3 / 18.4 / 19.2 | 33.8 / 43.5 / 44.1 | 37.5 / 42.6 / 45.9 |

### Control workloads, headed (about:blank, no app code)

| workload     | frames 1-20        | frames 80-100      | frames 180-200     |
| ------------ | ------------------ | ------------------ | ------------------ |
| js           | 2.7 / 3.4 / 5.8    | 2.7 / 3.4 / 3.9    | 2.6 / 3.2 / 3.2    |
| canvas-fresh | 18.2 / 21.2 / 22.0 | 17.5 / 18.7 / 19.6 | 17.0 / 17.6 / 17.8 |
| canvas-same  | 17.9 / 20.1 / 22.0 | 16.8 / 18.1 / 18.2 | 21.9 / 25.4 / 25.6 |
| js           | 3.0 / 4.0 / 4.3    | 2.8 / 3.4 / 3.5    | 2.7 / 3.4 / 3.5    |
| canvas-fresh | 17.9 / 20.0 / 21.7 | 17.2 / 17.9 / 18.1 | 23.5 / 25.7 / 27.4 |

## D. Gamuts popup placement

The probe measures the first instrument in the production app, with the allocated width set as the visual tests do. It then forces the control row to zero height for comparison. The popup flips up only when `below < height && above > below` (`packages/ui/src/interaction/gamutInteraction.ts`).

| case                                       | control row | trigger bottom | space below | popup height | opens | overlaps field | inside viewport |
| ------------------------------------------ | ----------- | -------------- | ----------- | ------------ | ----- | -------------- | --------------- |
| 440 px, 1440x1000 (reference)              | present     | 800.6          | 191.4       | 205          | up    | yes            | yes             |
| 440 px, 1440x1000                          | removed     | 765.4          | 226.6       | 205          | down  | no             | yes             |
| 440 px, 1440x1100                          | present     | 800.6          | 291.4       | 205          | down  | no             | yes             |
| 320 px, 1440x1000 (reference)              | present     | 680.6          | 311.4       | 255.6        | down  | no             | yes             |
| 320 px enlarged text, 390x1100 (reference) | present     | 1100.3         | -8.3        | 497.6        | up    | yes            | yes             |
| 320 px enlarged text, 390x1100             | removed     | 1093.3         | -1.3        | 497.6        | up    | yes            | yes             |

Focus stays on the trigger after a pointer click in every case. The keyboard path that moves focus into the popup is covered by the existing `gamuts-forced-colors` and keyboard specs.
