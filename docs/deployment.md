# Cloudflare Workers deployment

Gamut Plane is a static Vite application deployed through **Workers Static Assets** and Git-connected **Workers Builds**. The root [`wrangler.jsonc`](../wrangler.jsonc) names the Worker `gamut-plane` and serves `apps/web/dist`. There is no Worker runtime entry or server-side code.

Wrangler is pinned in the root `package.json` and lockfile. The checked-in configuration avoids [automatic framework configuration](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/); no Cloudflare Vite plugin or adapter is needed.

## Build settings

Connect the public GitHub repository to the existing `gamut-plane` Worker, or create that Worker if it does not exist. In **Settings > Build**, configure:

| Setting                            | Value                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Git repository                     | `maikeleckelboom/gamut-plane`                                      |
| Root directory                     | Repository root                                                    |
| Production branch                  | `dev` initially, `main` immediately before promotion               |
| Build command                      | `pnpm install --frozen-lockfile && pnpm build && pnpm check:build` |
| Deploy command                     | `pnpm exec wrangler deploy`                                        |
| Builds for non-production branches | Disabled for the initial release flow                              |

The Worker's name must match `gamut-plane` in Wrangler. The asset directory is defined in `wrangler.jsonc`; no separate dashboard build-output setting is needed. `pnpm exec` selects the repository-pinned Wrangler binary. Do not shorten the command to `pnpm deploy`, which is pnpm's workspace-package deployment command.

Under **Settings > Build > Build Variables and Secrets**, set:

| Build variable            | Value                                             |
| ------------------------- | ------------------------------------------------- |
| `NODE_VERSION`            | `24`                                              |
| `PNPM_VERSION`            | `11.9.0`                                          |
| `SKIP_DEPENDENCY_INSTALL` | `1`                                               |
| `VITE_PUBLIC_SITE_URL`    | `https://gamut-plane.eckelboommaikel.workers.dev` |

The [Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) supports all three tool/install variables. The build command owns the frozen-lockfile install. These are build variables, not Worker runtime bindings.

Keep automatic production builds enabled. Change the production branch under **Settings > Build > Branch control**; the GitHub default branch stays `main`. Saved [build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) apply to the next build or a retried build. Confirm the new build targets the intended `dev` commit; do not retry an older `main` commit. Follow the [release runbook](release.md) before switching production to `main`.

## Site URL and metadata

The production endpoint is [gamut-plane.eckelboommaikel.workers.dev](https://gamut-plane.eckelboommaikel.workers.dev). Local builds work without `VITE_PUBLIC_SITE_URL` and omit URL-dependent Open Graph fields.

Set `VITE_PUBLIC_SITE_URL` in the production Worker's build variables to that HTTPS site root without credentials, a query string, or a fragment. The next build adds `og:url`, an absolute `og:image`, and an absolute `twitter:image`.

Verify those values on the deployed page before adding the URL to the README or GitHub homepage. Keep this value out of local or preview builds. If non-production builds are enabled later, ensure their build configuration leaves it unset.

## Routing, headers, and caching

The app has one page and no client router. Wrangler leaves [asset routing](https://developers.cloudflare.com/workers/static-assets/routing/) at its defaults: `html_handling: "auto-trailing-slash"` and `not_found_handling: "none"`. `/` serves `index.html`, `/index.html` redirects to `/`, and unmatched paths return 404. There is no SPA fallback, `_redirects` file, or custom `404.html`.

Vite copies `apps/web/public/_headers` unchanged to the build root. Workers Static Assets [parses this file](https://developers.cloudflare.com/workers/static-assets/headers/) as configuration and does not serve it as an asset:

- The served HTML at `/` uses `Cache-Control: no-cache`. The `/index.html` rule remains present, but that URL normally redirects to `/`.
- Hashed `/assets/*` files use `Cache-Control: public, max-age=31556952, immutable` for browser caching.
- The global rule sets CSP, `Permissions-Policy`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.

All existing rules are supported for static asset responses. The CSP allows same-origin resources and `data:` images. Inline styles are allowed because Vue binds colors and marker geometry through style attributes. No remote scripts, fonts, or analytics are configured.

Custom headers override the default static response headers. They do not apply to Worker-generated responses or override explicit `_redirects` rules. Header matching is path-based, so the `/assets/*` cache rule also applies to missing asset URLs. The cache rules control browser caching; Cloudflare manages its edge asset cache. Cloudflare documents that `CF-Cache-Status` can be inaccurate, so it is not conclusive cache evidence.

## Local production checks

From the repository root, after installing dependencies and Chromium as described in [Testing](testing.md):

```powershell
pnpm build
pnpm check:build
pnpm exec wrangler deploy --dry-run
pnpm test:production
```

The Wrangler dry run validates deployment configuration without uploading or publishing. For local Workers routing and header checks, run `pnpm exec wrangler dev --local --port 8787`, inspect the printed localhost URL, and stop it with `Ctrl+C`. Wrangler's local state is ignored under `.wrangler/`.

`test:production` starts the built-output server at `http://127.0.0.1:4178`, applies the checked-in header rules, runs the browser suite, and stops the server. This helper does not emulate every Workers routing or cache detail. For interactive review, run `pnpm preview:production` and stop it with `Ctrl+C`. Keep the port free before either command.

To exercise absolute URL metadata locally, set `VITE_PUBLIC_SITE_URL` to `https://gamut-plane.example` before building. That reserved example hostname is a test input, not a deployment URL. Remove the variable afterward with `Remove-Item Env:\VITE_PUBLIC_SITE_URL`.

## Verify the deployed site

Confirm the Workers build and production deployment match the release candidate commit. Check HTTPS, page metadata, the favicon and social image, security and cache headers for HTML and hashed assets, the `/index.html` redirect, and 404 responses for unmatched paths and `/_headers`. Exercise both planes, both boundary targets, independent guide visibility, pointer and keyboard edits, clipboard success and failure, wide viewport fit, narrow layout, and 200% text. Inspect the console for errors and blocked resources.

Record the URL, commit, build/deployment identifiers, and results. Repeat these checks after the README URL update and after promotion to `main`.
