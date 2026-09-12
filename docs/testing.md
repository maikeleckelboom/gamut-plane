# Testing

## Setup and commands

Use Node.js 24+ and pnpm 11.9.0. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @gamut-plane/web exec playwright install chromium
pnpm build:packages
```

On Linux, use `playwright install --with-deps chromium` to include browser system dependencies. Browser tests start their own servers on ports 4177–4181; keep those ports free and run the suites sequentially.

| Command                   | Coverage                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm format:check`       | Oxfmt formatting                                                                        |
| `pnpm lint`               | Oxlint checks across packages and app                                                   |
| `pnpm typecheck`          | Package declarations and TypeScript/Vue source                                          |
| `pnpm test`               | Core, Vue component, and app unit tests                                                 |
| `pnpm check:gamut-tables` | Deterministic regeneration against checked-in tables                                    |
| `pnpm build`              | Package artifacts and production app                                                    |
| `pnpm check:build`        | Production file inventory, metadata assets, and header rules                            |
| `pnpm test:e2e`           | App behavior, accessibility, and platform visual references                             |
| `pnpm test:production`    | Built app served with the repository's header rules                                     |
| `pnpm test:package`       | Isolated tarball installation, types, SSR, and browser embedding                        |
| `pnpm test:nuxt`          | Locked isolated tarballs, Nuxt development, production SSR and generated-page hydration |
| `pnpm test:next`          | Locked Next SSR/prerendered hydration and root React Strict Mode                        |
| `pnpm audit --prod`       | Advisories in the resolved production dependency graph                                  |

