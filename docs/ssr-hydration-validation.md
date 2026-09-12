# SSR and hydration validation

## Vue / Nuxt increment

Baseline fetched on 2026-09-12: clean `dev`, matching `origin/dev` at `1a1c34d011670cd817b5037baccd1504bfa769be`. `origin/main` was `6a24118`; `git ls-remote --tags origin` and `gh release list` returned no entries, and `gh release view v0.1.0` reported `release not found`. No release, tag, deployment, Cloudflare setting or integration branch was changed.

Branch: `feat/vue-ssr-hydration`. This increment has no React dependency or shared renderer extraction.

The actual hydration defect was last-bit Node/browser variation in OKLab projected CSS positions and connector angles. Presentation serialization now has fixed precision; authored values and exact gamut/rendering algorithms are unchanged. DPR/media tracking, resize observation and scroll registration are explicitly mounted; pre-mount draw scheduling is guarded.

Validated on Windows, Node 24.16.0 and pnpm 11.9.0. Package build: Vite 8.1.4, Vue 3.5.39, VueUse 14.3.0, TypeScript 6.0.3. Locked Nuxt consumer: Nuxt 4.5.2, Nitro 2.13.4, Vue 3.5.42, Vue Router 5.3.1, Vite 8.3.0. Browser: Playwright 1.61.1 Chromium.

| Command                                                              | Result                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                  | Passed                                                                                                     |
| `pnpm lint`                                                          | Passed                                                                                                     |
| `pnpm typecheck`                                                     | Passed                                                                                                     |
| `pnpm test`                                                          | Passed: core 48, Vue 74, web 14 tests                                                                      |
| `pnpm check:gamut-tables`                                            | Passed; no generated table changes                                                                         |
| `pnpm build`                                                         | Passed                                                                                                     |
| `pnpm check:build`                                                   | Passed                                                                                                     |
| `pnpm test:e2e`                                                      | Passed: 23, including unchanged Windows visual references                                                  |
| `pnpm test:production`                                               | Passed: 2                                                                                                  |
| `pnpm test:package`                                                  | Passed: tarball metadata, CSS side effects, Node SSR, types, production Vite consumer and 14 browser tests |
| `pnpm test:nuxt`                                                     | Passed: frozen external install, Node SSR, Nuxt types, development 7, production SSR 7, generated 5 tests  |
| `pnpm exec tsc -p tsconfig.tools.json` in the isolated Nuxt consumer | Passed: fixture server, SSR smoke, Playwright configuration and browser tests                              |
| `git diff --check`                                                   | Passed                                                                                                     |

The two generated-mode skips are deliberate: runtime query-dependent narrow initialization and differing HTTP request state belong to the live SSR servers. Both SSR modes run those cases. Generated HTML is tested at its build-time state, including `/prerendered`; its hydrated instances also resize, hide/reveal and navigate/remount.

Delayed-script tests preserve the actual server document while CSS loads, capture instrument node references, IDs, numeric values, focus and square field dimensions, then release application scripts. The corresponding client nodes are identical, associations resolve and authored values remain unchanged. Both views paint visible fields (composited screenshot variation > 100 RGB-sum units), accept keyboard/pointer edits and preserve alpha. Initial colors include chroma `0.52345678`, hue `612.123456`, alpha `0.37`, and independent-request values with hue `-28.25` / alpha `0.61`. Initialization and teardown produce no color edits, commits or cancellations. sRGB fallback and unavailable Canvas retain operable controls.

Failures encountered while developing the gate were investigated: pre-hydration screenshots blocked on font readiness while scripts were held; raw DOM/geometry capture avoids that unrelated readiness dependency. The initial generated fixture omitted the root static route; its explicit generate route inventory fixes the startup failure. A later complete `pnpm test:nuxt` passed all applicable modes. Nuxt/Nitro's Windows build emits upstream unused-import, PURE annotation and trailing-slash export deprecation warnings; these were not suppressed, and browser hydration diagnostics are asserted empty.

Local command logs and copied reports are under `test-results/`; CI's separate SSR job retains per-mode reports, server HTML, hydration-reuse JSON and rendered screenshots. Packages remain private and unpublished. Both core and Vue are installed from the just-built tarballs outside the workspace; registry installation was not tested. No server-side Canvas rasterization or no-JavaScript interaction is promised.

## React / Next increment

