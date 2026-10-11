# Phase 3C.2B-P: marker contrast and endpoint continuity

Starting baseline: `dev` and fetched `origin/dev` at `ba3ed7729d16386daa8179620823a81440e10429`. Node 24.16.0 and repository-pinned pnpm 11.9.0. The pre-existing untracked `docs/evidence/phase-3c2b.zip` is preserved.

## Reproduction and diagnosis

The running `/spatial` application reproduced both original problems before source edits. [Baseline measurements](evidence/phase-3c2b-polish/baseline.json) accompany [the marker](evidence/phase-3c2b-polish/before-marker-oblique.png), [near zero](evidence/phase-3c2b-polish/before-near-zero.png), and [exact zero](evidence/phase-3c2b-polish/before-zero.png).

- The marker shader used a screen-facing quad at constant center depth. On a tilted cap, the cap's depth crossed the disc despite its existing depth bias and late draw order. In the default oblique view, only 9 of 16 perimeter samples were dark; the rest included cap pixels and the hollow occluded style. The 2 CSS px ring also gave limited coverage at DPR 1. This was a depth and coverage problem, not incorrect colors or coordinates.
- Clipping required `focusedRegion()`. The solver correctly changed from `region` to `point` at exact zero and one, but presentation then set `cutSide` to zero. The uncut body suddenly appeared. This was the complete gamut body, not a changed selected preview or a reauthored color.
- Near zero, the cap's existing `1e-6` GPU RGB discard slack, applied over a whole-plane quad, permitted a visible patch beyond the microscopic scientific section. At L = 0.000001 and 0.0001, a section-aligned 1366 × 1000 browser capture contained 168 flat-fill pixels. After bounding rasterization by the solver's sampled section extent, those fixtures contained zero flat-fill pixels at the same scale. Their scientific kind remains `region`.

The user subsequently supplied a near-contour marker example and a missing-backface Hue example. The latter reproduced at selected OKLCH(0.7092, 0.1885, 212.2°), inspected H 312.4°, in Color mode with comparison off: [before](evidence/phase-3c2b-polish/before-backface.png). Front-face culling exposed a hole in the kept shell on the negative radial side of the Hue plane. This was not a missing positive-radial Hue sector.

## Presentation changes

The selected marker retains its 13 CSS px outer diameter. The light core radius is 4 CSS px and the dark perimeter is 2.5 CSS px. There is no extra outer keyline. When its true center lies on a drawn section, its depth follows that supporting plane across the disc. Its projected center and authored coordinates remain unchanged, including the supplied near-contour case and any visible displacement below an independently inspected section. Otherwise it retains center depth. The front pass remains `LessEqualDepth`; the hollow occluded pass remains `GreaterDepth`. The occluded style keeps an empty center and a dim light annulus, now with a dark casing within the same 13 CSS px outer diameter for contrast on bright surfaces. Neither writes depth or renders permanently on top.

[After marker](evidence/phase-3c2b-polish/after-marker-oblique.png) and [matched measurements](evidence/phase-3c2b-polish/after.json) show 16 of 16 dark perimeter samples at the original default pose. Actual-size framebuffer fixtures also cover white, nearly white, dark, black, red, and blue backgrounds at DPR 1 and 2.

Clipping eligibility now accepts a ready nonempty section independently of cap drawability. Region sections receive their existing sampled GPU fill. Exact point sections receive no area fill, retain the explicitly chosen cut side, and use a small gray point glyph at the solver's neutral point. This glyph uses the existing round-capped line renderer, and is visually distinct from the selected marker. The removed volume remains a secondary outline. The selected marker can be chromatic and off-gamut at the same L: OKLab(0, 0.0033, 0.0458) is still analyzed as outside both gamuts, and is never collapsed to black.

Empty results have no point or fill. Pending and unavailable results remove current section geometry rather than retaining stale success. Cut intent persists internally through those states. Explicitly disabling Cut away still permits the uncut whole volume. At L = 1, an upper cut can legitimately retain the lower whole body, just as it does immediately below one; the lower cut shrinks toward white. The converse holds at zero. Neither endpoint silently changes which side was chosen. Section changes do not move the user-owned camera.

