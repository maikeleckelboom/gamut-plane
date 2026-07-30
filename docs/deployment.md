# Cloudflare Pages deployment

This document describes the reviewed v0.1.0 deployment shape. It does not authorize or perform a deployment.

## Git integration settings

Connect the private GitHub repository to Cloudflare Pages from the repository root with these settings:

| Setting                                  | Value                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Root directory                           | Repository root; leave the advanced root path blank                          |
| Build command                            | `pnpm install --frozen-lockfile && pnpm build && pnpm check:build`           |
| Build output directory                   | `apps/web/dist`                                                              |
| Production branch after v0.1.0 promotion | `main`                                                                       |
| Node version                             | `NODE_VERSION=24`                                                            |
| pnpm version                             | `PNPM_VERSION=11.9.0`                                                        |
| Automatic dependency install             | `SKIP_DEPENDENCY_INSTALL=1`                                                  |
| Public site URL                          | `VITE_PUBLIC_SITE_URL=https://<verified-production-host>` in Production only |

`SKIP_DEPENDENCY_INSTALL=1` prevents Cloudflare's implicit install from duplicating the explicit frozen-lockfile installation in the build command. Cloudflare's build image does not derive the Node version from `package.json#engines`, so `NODE_VERSION` is required even though the workspace declares the same floor.

The first controlled release follows [Release](release.md): deploy the reviewed `dev` candidate as the temporary production branch, verify it, add the real demo URL, and then change the Pages production branch to `main` immediately before pushing the reviewed merge. Steady-state production builds only from `main`.

## Public URL metadata

`VITE_PUBLIC_SITE_URL` is optional at build time. Local and preview builds work without it and omit URL-dependent Open Graph fields.

For the production environment, set it to the exact HTTPS site root without credentials, a query string, or a fragment. The Vite build then adds:

- `og:url`;
- an absolute `og:image`;
- an absolute `twitter:image`.

The repository deliberately has no hardcoded canonical URL. Do not set `VITE_PUBLIC_SITE_URL` in preview deployments to the production URL, because a preview should not claim production URL ownership.

## Routing

The application has one static route and emits a top-level `index.html`. It has no client router and needs no `_redirects`, Pages Function, or SPA fallback. A request for an unknown path should remain a 404.

## Headers and caching

Vite copies `apps/web/public/_headers` to the build root. Cloudflare Pages parses it rather than serving it.

- `/` and `/index.html` use `Cache-Control: no-cache`.
- hashed `/assets/*` files use one-year immutable browser caching;
- all responses receive a restrictive CSP, permissions policy, referrer policy, MIME-sniffing protection, and frame-embedding protection.

The CSP permits only same-origin scripts, fonts, connections, and images plus `data:` images. `style-src 'unsafe-inline'` is required because Vue binds calculated inline style properties for active colors and marker geometry. No remote script, font, analytics, telemetry, or tracking origin is allowed.

## Local production build and preview

From the repository root:

```powershell
pnpm install --frozen-lockfile
$env:VITE_PUBLIC_SITE_URL = "https://gamut-plane.example"
pnpm build
pnpm check:build
pnpm test:production
Remove-Item Env:\VITE_PUBLIC_SITE_URL
```

`test:production` starts the built-output server at `http://127.0.0.1:4178`, applies the checked-in `_headers` rules, runs the production browser suite, and stops the server.

For interactive review:

```powershell
pnpm preview:production
```

Open `http://127.0.0.1:4178`, then stop the server with `Ctrl+C`. The fixed port must be free before starting.

The local server is a verification helper for this repository's static rules. Cloudflare Pages remains the authority for deployed behavior; recheck response headers and console output on the actual production URL.
