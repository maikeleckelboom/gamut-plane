# v0.1.0 release runbook

This release covers the standalone application. The repository is already public. Both npm packages remain private and unpublished.

The sequence is: validate `dev`, deploy it as the temporary production candidate, record the verified URL, rerun `dev` CI, point Cloudflare production at `main`, merge, verify `main`, then tag and release.

## 1. Record the candidate

Start on a clean `dev` checkout and fetch the remote state:

```powershell
git fetch --prune origin
git status --short --branch --untracked-files=all
git rev-parse dev
git rev-parse origin/dev
git rev-parse origin/main
git rev-list --left-right --count origin/main...origin/dev
git ls-remote --tags origin refs/tags/v0.1.0
gh release list --repo maikeleckelboom/gamut-plane
gh repo view --json visibility,defaultBranchRef,description,repositoryTopics,homepageUrl,licenseInfo
```

`dev` must equal `origin/dev`, and `origin/main` must be its ancestor: the first count from `rev-list` must be zero. Record both commit IDs. Stop if either branch moves unexpectedly or a `v0.1.0` tag or release already exists.

Confirm both CI jobs succeeded for that exact `dev` commit:

```powershell
gh run list --workflow CI --branch dev --limit 5
gh run watch <DEV_RUN_ID> --exit-status
```

Replace angle-bracket values in this runbook with the recorded IDs or paths before running commands.

### Public repository checks

The default branch is `main`. Before the first promotion, it lacks the README and MIT license present on `dev`, so the public landing page does not yet describe this candidate and GitHub reports no detected license. Keep `main` as the default branch; check its README and license detection after promotion.

Review the candidate's tracked files and release assets for credentials, private URLs, local paths, temporary output, and unrelated product material. The source is already public, so this check is not a future visibility gate. Retain the [provenance record](provenance.md).

No verified production URL is recorded yet. Check Cloudflare for an existing project before creating one; an empty README or homepage does not prove that no deployment exists.

## 2. Run the clean-checkout gate

Use a fresh clone with no copied `node_modules`, build output, or environment files. Check out the recorded candidate commit. Use Node.js 24 and the repository-pinned pnpm 11.9.0; check both versions before installing. A shared package-download cache is fine.

```powershell
git clone --branch dev https://github.com/maikeleckelboom/gamut-plane.git <CLEAN_DIRECTORY>
cd <CLEAN_DIRECTORY>
git checkout --detach <CANDIDATE_COMMIT>
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @gamut-plane/web exec playwright install chromium
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:gamut-tables
pnpm build
pnpm check:build
pnpm exec wrangler deploy --dry-run
pnpm test:e2e
pnpm test:production
pnpm test:package
pnpm audit --prod
git diff --check
git status --short --untracked-files=all
```

On Linux, use `playwright install --with-deps chromium` to install browser system dependencies as CI does. See [Testing](testing.md) for test selection, snapshot policy, and retained failure evidence.

Check every command's exit status. Record the candidate commit, tool versions, platform, environment variables affecting the build, and results. Investigate audit findings against the shipped bundle and package runtime graph before changing dependencies. Stop on unresolved failures. Keep failure logs and traces; remove the temporary checkout only after recording the results and stopping its servers.

## 3. Review visual and accessibility evidence

Inspect the [README screenshot](assets/gamut-plane-desktop.png), [Open Graph image](../apps/web/public/og/gamut-plane.png), [favicon](../apps/web/public/favicon.svg) at 16 and 32 pixels, and [Windows and Linux references](../apps/web/e2e/screenshots).

Check the axe results in OKLCH, OKLab, and narrow layouts, along with keyboard and 200% text tests. Resolve unexplained visual differences or serious/critical accessibility findings. Regenerate assets only for a corresponding visual change, and inspect the result.

## 4. Deploy and verify `dev`

Follow [Deployment](deployment.md) to connect the public repository to the `gamut-plane` Worker through Workers Builds. Select `dev` as the temporary production branch. Set the build command to `pnpm install --frozen-lockfile && pnpm build && pnpm check:build` and the deploy command to `pnpm exec wrangler deploy`. Configure the documented build variables and leave `VITE_PUBLIC_SITE_URL` unset for the initial deployment.

