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
