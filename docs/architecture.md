# Architecture

## Layer boundaries

Gamut Plane has two maintained layers.

`packages/core` owns color-domain behavior:

- neutral OKLCH and OKLab value types;
- conversions between OKLCH, OKLab, sRGB, and Display P3;
- exact gamut membership and boundary search;
- CSS color parsing, formatting, and exact serialization;
- picker-plane projection, unprojection, constraints, keyboard behavior, and sampling contracts;
- deterministic table interpolation and derived visualization analysis.

The package is framework-independent and browser-independent. Its public barrel exports only retained reusable contracts. It must not gain Vue components, DOM types, Canvas state, app copy, route state, persistence, or generated web assets.

`apps/web` owns the runnable instrument:

- Vue state and component composition;
- Canvas 2D field rendering;
- SVG boundary presentation and visible controls;
- pointer and keyboard event arbitration;
- ResizeObserver and device-pixel-ratio integration;
- clipboard behavior and accessible status announcements;
- capability reporting, responsive layout, browser tests, and generated visualization tables.

The app may depend on core. Core must never depend on the app.

## State ownership

`App.vue` owns the active canonical `OklchColor`, selected plane, boundary visibility, and Canvas capability status as local state. Selecting a plane changes the view only. It does not round-trip or rewrite the color.

The planar component emits live color updates and one commit per completed interaction. It keeps transient pointer state locally, coalesces pointer movement through one pending animation frame, and restores the interaction origin on cancellation. No global store or persistence layer exists.

## Exact facts and visualization guides

Exact Display P3 and sRGB membership is calculated directly from the active color. It is not sampled from a contour.

Contours, crossing ticks, and the sRGB boundary projection are interpolated visualization guides. They use `Float32Array` data generated ahead of time and may be less precise than direct conversion. The UI and API keep this evidence class distinct from exact membership and serialization.

## Generated tables

The web app owns checked-in tables at `apps/web/src/generated/gamutTables.ts`. The TypeScript generator at `apps/web/scripts/generateGamutTables.ts` calls core math through Vite's module runner, emits deterministic `Float32Array` payloads, and records the generation settings and digest.

Generation does not run at application startup or during interaction. `pnpm check:gamut-tables` regenerates in memory and fails when the checked-in artifact is stale. Any intentional setting or algorithm change must regenerate the file and update its tests and evidence in the same change.

## Renderer boundary

Rendering remains an app concern for this baseline. `ColorPlane.vue` owns Canvas context negotiation, drawing buffers, invalidation keys, and DOM event integration while delegating projection and color sampling to the plane contract.

A renderer package should be extracted only when at least one real non-Vue consumer exists and the shared boundary can be expressed without DOM ownership. Extraction evidence should include:

1. two maintained consumers with the same rendering algorithm;
2. a stable input/output contract for size, pixel ratio, fixed axis, color space, and generated resources;
3. a proved lifecycle model for cancellation and resource disposal;
4. tests that exercise the package without mounting the current app;
5. a measured maintenance or performance benefit greater than the added package and protocol cost.

WebGL, WebGPU, workers, and plugin protocols are not implied by this criterion. Each would require its own evidence and decision.
