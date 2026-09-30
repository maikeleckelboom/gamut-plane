# Testing

Use the pinned Node.js 24+ and pnpm 11.9.0. Install with `pnpm install --frozen-lockfile`. For browser suites, install the pinned Chromium with `pnpm --filter @gamut-plane/web exec playwright install chromium`; on Linux add `--with-deps`. Browser and packed suites start local servers on ports 4177–4182, so run them sequentially.

## Local workflow

During implementation, build affected packages and run the narrowest relevant test or typecheck. After the tree converges, build packages once, then use no-rebuild checks:

```powershell
pnpm format:check
pnpm lint
pnpm build:packages
pnpm typecheck:built
pnpm test:unit:built
pnpm --filter @gamut-plane/web build
pnpm check:build
pnpm test:e2e
pnpm test:production
pnpm test:package:built
pnpm test:react-vite:built
pnpm test:nuxt:built
pnpm test:next:built
```

`pnpm verify:prepush` runs formatting, lint, one package build, typechecking, unit/component tests, web build, and artifact inspection. It does not replace the browser, packed host, or SSR checks. Convenience commands without `:built` build packages first for an isolated run. CI builds packages once per job, then invokes built variants. It does not share build artifacts across jobs.

`pnpm --filter @gamut-plane/core typecheck:domain-nodom` and `test:packed-domain` protect the DOM-free core entry and packed declarations. `pnpm check:gamut-tables` verifies generated sampled data. The [release runbook](release.md) contains any extra release-specific requirements.

## Evidence owners

- Core tests own color conversions, exact gamut analysis, authored definition/serialization, editor geometry and operation typing.
- Render tests own scoped field/guide resolution, sampled forms, projection/cache identity, and failure distinctions. A test-only alternate OKLCH H/C editor proves a second geometry without adding a product editor.
- UI tests are the exhaustive owner of state/product policy and framework-neutral native range/numeric/plane controllers. They cover technical versus admitted editors, preferred selection, 0/1/multiple cardinality, independent Status/Boundary/Reference, exact-result display order, draft completion, invalid input, bounds, composition and cancellation.
- Vue and React component tests own semantic markup, ColorValue delivery, accepted/rejected state, reconciliation and framework-specific resources. Numeric adapters prove native completion delivery without remounting, authored/precision versus bound-only updates, microtask ordering and composing unmount; they do not repeat the controller's invalid-input, clamping or IME matrices. React retains focused Suspense and committed-render tests; Vue retains reactive-parent and SSR markup tests.
- The standalone web suite owns browser pointer/keyboard, focus, layout/overflow, accessibility, Canvas/environment, copy output, and the canonical compact-product visual references.
- Packed Vite consumers prove tarball imports, declarations, stylesheet bytes, isolated builds, and representative state/color interaction. React's direct-control sentinel proves installed coordinate authoring and dynamic sibling bounds; the standalone suite owns the exhaustive keyboard/numeric/pointer flow and edge sweep. React retains two parity images; Vue does not duplicate the visual matrix.
- Nuxt and Next own server markup, hydration reuse, route/build modes, Canvas capabilities and independent requests/instances. Each hydrated route exercises one menu action/reopen sentinel and edits both instruments; it does not repeat the same menu flow in both instances. Next root Strict Mode owns resource counts, cleanup, committed callbacks and native authority across replay/remount, including open-menu teardown.

Domain/science (A), product/state policy (B), interaction/lifecycle (C), adapter (D), accessibility (E), SSR/resources (F) and native-browser (G) assertions protect distinct risks at these owners. Visual sentinels (H) are sparse. DOM nesting, separator counts, class-only paused-state queries, fixed rail widths and popup padding are incidental (I); assert semantic descriptions, shared alignment and viewport containment instead. Identical policy or interaction permutations repeated in visual/packed/SSR layers are redundancy (J), unless that layer exposes a distinct rendering, native or framework failure.

The 2M.4 audit removed the adapter copies of generic numeric matrices, consolidated native completion/unmount checks, shortened packed React and repeated hydrated-instance menu flows, and removed redundant screenshots. The retained native second-click, nested-host, active-gesture and viewport-edge browser tests cannot be replaced by jsdom. Chorded primary release is covered by shared controller tests (right/middle held), delayed context-menu suppression by its controller, and one real Chromium mouse sequence. A gesture commits synchronously when primary is released while another button remains held; later secondary movement/capture loss cannot author, roll back or open a delayed menu.

A failing aggregate command is investigated at its failing selection. Use Playwright `--last-failed` for an immediately preceding browser run and `--repeat-each` when a suspected transient needs repeat evidence. Do not update screenshot references to conceal a behavioral or readiness failure. Focused passes after an aggregate failure are reported as such, not as an aggregate pass.

## Visual references

Canonical app screenshots are stored at `apps/web/e2e/screenshots/<name>-win32.png` and `<name>-linux.png` for the local Windows workflow and Ubuntu CI. The 25 app sentinels per platform cover:

- Compact editable, desktop OKLab and sRGB inspection, narrow/enlarged standalone composition and an outside Reference excursion.
- The 320px notation rail, open Coordinates and enlarged Coordinates.
- OKLab direct controls at 320px, authored overflow, unavailable scalar recovery, enlarged text and forced colors.
- Gamuts at 320/440px, longest exact-status copy, paused Boundary, read-only controls, enlarged text and forced colors.
- The plane context menu at 320px, read-only state, enlarged longest-status copy and forced colors.

React packed parity retains two images per platform for editable and inspection states. The complete set is 54 files across Windows/Linux. Layout behavior still runs at allocated 320/390/440/480px, and the menu's real viewport-edge shift remains a behavioral regression. Zero/narrow scalar slices, Reference/Status permutations, equivalent Hue endpoints and the test-only Area catalog have invariant coverage without extra pixel references. CI never updates screenshots automatically.

For local Linux browser/visual parity, use the pinned Playwright Noble image with `fonts-dejavu-core` installed; its default font inventory alone does not reproduce CI's monospace rendering. Review new open-menu references without regenerating existing closed-instrument or release/social assets.

Playwright uses pinned Chromium, DPR 1, dark color scheme, `en-US`, reduced motion, disabled screenshot animations, and a 0.003 maximum differing-pixel ratio. A changed reference requires a reviewed product change and inspection of layout, field, contours, controls, and typography on the affected platform. Do not relax the threshold to hide a failure.

## Packed consumers and production

Each packed runner builds tarballs, installs unpublished dependencies from those tarballs outside workspace resolution, verifies exports/declarations and installation contents, then builds or runs the host. `GAMUT_PLANE_EVIDENCE` retains browser/SSR evidence in CI. `--keep` retains a successful fixture for inspection. These checks do not prove registry installation.

`pnpm check:build` inspects the production app's file inventory, hashed assets, social image, and header policy. `pnpm test:production` serves `apps/web/dist` with the repository header rules and checks metadata, assets, generalized interaction, copy, and responsive behavior. Real Cloudflare routing/cache behavior remains a separate deployment check.

The [README screenshot](assets/gamut-plane-desktop.png), [social image](../apps/web/public/og/gamut-plane.png), and favicon are release assets. Generate them only when their actual presentation changes, inspect the result, and keep them separate from routine screenshot baseline updates. The 2M.4 exploratory Noble check found working pointer menus and Popover in Chromium, Firefox and WebKit. Playwright keyboard input emitted `contextmenu` only in Chromium; Firefox/WebKit emitted none on either the plane or an ordinary button, so their native keyboard invocation remains unverified. This is not a permanent cross-browser matrix. Physical devices and manual screen-reader use also require separate verification.
