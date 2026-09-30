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
- UI tests own state validation, technical versus admitted editor policy, preferred selection, 0/1/2 cardinality, exact-result display order, copy, anatomy, and native range/numeric/plane controllers.
- Vue and React component tests own native markup, ColorValue delivery, accepted/rejected state, interaction lifecycle, and framework-specific resources. React has focused Suspense and committed-render tests; Vue has reactive-parent and SSR markup tests.
- The standalone web suite owns browser pointer/keyboard, focus, layout/overflow, accessibility, Canvas/environment, copy output, and the canonical compact-product visual references.
- Packed Vite consumers prove tarball imports, declarations, stylesheet bytes, isolated builds, and a representative instrument interaction. React retains two parity images; Vue does not duplicate the visual matrix. Nuxt and Next prove SSR/hydration, with Next root Strict Mode.

A failing aggregate command is investigated at its failing selection. Use Playwright `--last-failed` for an immediately preceding browser run and `--repeat-each` when a suspected transient needs repeat evidence. Do not update screenshot references to conceal a behavioral or readiness failure. Focused passes after an aggregate failure are reported as such, not as an aggregate pass.

## Visual references

Canonical app screenshots are stored at `apps/web/e2e/screenshots/<name>-win32.png` and `<name>-linux.png` for the local Windows workflow and Ubuntu CI. They cover the 440px editable instrument, OKLab, sRGB inspection, requested comparison, narrow editable layout, enlarged text, and the open Gamuts popup at 320–480px and in its Reference, Status off, within-tolerance, unavailable, paused-boundary, read-only, enlarged-text and forced-colors states. React packed parity images cover only editable and inspection states; the Vue packed host has no screenshot baseline. CI never updates screenshots automatically.

Playwright uses pinned Chromium, DPR 1, dark color scheme, `en-US`, reduced motion, disabled screenshot animations, and a 0.003 maximum differing-pixel ratio. A changed reference requires a reviewed product change and inspection of layout, field, contours, controls, and typography on the affected platform. Do not relax the threshold to hide a failure.

## Packed consumers and production

Each packed runner builds tarballs, installs unpublished dependencies from those tarballs outside workspace resolution, verifies exports/declarations and installation contents, then builds or runs the host. `GAMUT_PLANE_EVIDENCE` retains browser/SSR evidence in CI. `--keep` retains a successful fixture for inspection. These checks do not prove registry installation.

`pnpm check:build` inspects the production app's file inventory, hashed assets, social image, and header policy. `pnpm test:production` serves `apps/web/dist` with the repository header rules and checks metadata, assets, generalized interaction, copy, and responsive behavior. Real Cloudflare routing/cache behavior remains a separate deployment check.

The [README screenshot](assets/gamut-plane-desktop.png), [social image](../apps/web/public/og/gamut-plane.png), and favicon are release assets. Generate them only when their actual presentation changes, inspect the result, and keep them separate from routine screenshot baseline updates. Other browser engines, physical devices, and manual screen-reader use require separate verification.