Deploy the exact recorded `dev` candidate and verify that Cloudflare serves the assigned HTTPS hostname successfully. Then set `VITE_PUBLIC_SITE_URL` to that verified site root in **Settings > Build > Build Variables and Secrets**. Rebuild and redeploy the same candidate, and verify `og:url`, `og:image`, and `twitter:image` before recording the URL publicly.

Verify the deployed commit, HTTPS URL, response headers, metadata, favicon, social image, both planes and boundaries, pointer and keyboard input, copy behavior, narrow layout, 200% text, and browser console. Use the deployed site for these checks; local production tests do not establish Cloudflare behavior.

After verification, replace the README's production-demo status with the real link on `dev`. Set the repository homepage to the same URL:

```powershell
gh repo edit maikeleckelboom/gamut-plane --homepage <VERIFIED_PRODUCTION_URL>
```

Commit and push the README change. Wait for both `dev` CI jobs and its updated Cloudflare production deployment, then repeat URL and commit verification. Record this final `dev` commit as the promotion candidate. Source, dependency, configuration, or asset changes require the affected validation to be repeated before promotion.

## 5. Promote to `main`

Fetch again and confirm that `origin/dev` is still the promotion candidate and `origin/main` is still the recorded baseline. In the Worker's **Settings > Build > Branch control**, change the production branch from `dev` to `main` immediately before promotion. Save the setting and leave automatic production builds enabled. Keep the GitHub default branch as `main`. Then merge without rewriting history:

```powershell
git switch main
git pull --ff-only origin main
git merge --no-ff origin/dev -m "chore(release): promote v0.1.0"
git diff --exit-code origin/dev HEAD
git push origin main
```

The merge tree must match the promotion candidate. Stop before pushing if the comparison differs. Do not rebase, squash, amend, or force-push.

## 6. Verify `main` CI and production

```powershell
gh run list --workflow CI --branch main --limit 5
gh run watch <MAIN_RUN_ID> --exit-status
gh repo view --json visibility,defaultBranchRef,description,repositoryTopics,homepageUrl,licenseInfo
```

Both jobs must succeed for the new merge commit. Confirm Cloudflare deployed that commit from `main`, and repeat the production checks from step 4. Verify the public README, its image and documentation links, the homepage, and MIT license detection. Resolve any mismatch before tagging.

## 7. Tag and release

With a clean `main` checkout at the successful promotion merge:

```powershell
git status --short --branch --untracked-files=all
git tag -a v0.1.0 -m "Gamut Plane v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --title "Gamut Plane v0.1.0" --notes-file <RELEASE_NOTES_FILE> --verify-tag
```

Prepare release notes describing the two planes, exact membership and sampled guides, Canvas rendering limits, and the production URL. State that the npm packages remain unpublished. Do not move or recreate the tag after publication.

In a logged-out browser session, check that the tag, release, source archives, production app, and social image are reachable. Repository visibility stays public throughout this procedure.

## Package publication

`@gamut-plane/core` and `@gamut-plane/vue` stay at `0.1.0` with `private: true`. Their built artifacts and tarball-consumer tests support local use. This application release does not include npm publication.

A future package release needs a separate decision covering scope/name access, registry metadata, removal of the private guards, core publication before Vue, and a registry-installed consumer check.

## Recovery

- **Candidate deployment fails:** keep work on `dev`, fix the cause, repeat affected checks and CI, and redeploy. Do not promote a failed candidate.
- **`main` CI or production fails:** do not tag or release. Investigate transient failures before rerunning them. Correct a defect with a new commit or revert the merge with a new commit. If needed, roll Cloudflare back to a previous successful production deployment; preview deployments are not rollback targets.
- **Metadata is wrong:** correct it and repeat CI and deployment verification before tagging. After release, do not move the tag to change released source; use a follow-up release.

Never reset or force-push a shared branch as a release recovery step.
