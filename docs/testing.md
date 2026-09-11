# Testing

## Validation layers

The repository uses five complementary layers:

1. core unit tests for color conversion, gamut membership, projections, keyboard edits, contours, and generated-table contracts;
2. `packages/vue/test` for rendering invalidation, pointer arbitration, DPR, numeric completion and reactive parent feedback; `apps/web/test` for inspector/copy composition and presentation;
3. Playwright behavior and accessibility tests against the development server;
4. Playwright production tests against `apps/web/dist`, served with the checked-in Cloudflare Pages `_headers` rules;
5. isolated tarball consumption, strict typechecking, ESM import/SSR, production host build and package-owned browser tests.

Automated axe checks fail on serious or critical violations in default OKLCH, OKLab, and narrow OKLCH states. Explicit semantic tests remain responsible for heading order, landmarks, keyboard reachability, visible focus, boundary controls, copy semantics and announcements, text gamut status, enlarged text, and horizontal overflow.

## Component and embedding regressions

`test/instrumentHost.test.ts` mounts a reactive parent that feeds color updates back, including cloned objects. It covers rollback, external replacement, pointer ownership, pending final values, equal-valued fixed-axis view switches, view changes during a gesture, and teardown. Fixed-prop tests remain useful for geometry and emission details but are not cancellation proof.

`test/interactionHelpers.ts` provides the shared single-frame controller and pointer dispatcher. Renderer tests assert cache invalidation (including sub-millidegree fixed-axis changes), contour reuse, preview/full-quality transitions and disposal. DPR tests cover uncapped backing dimensions and runtime DPR changes.

The maintained host lives in `packages/vue/consumer`; `packages/vue/e2e` owns its embedding, renderer and accessibility cases. It imports only `@gamut-plane/vue` and `style.css`, with one color-only model and one controlled plane model. No demo CSS, source alias, shared tsconfig or generated-file import is available to it.

Run `pnpm test:package` from the root. This builds both packages, uses `pnpm pack`, inspects the real tar file lists and manifests, then copies the fixture into an OS temporary directory outside the workspace. It installs the two tarballs with a local core override (necessary while core is unpublished), plus declared consumer dependencies. It checks one physical Vue runtime, typechecks with library checking enabled, imports and server-renders both views without DOM globals, builds the consumer, and runs Chromium against that production build.

The browser cases cover independent colors/views/focus, two-way plane ownership, IDs/associations, numeric drafts and alpha preservation, cancellation, container widths from 280–800px, 623/624/625px threshold edges, first reveal, scrolling/resizing during capture, enlarged text, host style isolation (including colliding internal class names), rendered gamut guides and axe accessibility. Screenshots must show light-to-dark field variation in both instances, so a painted but invisible Canvas cannot pass solely through bitmap inspection. Renderer-only browser cases moved out of the app suite. The app retains page integration, inspector propagation, boundary checkbox wiring, clipboard, visual references, metadata and deployment coverage; its axe checks validate the composed page as well.

Successful temporary consumers are removed. Failures retain the consumer and Playwright traces/screenshots for diagnosis; the path is printed. To keep a successful host for inspection, run `pnpm --filter @gamut-plane/vue test:package --keep` after building the packages. Run focused Playwright selections from the retained consumer, using its installed tools and production output.

Browser success-copy tests explicitly grant clipboard permissions and read back the copied representation. Failure tests override/reject the operation; unit tests also cover a false legacy result. Successful button feedback alone is not clipboard proof.

Run app browser selections with `pnpm --filter @gamut-plane/web exec playwright test e2e/instrument.spec.ts`. The maintained full gate is listed in the README. Use `--last-failed` for the immediately preceding run when applicable; do not update unrelated visual references.

Browser automation and axe are not physical-device, screen-reader, or manual assistive-technology verification. Non-Chromium engines and unavailable platforms must be reported as unverified.

## Visual snapshot policy

Visual references are operating-system-specific. Playwright stores them as:

```text
apps/web/e2e/screenshots/<name>-win32.png
apps/web/e2e/screenshots/<name>-linux.png
```

Windows references are retained for reviewed local Chromium runs. Linux references are generated and reviewed from the `ubuntu-24.04` GitHub Actions environment. CI never updates references automatically.

Determinism is controlled by:

- exact `@playwright/test` and browser versions from the lockfile;
- one Chromium worker;
- fixed viewport per scenario;
- device scale factor `1`;
- `en-US` locale;
- dark color scheme;
- reduced motion;
- disabled screenshot animations;
- platform-specific system-font rasterization references;
- a `0.003` maximum differing-pixel ratio.

Platform-specific references absorb understood operating-system font and rasterization differences. The tolerance is not a substitute for reviewing field, contour, layout, control, and typography changes. A visual update must be generated on the affected platform, inspected, and committed intentionally.

## Release assets

Run:

```powershell
pnpm generate:release-assets
```

The dedicated Playwright capture:

- writes the reviewed 1440 × 1000 application screenshot to `docs/assets/gamut-plane-desktop.png`;
- builds the 1200 × 630 Open Graph image from the real rendered plane and boundary elements;
- verifies both gamut boundaries are present;
- verifies the social composition is not clipped;
- renders the SVG favicon at 16 and 32 pixels for local inspection.

The social composition uses only browser-provided generic fonts and project-owned visual elements. It has no browser chrome, private path, development overlay, remote asset, or third-party artwork.

## Production verification

After `pnpm build`, run:

```powershell
pnpm check:build
pnpm test:production
```

The artifact checker verifies required files, hashed JavaScript and CSS, social-image dimensions, cache/security headers, missing source maps, absence of source and test files, and absence of stale private product material. The production browser suite verifies metadata, static resources, response headers, both planes, both gamut boundaries, keyboard and pointer input, copy semantics, narrow layout, and 200% text.
