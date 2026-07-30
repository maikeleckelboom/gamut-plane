# v0.1.0 release procedure

This is the controlled first-release runbook. Do not execute it until the `dev` candidate is reviewed and its GitHub Actions workflow is green.

## Preconditions

- repository visibility is private;
- the current branch is `dev`;
- `dev` equals `origin/dev`;
- `main` equals `origin/main` at the filtered provenance baseline;
- the working tree is clean;
- no `v0.1.0` tag or GitHub release exists;
- no production deployment exists;
- a reviewer has approved the README screenshot, Open Graph image, favicon, accessibility result, and remaining release findings.

Record the exact candidate commit and the `main` baseline before continuing:

```powershell
git fetch --prune origin
git status --short --untracked-files=all
git rev-parse dev
git rev-parse origin/dev
git rev-parse main
git rev-parse origin/main
git tag --list v0.1.0
gh release view v0.1.0
gh repo view --json visibility,defaultBranchRef,homepageUrl
```

`gh release view` is expected to report that the release does not exist. Any other mismatch is a stop condition.

## Ordered release

### 1. Confirm `dev` CI

```powershell
gh run list --workflow CI --branch dev --limit 5
gh run watch <DEV_RUN_ID> --exit-status
```

The final candidate commit must have successful static/unit and browser/accessibility/visual jobs.

### 2. Repeat clean-clone validation

Clone to a new temporary directory, check out the recorded candidate commit, and run:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:gamut-tables
pnpm build
pnpm check:build
pnpm test:e2e
pnpm test:production
pnpm audit --prod
```

Stop all preview processes and remove the temporary clone after recording the results.

### 3. Review visual and accessibility evidence

Inspect:

- `docs/assets/gamut-plane-desktop.png`;
- `apps/web/public/og/gamut-plane.png`;
- `apps/web/public/favicon.svg` at 16 and 32 pixels;
- Windows and Linux Playwright references;
- the axe result in OKLCH, OKLab, and narrow modes;
- the 200% text and keyboard-only tests.

Do not proceed with an unexplained diff or serious/critical accessibility violation.

### 4. Create and verify the production deployment

Create the Git-integrated Cloudflare Pages project using [Deployment](deployment.md). For this first release only, select `dev` as the production branch so the production artifact can be verified before `main` changes. Set the exact production environment variables, including the resulting `VITE_PUBLIC_SITE_URL`.

Wait for the production deployment of the recorded candidate commit. Verify the HTTPS URL, commit association, response headers, favicon, Open Graph image, metadata, both planes, both gamut boundaries, pointer and keyboard input, copy semantics, narrow layout, 200% text, and console.

After the URL is verified, replace the pending live-demo text in `README.md` with the real link on `dev`, commit and push that documentation-only change, wait for `dev` CI and the updated production deployment, and repeat URL verification. This final `dev` commit becomes the promotion candidate.

### 5. Promote `dev` to `main` without rewriting history

Before pushing the merge, change the Cloudflare Pages production branch from `dev` to `main`. Then:

```powershell
git fetch --prune origin
git switch main
git pull --ff-only origin main
git merge --no-ff origin/dev -m "chore(release): promote v0.1.0"
git push origin main
```

Do not rebase, squash, amend, force-push, or move the filtered baseline. The merge commit must retain the original history.

### 6. Confirm `main` CI and production

```powershell
gh run list --workflow CI --branch main --limit 5
gh run watch <MAIN_RUN_ID> --exit-status
```

Confirm Cloudflare production rebuilt from the new `main` merge and still serves the verified application. Stop if GitHub Actions or Cloudflare differs from the reviewed candidate.

### 7. Create the annotated tag

With `main` at the successful promotion merge:

```powershell
git status --short --untracked-files=all
git tag -a v0.1.0 -m "Gamut Plane v0.1.0"
git push origin v0.1.0
```

Do not move or recreate the tag after publication.

### 8. Create the GitHub release

Prepare concise notes that describe the two working planes, exact membership versus sampled contours, Canvas 2D renderer, interaction/accessibility coverage, and Cloudflare deployment. Then:

```powershell
gh release create v0.1.0 --title "Gamut Plane v0.1.0" --notes-file <REVIEWED_NOTES_FILE> --verify-tag
```

Do not publish an npm package.

### 9. Change visibility and repository metadata

Only after the tag and release resolve correctly:

```powershell
gh repo edit maikeleckelboom/gamut-plane --visibility public --accept-visibility-change-consequences
gh repo edit maikeleckelboom/gamut-plane --homepage "https://<verified-production-host>"
gh repo view maikeleckelboom/gamut-plane --json visibility,defaultBranchRef,description,repositoryTopics,homepageUrl
```

Keep the default branch as `main`. Do not change branch protection, Issues, tags, or releases as part of the visibility operation.

### 10. Logged-out verification

In a private/logged-out browser session, verify:

- the repository is public;
- the README image and every documentation link resolve;
- the live-demo and repository-homepage links use the verified production URL;
- the `v0.1.0` tag and release are visible;
- source archives download;
- the production app and social image are reachable;
- no private URL, credential, local path, or excluded product material is exposed.

## Rollback guidance

### Deployment failure

Do not merge `dev` into `main`. Correct the candidate on `dev`, rerun the full suite and CI, and deploy again. If an earlier successful production deployment exists, use Cloudflare Pages' production rollback control; preview deployments are not rollback targets.

### Failed `main` CI

Do not tag, release, or change visibility. If the failure is transient, rerun it and record the evidence. If the merge is defective, fix it through a new reviewed commit or revert the merge with a new commit; never reset, rebase, or force-push `main`. Roll back Cloudflare production to the last successful production deployment if needed.

### Incorrect metadata

Before tagging, correct metadata on `dev`, repeat CI/deployment verification, and promote the corrected commit. After an immutable `v0.1.0` release, do not move the tag; publish a corrective follow-up release if the error cannot be fixed safely without changing released source.

### Accidental visibility

Immediately return the repository to private, record the exposure window, inspect access and clone events where available, and audit the tree again for secrets. Visibility rollback cannot retract clones already made. Do not resume publication until the cause and exposure are reviewed.