The scene's opaque boundary materials now draw both faces of the kept shell. Backface colors come from the original boundary coordinates through the existing sRGB preview shader. Shape mode uses Three's corresponding two-sided normal lighting. No negative-radial Hue cap, new scientific geometry, or transparency is fabricated. The generic color-material probe retains its existing front-face culling contract; two-sided presentation is scene-owned.

## Biases and numerical boundaries

- The existing marker depth pull of `1.2e-3` NDC is retained (about 0.012 scene units for this orthographic near/far range). The line bias remains `3e-4` NDC. Plane depth compensation fixes tilted-cap interference without increasing either bias.
- A numerically edge-on supporting plane (`abs(normalEye.z) < 1e-8`) has no stable screen-depth graph; the marker falls back to center depth. This is a renderer conditioning guard, not an endpoint or membership epsilon. Hue coincidence retains its existing `1e-9` presentation relationship tolerance; Lightness coincidence uses equality.
- Hard disc boundaries, requested MSAA, encoded marker colors, and DPR/backing-budget policy are unchanged. Tests allow a one-device-pixel screenshot sampling neighborhood to account for fractional CSS screenshot origins, while retaining strict dark/light channel thresholds.
- The cap retains its existing GPU discard tolerance. Its Lightness quad is bounded by the solver's sampled Float64 extent, uploaded as Float32. Subpixel sections can rasterize to no fill pixels without changing their scientific type. No presentation size floor is introduced.

## Regression evidence and validation

`spatialPolish.test.ts` checks endpoint and near-endpoint geometry, original chromatic definitions and exact membership, cap bounds, and geometric marker depth on two supporting planes. `spatialPolish.spec.ts` checks actual pixels and projected positions, DPR 1/2, both section types, saturated/light/dark surfaces, near-contour placement, occlusion/recovery, and exposed backfaces.

Repeated crossings cover L = 0, 0.000001, 0.0001, 0.001, 0.01, 0.5, 0.9999, and 1, neutral and chromatic authored colors, both cut sides, Shape/Color, sRGB/P3, unchanged cameras, and Follow/Inspect. The [chronological Color-mode frames](evidence/phase-3c2b-polish/srgb-color-frames.json) and numbered canvas/page PNGs record both endpoint crossings and repetitions. Exact nonzero values are checked before capture even when the compact numeric field displays 0.0000.

- `pnpm verify:prepush`: passed on the final renderer, including formatting, Oxlint, package builds, types, 1,314 unit/component tests, production build, and lazy-chunk inspection. The initial gate stopped at a new test variable named `module`; that lint-only issue was corrected before the successful gates. The last full gate includes the final hollow-marker casing.
- Focused browser regressions: 10 passed; after the hollow casing change, all five affected marker/backface browser checks passed again at DPR 1 and 2. Early development failures exposed test assertion/fixture issues and an HMR-interrupted screenshot; they were resolved before these stable-tree runs.
- Production routing, static metadata/headers, editing and lazy spatial loading: 3 passed.
- Packed core no-DOM declarations and runtime transport passed. Fresh packed Vue consumer: 4 browser tests passed, along with declaration/import/artifact checks. Fresh packed React Vite consumer: 8 browser tests passed.
- Full browser aggregate: 235 passed on the final implementation, with zero retries and no failures. This includes the existing Lightness/Hue pixel, interaction, lifecycle, idle suspension, context restoration/disposal, keyboard/accessibility, and responsive regressions.
- No package contract changed. Nuxt/Next hydration is covered by the repository's exact-final-SHA CI workflow; the delivery report supplies that CI result and run URL after push.

## Remaining limits

Evidence uses Chromium with the GPU implementation recorded in the JSON captures. It is finite browser/framebuffer evidence, not qualification of every physical GPU or browser. Physical Display P3 reproduction remains unqualified; spatial Color mode remains an explicitly clipped sRGB preview. GPU fill, Float32 uploads, sampled extents, and existing shallow depth bias are presentation approximations; core analysis and the section solvers remain authoritative. Perfectly edge-on and genuine partial surface occlusions can still interrupt a marker's front perimeter, with the hollow pass providing the depth distinction.