`typecheck`, `test`, and `test:package` build the packages first. Build the app before running production checks. The [release runbook](release.md#2-run-the-clean-checkout-gate) gives the complete clean-checkout sequence. CI runs static/unit validation followed by browser/accessibility/visual validation on Ubuntu 24.04; the production dependency audit is an additional local release check.

## Unit and component tests

Core tests cover color conversion, direct gamut membership, serialization/parsing, plane projections, keyboard edits, and boundary math. Vue tests cover generated-table accuracy, drawing invalidation, pointer arbitration, device pixel ratio, numeric drafts, and parent feedback. App tests cover inspector presentation and clipboard behavior.

`packages/vue/test/instrumentHost.test.ts` mounts a reactive parent that feeds updates back, including cloned color objects. It exercises rollback, external replacement, pointer ownership, final-value delivery, view changes during a gesture, and teardown. Fixed-prop tests cover geometry and emissions; reactive-parent tests cover cancellation under normal `v-model` feedback.

`packages/vue/test/interactionHelpers.ts` supplies frame control and pointer dispatch. Renderer tests cover cache invalidation, small fixed-axis changes, contour reuse, preview/full-quality transitions, disposal, uncapped backing dimensions, and runtime DPR changes.

## Browser and accessibility tests

The app suite covers page integration, inspector updates, boundary checkboxes, clipboard success and failure, and visual references. Successful copy cases grant clipboard permissions and read the value back; failure cases reject the write. Unit tests also cover a false result from the legacy clipboard fallback.

Axe checks fail on serious or critical violations in OKLCH, OKLab, and narrow OKLCH layouts. Semantic tests cover heading order, landmarks, keyboard reachability, visible focus, boundary controls, copy announcements, text gamut status, 200% text, and horizontal overflow.

Run a focused app selection with:

```powershell
pnpm --filter @gamut-plane/web exec playwright test e2e/instrument.spec.ts
```

Use `--last-failed` for failures from the immediately preceding run. Investigate the failing assertion, readiness condition, and trace before changing code or references. Use `--repeat-each` when checking whether a failure is transient.

Automation uses the lockfile-pinned Chromium version. Other engines, physical devices, screen readers, and manual assistive-technology use need separate checks.

## Packed Vue consumption

`packages/vue/consumer` is an independent Vue application fixture. It imports the component and stylesheet through public entries, without demo CSS, source aliases, shared tsconfig, or generated-file imports. One instance uses a color-only model; another also binds its plane.

`pnpm test:package` builds and packs core, rendering and Vue, checks tarball manifests and file lists, and copies the fixture into an OS temporary directory outside the workspace. It installs every unpublished dependency from its tarball using local overrides, then runs strict typechecking, Node ESM import and server rendering, a production host build, and Chromium tests from `packages/vue/e2e`.

The browser cases cover independent instance state and focus, plane ownership, IDs, numeric drafts, alpha preservation, cancellation, 280–800px containers, the 623/624/625px layout threshold, first reveal, scrolling/resizing during capture, enlarged text, style isolation, gamut guides, and axe accessibility. Screenshots check visible light-to-dark field variation in both instances, since Canvas bitmap pixels alone do not establish that the browser composited the field.

Successful consumers are removed. Failures retain the consumer and Playwright evidence at the printed path. To keep a successful consumer for inspection, run `pnpm --filter @gamut-plane/vue test:package --keep` after building the packages. Run focused browser tests from that directory using its installed tools and production output.

## Packed Nuxt SSR and hydration

`packages/vue/nuxt-consumer` is copied into an OS temporary directory outside the workspace. `pnpm test:nuxt` packs core, rendering and Vue, installs the fixture with `--frozen-lockfile`, runs Node import/server rendering and Nuxt/fixture typechecking, then runs browser tests against development, production and generated servers on port 4180. No source aliases, inherited app CSS, transpilation rules or SSR bypasses are used. All unpublished transitive dependencies come from tarballs; this does not verify registry installation.

The fixture pins Nuxt 4.5.2, Vue 3.5.42, Vue Router 5.3.1, TypeScript 6.0.3 and Playwright 1.61.1, tested on Node 24.16.0 / pnpm 11.9.0. Registry resolutions and integrity hashes are frozen. Only the local artifact entries omit integrity because the tested artifact changes with the worktree; packing and installing happens in the same isolated directory. To deliberately refresh the fixture graph, use `pnpm --filter @gamut-plane/vue test:nuxt --lock` and review its lockfile diff.

The browser holds script requests while allowing the server document and stylesheet to load. Before releasing scripts it records actual instrument nodes, IDs, input values, focus and square field geometry. After hydration it asserts those same nodes remain connected, IDs/values/focus/geometry match, associations resolve, and no lifecycle edits occurred. Both views then visibly paint and accept keyboard/pointer edits. Screenshot sampling checks composited field variation, not just a nonempty bitmap. Different requests exercise colors whose OKLab projection previously exposed last-bit CSS serialization mismatches.

Static HTML has build-time state: runtime query-dependent narrow/request cases run on both SSR servers; generated pages instead cover their build-time state and resizing after hydration. Canvas unavailable still leaves controls operable. No hydration warnings or browser errors are ignored.

Playwright owns server readiness and teardown, with no reuse of unrelated servers, no retries, 60-second test and 120-second startup limits. The runner bounds each command to ten minutes and terminates its process tree on timeout/interruption. Failures retain the temporary consumer. `--keep` also retains successful consumers. `GAMUT_PLANE_EVIDENCE` copies per-mode HTML reports, traces, server HTML, DOM-reuse records and screenshots into CI artifacts. Development and production reports use distinct directories.

Framework references: [Vue SSR](https://vuejs.org/guide/scaling-up/ssr), [Vue useId](https://vuejs.org/api/composition-api-helpers.html#useid), [Nuxt global CSS](https://nuxt.com/docs/4.x/getting-started/styling), and [Nuxt prerendering](https://nuxt.com/docs/4.x/getting-started/prerendering).

## Packed Next and root Strict Mode

`pnpm test:next` copies `packages/react/next-consumer` outside the workspace, packs core/rendering/React, verifies artifact file lists, export targets, CSS side-effect metadata, dependency/peer boundaries and preserved `"use client"` directives, then installs using the fixture's frozen lockfile. All three private packages are installed from their artifacts. The normal Node entry is server-rendered with no browser globals and no lifecycle emissions; independent documents deliberately may reuse IDs.

The consumer pins React / React DOM / their type packages 19.3.0, Next.js 16.3.4, TypeScript 6.0.3, Vite 8.1.4 (diagnostic fixture) and Playwright 1.61.1. Node 24.16.0 and pnpm 11.9.0 are the tested runtime/toolchain. The Next fixture uses the default Turbopack build. There are no aliases, transpilation exceptions, browser polyfills, hydration suppression or SSR-disabling wrappers.

The Next App Router's dynamic page is a Server Component which supplies serializable initial color to an ordinary Client Component using `useState`. The layout imports the package CSS. Development and production tests hold JavaScript while loading HTML/CSS, then verify node identity, IDs, focus, geometry, authored values, visible Canvas output and edits. `/prerendered` is statically generated by `next build`; the runner verifies its on-disk HTML and browser tests hydrate it. Additional cases cover independent requests/instances, nondefault alpha, authored out-of-gamut values, narrow hosts, hidden/revealed instruments, route remount, resize and Canvas fallback/unavailability.

The separate diagnostic entry calls `createRoot(...).render(<StrictMode>...)` at the root. Resource counters distinguish four observer creations / two disconnects during the initial two-instance replay, two live observers, twelve surface handlers, four window listeners and two resolution listeners. Unmount must reduce all live counts to zero. Tests cover cloned feedback and fresh callbacks, frame coalescing, synchronous final-value commits, an omitted completion callback, Escape rollback, capture loss, differing external replacement, queued-work disposal, resize during capture and uncapped DPR changes. The DPR test asserts an actual media event: changing only CDP's DPR getter without changing viewport geometry did not deliver that event in Chromium.

Both SSR runners share native process supervision and evidence cleanup in `scripts/packedConsumer.mts`. Next uses port 4181 for sequential development, production and diagnostic runs. Startup/test/command timeouts and per-mode retained reports follow the Nuxt gate. CI runs both gates in the dedicated SSR job and uploads evidence independently of app visual tests. Use `pnpm --filter @gamut-plane/react test:package --lock` only to deliberately refresh and review the Next fixture lockfile.

Framework references: [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Next client directive](https://nextjs.org/docs/app/api-reference/directives/use-client), [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot), and [root Strict Mode](https://react.dev/reference/react/StrictMode).

## Visual references

Snapshots live at `apps/web/e2e/screenshots/<name>-win32.png` and `<name>-linux.png`. Windows references cover local Chromium runs; Linux references cover Ubuntu 24.04 CI. CI does not update them automatically.

The suite uses one Chromium worker, fixed scenario viewports, DPR 1, `en-US`, dark color scheme, reduced motion, disabled screenshot animations, and a `0.003` maximum differing-pixel ratio. Separate references account for system-font rasterization differences.

Update a reference only for an understood visual change, on the affected platform. Inspect field rendering, contours, layout, controls, and typography before committing. Do not increase the tolerance to hide a failure.

## Release assets

The [README screenshot](assets/gamut-plane-desktop.png) is a 1440 × 1000 app capture. The [Open Graph image](../apps/web/public/og/gamut-plane.png) is a 1200 × 630 composition of the app's plane, boundaries, and identity. The [favicon](../apps/web/public/favicon.svg) is an SVG.

After a visual change that affects these assets, run `pnpm generate:release-assets`. This writes the README and social images, checks boundary presence and clipping, and renders the favicon at 16 and 32 pixels under `apps/web/test-results`. Inspect the output before committing; routine validation does not require regeneration.

## Production verification

`pnpm check:build` checks required files, hashed JavaScript and CSS, social-image dimensions, cache/security rules, and the absence of source maps, source/test output, local paths, and stale product material.

`pnpm test:production` checks metadata, resources, headers, both planes and boundaries, keyboard and pointer input, copy behavior, narrow layout, and 200% text against `apps/web/dist`. Its local server applies the repository's header rules but does not emulate all Cloudflare routing and caching behavior. Follow [Deployment](deployment.md#verify-the-deployed-site) to verify the real site.
