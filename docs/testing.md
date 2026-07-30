# Testing

## Validation layers

The release candidate uses four complementary layers:

1. core unit tests for color conversion, gamut membership, projections, keyboard edits, contours, and generated-table contracts;
2. Vue component tests for rendering invalidation, pointer arbitration, device pixel ratio, copy presentation, and responsive component behavior;
3. Playwright behavior and accessibility tests against the development server;
4. Playwright production tests against `apps/web/dist`, served with the checked-in Cloudflare Pages `_headers` rules.

Automated axe checks fail on serious or critical violations in default OKLCH, OKLab, and narrow OKLCH states. Explicit semantic tests remain responsible for heading order, landmarks, keyboard reachability, visible focus, boundary controls, copy semantics and announcements, text gamut status, enlarged text, and horizontal overflow.

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
