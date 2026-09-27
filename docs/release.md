# Release runbook

Use this procedure for an approved repository/application release. Record the intended tag from the release decision and its release-note document under `docs/releases/`; read the five private package versions from their current manifests. Replace angle-bracket placeholders below with those recorded values and paths before running commands. The Git tag and GitHub release identify the public application version. The private package versions identify local tarball artifacts and do not authorize npm publication. The [v0.3.0 release and migration notes](releases/v0.3.0.md) are a previous-release example, with the four-package topology that existed at that release.

## 1. Fix the exact dev candidate

Start with a clean `dev` checkout. Fetch and record the candidate, baseline, intended tag, package versions, and exact CI run:

```powershell
git fetch --prune origin
git status --short --branch --untracked-files=all
$candidateSha = git rev-parse dev
git rev-parse origin/dev
$mainBaseline = git rev-parse origin/main
git merge-base --is-ancestor origin/main $candidateSha
Get-Content packages/core/package.json, packages/render/package.json, packages/ui/package.json, packages/vue/package.json, packages/react/package.json | Select-String '"name"|"version"|"private"'
gh run list --workflow CI --branch dev --limit 10
```

Require `dev = origin/dev`, `main` ancestry, and all three required CI jobs on `$candidateSha`: **Static and unit validation**, **Browser, accessibility, and visual validation**, and **Packed SSR and hydration**. Confirm the intended tag/release does not already exist. If the candidate moves, start again with its new identity.

## 2. Certify a clean checkout

Clone outside the working repository, detach at `$candidateSha`, and do not copy `node_modules`, build output, `.next`, `.nuxt`, generated consumers, or local environment files. A shared pnpm store is acceptable. Record tool versions, platform, relevant build environment, and each exit status. On Linux, install Chromium with `playwright install --with-deps chromium`.

```powershell
git clone --branch dev https://github.com/maikeleckelboom/gamut-plane.git <CLEAN_DIRECTORY>
cd <CLEAN_DIRECTORY>
git checkout --detach <CANDIDATE_SHA>
node --version
pnpm --version
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm --filter @gamut-plane/web exec playwright install chromium
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @gamut-plane/core typecheck:domain-nodom
pnpm test
pnpm check:gamut-tables
pnpm build
pnpm --filter @gamut-plane/core test:packed-domain
pnpm check:build
pnpm exec wrangler deploy --dry-run
pnpm test:e2e
pnpm test:production
pnpm test:package
pnpm test:nuxt
pnpm test:react-vite
pnpm test:next
pnpm audit --prod
git diff --check
git status --short --untracked-files=all
```

The checkout must finish clean. Inspect and classify any failure; do not waive a gate. The package checks pack and inspect core/render/UI/Vue/React, assert exact internal versions and exports, and compare installed private-package files byte for byte with the tarballs. Inspect archive inventories and hashes. Investigate audit findings against the shipped bundle and runtime dependency graph. Preserve failure logs and traces until resolved.

## 3. Review visuals and deployed candidate

Inspect the [desktop screenshot](assets/gamut-plane-desktop.png), [social image](../apps/web/public/og/gamut-plane.png), favicon at 16/32 pixels, and [platform visual references](../apps/web/e2e/screenshots). Review axe results in both views and narrow layout, keyboard behavior, and 200% text. Regenerate only assets affected by an understood visual change and inspect every resulting diff.

Follow [Deployment](deployment.md) to deploy the exact `dev` candidate through Workers Builds as the temporary production branch. Verify the deployed commit and HTTPS URL, response headers, metadata, favicon/social image, both planes and guides, pointer and keyboard editing, copy behavior, narrow layout, 200% text, and browser console. Local production tests do not prove Cloudflare behavior. Record the candidate deployment evidence and repeat exact-`dev` CI/deployment verification after any candidate change.

## 4. Promote the verified tree

Fetch again and prove `origin/dev` still equals `$candidateSha` and `origin/main` still equals `$mainBaseline`. Immediately before promotion, change the Worker's production branch from `dev` back to `main` in **Settings > Build > Branch control**; leave automatic production builds enabled. Keep the GitHub default branch as `main`.

```powershell
git switch main
git pull --ff-only origin main
git merge --no-ff origin/dev -m "chore(release): promote <TAG>"
git diff --exit-code <CANDIDATE_SHA> HEAD
git push origin main
$mainSha = git rev-parse HEAD
```

The promoted Git tree must equal the certified candidate tree. Wait for all required CI jobs on exactly `$mainSha`, then confirm Cloudflare deployed that commit from `main` and repeat the production checks. Verify public README links and license detection. Do not tag while either proof is incomplete.

## 5. Pack final private assets, tag, and release

From the verified promoted `main` tree, build and pack the five private packages into a clean output directory outside tracked source. Use `pnpm pack --json` output for each actual filename, inspect each manifest/inventory/internal dependency graph, and hash the final tarball bytes. Record filename, byte size, and SHA-256 for core, render, UI, Vue, and React in `SHA256SUMS`. Candidate tarball hashes from `dev` are review evidence; these promoted-`main` files are the immutable release assets.

```powershell
$artifactDirectory = '<ARTIFACT_DIRECTORY>'
pnpm build:packages
pnpm --filter @gamut-plane/core pack --pack-destination $artifactDirectory --json
pnpm --filter @gamut-plane/render pack --pack-destination $artifactDirectory --json
pnpm --filter @gamut-plane/ui pack --pack-destination $artifactDirectory --json
pnpm --filter @gamut-plane/vue pack --pack-destination $artifactDirectory --json
pnpm --filter @gamut-plane/react pack --pack-destination $artifactDirectory --json
Get-ChildItem -LiteralPath $artifactDirectory -Filter *.tgz | Sort-Object Name | ForEach-Object {
  $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $($_.Name)"
} | Set-Content -LiteralPath (Join-Path $artifactDirectory 'SHA256SUMS')
git status --short --branch --untracked-files=all
git tag -a <TAG> -m "Gamut Plane <TAG>"
git push origin <TAG>
gh release create <TAG> --title "Gamut Plane <TAG>" --notes-file <RELEASE_NOTES_FILE> --verify-tag
gh release upload <TAG> <CORE_TGZ> <RENDER_TGZ> <UI_TGZ> <VUE_TGZ> <REACT_TGZ> <SHA256SUMS>
```

The previous v0.3.0 release has four historical package tarballs: `gamut-plane-core-0.2.0.tgz`, `gamut-plane-render-0.2.0.tgz`, `gamut-plane-vue-0.2.0.tgz`, and `gamut-plane-react-0.2.0.tgz`, plus `SHA256SUMS`. Future releases following this runbook upload all five package tarballs and `SHA256SUMS`: six assets before optional files. Every package remains `private: true` and unpublished to npm. In a logged-out browser, verify the tag, release notes, all required assets, source archives, production app, and social image.

## Recovery

- Fix a failed candidate on `dev`, repeat affected verification and exact-SHA CI/deployment proof, and use the new candidate identity.
- If `main` CI or production fails, do not tag. Diagnose and correct with a new commit or a revert commit; use a previous successful Cloudflare production deployment if rollback is needed.
- Never reset or force-push a shared branch, and never move a released tag. Correct post-release metadata or source through a follow-up release.