Branch: `feat/react-ssr-slice`, based on the validated Vue commit `f6850a1ac096165e66795a131b4ee4aff1af6e74`. The Vue-only branch was pushed separately and its [CI run passed](https://github.com/maikeleckelboom/gamut-plane/actions/runs/34659775776).

The private React package implements the controlled OKLCH slice through `value` / `onChange`, with optional completion, cancellation and capability callbacks. The existing Canvas algorithm, generated tables and presentation geometry helpers now live in the private `@gamut-plane/render` package. Core is unchanged; the moved table file differs only in its generator-command header, and its digest remains `sha256:4c73cef992515b5876e309f7bce90cd418217c7a576f54cfcead380eb416ce15`. Vue retains its controls, lifecycle, interaction policy and visual references.

The production JavaScript preserves `"use client"` in both React entry modules, leaves React / React DOM external, and exports CSS separately with CSS side-effect metadata. Resource creation occurs in committed lifecycle setup; every Strict Mode replay receives a fresh renderer. Completion publishes the actual final pointer value even when `onCommit` is absent. Equivalent cloned state and new callbacks retain gestures; external replacement, Escape, capture loss and unmount discard queued work with their respective cancellation semantics.

Tested on Windows with Node 24.16.0, pnpm 11.9.0, React / React DOM / their types 19.3.0, Next.js 16.3.4 (default Turbopack), TypeScript 6.0.3, Vite 8.1.4 for the diagnostic fixture, and Playwright 1.61.1 Chromium. Nuxt and Vue versions are unchanged from the first increment.

| Command                          | Result on the follow-on increment                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed                                                                                                                                                                                        |
| `pnpm format:check`              | Passed                                                                                                                                                                                        |
| `pnpm lint`                      | Passed                                                                                                                                                                                        |
| `pnpm typecheck`                 | Passed                                                                                                                                                                                        |
| `pnpm test`                      | Passed: core 48, render 7, Vue 67, web 14 (136 total)                                                                                                                                         |
| `pnpm check:gamut-tables`        | Passed                                                                                                                                                                                        |
| `pnpm build`                     | Passed                                                                                                                                                                                        |
| `pnpm check:build`               | Passed                                                                                                                                                                                        |
| `pnpm test:e2e`                  | Passed: 23; existing screenshots unchanged                                                                                                                                                    |
| `pnpm test:production`           | Passed: 2                                                                                                                                                                                     |
| `pnpm test:package`              | Passed: packed Vue metadata, Node SSR, types, production consumer and 14 browser tests                                                                                                        |
| `pnpm test:nuxt`                 | Passed: frozen external install, Node SSR, types, development 7, production 7, generated 5; the same two deliberate generated skips                                                           |
| `pnpm test:next`                 | Passed after the fixture version correction below: frozen external install, package metadata/directives, Node SSR, types, development 7, production build and hydration 7, root Strict Mode 9 |
| `git diff --check`               | Passed                                                                                                                                                                                        |

The Next server supplies serializable initial color to a normal client state component. Delayed-script tests capture the actual server document after its exported CSS loads, including both guide paths and the authored nondefault values. Hydration retains instrument, Canvas, SVG, path, marker and surface nodes; IDs, focus, square geometry and parent-owned values remain stable. Both fields then show visible screenshot variation above the existing 100 RGB-sum threshold and accept pointer/keyboard edits. The runner also checks the generated `/prerendered` HTML on disk before testing its production hydration. Narrow hosts, hidden/revealed instances, remounts, resizing, independent requests and Canvas sRGB/unavailable modes pass without browser errors, hydration diagnostics or lifecycle edits.

Root Strict Mode verifies setup/cleanup/setup through resource counts: two instances create four observers and disconnect two during replay, leaving two live observers, twelve surface handlers, four window listeners and two resolution listeners. Unmount reduces all live counts to zero. The nine cases also verify frame coalescing, final-value commits, omitted completion callbacks, cloned feedback, callback replacement, rollback/capture loss, external replacement, unmount, DPR and resize during capture.

Two validation issues were classified and resolved without weakening checks. A DPR-only CDP override changed `devicePixelRatio` without dispatching a media-query event; the corrected browser test changes viewport geometry too and asserts event delivery. A fresh install rejected Next 16.3.5 and its platform packages under pnpm's minimum release age policy. The fixture now pins the eligible [Next 16.3.4 release](https://github.com/vercel/next.js/releases/tag/v16.3.4), with a regenerated and reviewed lockfile; the fresh frozen install and complete Next gate then passed. The earlier command sequence passed all gates through Nuxt but failed at that install. Only fixture dependencies and documentation changed afterward, so those prior regression results remain applicable; the full Next gate was rerun against the final fixture.

Final local logs are `test-results/react-final-*.log` and `test-results/react-next-final.log`; copied reports and HTML/DOM/screenshot evidence are under `test-results/packed-final/{nuxt,next}`. CI runs both packed SSR gates and uploads their reports. All unpublished transitive dependencies (core, render and the selected adapter) come from local artifacts outside the workspace; this is not registry installation evidence.

The Vue SSR contract covers both existing views and controls. React intentionally covers only the controlled OKLCH surface; OKLab, full channel controls, uncontrolled state, expanded slots/theming and a standalone-app port remain outside this increment. Both adapters paint Canvas only on the client. Other browser engines and physical devices were not tested.
