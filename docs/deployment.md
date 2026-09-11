# Cloudflare Pages deployment

Gamut Plane builds to static files in `apps/web/dist`. Use a Git-integrated Cloudflare Pages project connected to the public GitHub repository.

## Build settings

| Setting                      | Value                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Root directory               | Repository root; leave the root path blank                                   |
| Build command                | `pnpm install --frozen-lockfile && pnpm build && pnpm check:build`           |
| Build output directory       | `apps/web/dist`                                                              |
| Production branch            | `dev` for the first candidate, then `main` before promotion                  |
| Node version                 | `NODE_VERSION=24`                                                            |
| pnpm version                 | `PNPM_VERSION=11.9.0`                                                        |
| Automatic dependency install | `SKIP_DEPENDENCY_INSTALL=1`                                                  |
| Public site URL              | `VITE_PUBLIC_SITE_URL` set to the actual HTTPS site root, in Production only |

Set the tool versions and install setting for both Production and Preview environments. The build command owns the frozen-lockfile install. Cloudflare's build image does not infer the Node version from `package.json#engines`; see its [build-image configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

Check for an existing Pages project before creating one. The [release runbook](release.md) covers candidate verification and promotion. In Pages settings, change the [production branch](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) to `main` immediately before pushing the promotion merge. Keep automatic production deployments enabled.

## Site URL and metadata

Local and preview builds work without `VITE_PUBLIC_SITE_URL` and omit URL-dependent Open Graph fields. Leave it unset in Preview.

Once Cloudflare assigns the production hostname, set the Production value to its HTTPS site root without credentials, a query string, or a fragment. Rebuild if the initial deployment ran without it. The build adds `og:url`, an absolute `og:image`, and an absolute `twitter:image`.

Verify those values on the deployed page before adding the URL to the README or GitHub homepage. A configured environment variable alone is not deployment verification.

## Routing, headers, and caching

The app has one page and no client router. There is no `_redirects` file, Pages Function, or top-level `404.html`. Cloudflare therefore applies its [default single-page-app fallback](https://developers.cloudflare.com/pages/configuration/serving-pages/) to unmatched paths. The local production helper returns 404 for missing files instead; it does not emulate that Pages fallback.

Vite copies `apps/web/public/_headers` to the build root. Pages reads it as configuration:

- `/` and `/index.html` request revalidation with `Cache-Control: no-cache`.
- Hashed `/assets/*` files use one-year immutable browser caching.
- The global rule sets CSP, permissions policy, referrer policy, MIME-sniffing protection, and frame-embedding protection.

The CSP allows same-origin resources and `data:` images. Inline styles are allowed because Vue binds colors and marker geometry through style attributes. No remote scripts, fonts, or analytics are configured.

## Local production checks

From the repository root, after installing dependencies and Chromium as described in [Testing](testing.md):

```powershell
pnpm build
pnpm check:build
pnpm test:production
```

To also exercise absolute URL metadata locally, set `VITE_PUBLIC_SITE_URL` to `https://gamut-plane.example` before building. That reserved example hostname is a test input, not a deployment URL. Remove the variable afterward with `Remove-Item Env:\VITE_PUBLIC_SITE_URL`.

`test:production` starts the built-output server at `http://127.0.0.1:4178`, applies the checked-in header rules, runs the browser suite, and stops the server. For interactive review, run `pnpm preview:production` and stop it with `Ctrl+C`. Keep the port free before either command.

## Verify the deployed site

Confirm the Cloudflare deployment's commit matches the release candidate. Check HTTPS, page metadata, the favicon and social image, response headers for HTML and hashed assets, and actual unmatched-path behavior. Exercise both planes, boundary visibility, pointer and keyboard edits, clipboard success and failure, narrow layout, and 200% text. Inspect the console for errors and blocked resources.

Record the URL, commit, deployment identifier, and results. Repeat these checks after the README URL update and after promotion to `main`.
