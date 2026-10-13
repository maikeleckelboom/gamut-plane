# Phase 3C: spatial instrument and hue-relative inspection

## Ownership and interaction

The task is to inspect one authored color against a gamut and its section. The canvas is the dominant workspace; the existing compact instrument remains the sole color editor. No core, renderer-package, geometry solver, membership policy, package export, dependency, or framework lifecycle contract changes.

`spatialApp.vue` owns presentation choices and the independent Lightness/Hue follow-or-inspect selections. Existing section stores and the latest-request scheduler compute numerical geometry. `spatialScene.ts` owns the camera, OrbitControls, GPU resources, and demand rendering. `spatialCamera.ts` owns camera math. The redesigned host does not add camera watchers or color synchronization state. Numeric Hue drafts remain local until accepted; renderer frames cannot replace a draft.

Generic browser mechanics continue to use the already installed `@vueuse/core` listener, visibility, and resize composables. Disclosure dismissal uses the existing `useEventListener` mechanism, mounted and automatically disposed; domain tracking stays outside Vue. Native radio groups, a select, range/number fields and details retain browser keyboard and touch behavior. Escape closes a view/section disclosure and returns focus to its summary; clicking elsewhere closes it after the click completes.

## Camera relationship

World coordinates are **[a, L, b]**. A hue section has radial direction `[cos(h), 0, sin(h)]` and front normal `[-sin(h), 0, cos(h)]`. Three's Y-up azimuth is `atan2(x, z)`, so a positive hue delta requires a **negative** Y-axis camera rotation.

`createHueTracking` remembers only the last effective hue. Each accepted section change applies the shortest signed delta to the existing camera position and target about the lightness axis. The target's L coordinate remains fixed; its a/b position and pan rotate with the section. This preserves section-relative framing, screen-space pan, pitch, distance and zoom. It deliberately does not keep an off-axis target fixed in world space, which would let the section drift across the viewport.

The camera itself remains the pose authority. Pointer, touch and keyboard orbit change the relative angle implicitly. Panning, zoom-to-cursor and explicit fit commands similarly establish the frame used by subsequent hue changes. Pending and ready updates at the same hue are idempotent. No RAF correction, easing accumulator, requested/presented camera pair, or separate orbit pose is introduced.

- Entering or leaving Hue binds/releases tracking without moving the current camera. An existing near-edge-on view remains user-owned; **View section** provides deliberate alignment.
- Follow observes the selected color through core; Inspect observes the independent hue. Switching the source transports the view to the newly effective hue.
- Neutral or missing hue retains the existing viewing direction under the established hue model. Invalid/nonfinite camera input is ignored; invalid number entry retains the accepted value.
- View section restores C-right/L-up framing and the front-facing cut. Its aligned composition now persists through hue changes. Manual orbit releases that composition but keeps hue tracking.
- Home restores a useful section-relative oblique direction in Hue, and the established world home otherwise. Show selected uses that explicit recovery path. Fit section/visible preserve orientation.
- Both wrap directions use the short arc. Exactly 180 degrees has a deterministic negative-hue-delta tie break. All changes are immediate, including discrete ones. This also supplies reduced-motion behavior without animation-specific state.
- Cut side is explicit user intent. Tracking does not flip it, infer it from camera position, or change the selected color's radial interpretation.

## Exposure and action inventory

One shared surface, one inspector, two viewport-associated strips. The header only identifies the instrument and coordinate family. The canvas clips projected annotations to its own bounds. The inspector removes its outer border/background through supported host CSS variables; its coordinate editing and warnings retain their established anatomy.

| Existing action or information                                                                          | New exposure / behavior                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| sRGB / Display P3 surface                                                                               | Primary native segmented group above canvas                                                            |
| Shape / Color                                                                                           | Primary native segmented group above canvas                                                            |
| Other gamut outline                                                                                     | View disclosure checkbox                                                                               |
| Fit visible                                                                                             | View disclosure; orientation preserved                                                                 |
| Home                                                                                                    | View disclosure and canvas Home key; hue-relative in Hue                                               |
| Show selected / Restore surface                                                                         | View disclosure, same focus-preserving action slot                                                     |
| Lightness / Hue section                                                                                 | Primary segmented group attached below canvas                                                          |
| Follow selected / independent inspection                                                                | One native Section value source select; selections retained per section type                           |
| Effective hue / lightness                                                                               | Contextual fixed-width readout; never an extra authored coordinate                                     |
| Hue numeric inspection                                                                                  | Contextual in Inspect Hue only; finite values committed on Enter/blur                                  |
| Hue inspection slider and cyclic arrows                                                                 | Contextual in Inspect Hue only; immediate coupled camera transport                                     |
| Lightness inspection slider                                                                             | Contextual in Inspect Lightness only                                                                   |
| View section                                                                                            | Section disclosure; explicit scientific comparison orientation                                         |
| Fit section                                                                                             | Section disclosure; retains chosen orientation                                                         |
| Cut away                                                                                                | Persistent checkbox with checked surface treatment; existing flat/revealed disable conditions retained |
| Flip cut                                                                                                | Section disclosure when a volume cut is applicable; live current-side feedback                         |
| Pointer orbit                                                                                           | Canvas drag; updates relative offset in Hue                                                            |
| Touch orbit                                                                                             | One-finger canvas drag; updates relative offset in Hue                                                 |
| Pan                                                                                                     | Right-drag / two fingers / Shift+arrows; section-relative in Hue                                       |
| Zoom                                                                                                    | Wheel / pinch / plus-minus; unchanged bounds and cursor behavior                                       |
| Keyboard orbit                                                                                          | Canvas arrows; preserves tracking                                                                      |
| Gamut line identities / selected point                                                                  | Compact three-item key; hidden comparison gamut removed from key                                       |
| Line-style, neutral/contact and occlusion explanations                                                  | About this view disclosure                                                                             |
| Selected coordinates, exact membership and out-of-gamut warnings                                        | Existing inspector; detailed scene relationship in About this view                                     |
| Color/section relationship and numerical topology details                                               | About this view; exceptional topology/failed sections remain contextual feedback                       |
| Marker obscured / outside view                                                                          | Contextual concise feedback; recovery in View                                                          |
| Undefined hue                                                                                           | Contextual retained-direction explanation                                                              |
| Color reproduction limitations                                                                          | sRGB preview label; explicit P3 clipping warning in Color/P3; fuller disclosure                        |
| WebGL unavailable/context loss and restore                                                              | Visible recovery message with compact-instrument fallback                                              |
| Pointer/keyboard instructions                                                                           | About this view, also linked as canvas accessible description                                          |
| Sample counts, implementation footer, phase badge, introductory paragraph, duplicate color descriptions | Removed from permanent layout                                                                          |
| Manual orbit to chase a moving hue                                                                      | Replaced by automatic hue-relative transport                                                           |

No supported capability is removed. No Rec.2020 or new color-space functionality is added. Desktop uses a wide canvas and 320px inspector; narrow layouts preserve DOM/focus order, wrap controls and place the inspector below. The spatial route continues to use the existing dark scientific palette even under a light OS preference; no light theme is claimed.

## Validation and evidence

Focused camera tests independently compare camera/target coordinates in the section basis through eight forward/reverse sweeps, verify the rotation sign, both wrap directions, invalid inputs, entry/re-entry, duplicate updates and explicit alignment. Existing color, hue, section and endpoint invariants remain unchanged.

Browser coverage exercises the actual color editor, inspection select, number/range controls, mouse dragging, keyboard orbit/pan/zoom, native disclosures, one- and two-finger CDP touch input, Home/fit, cut/flip, neutral hue and reduced-motion preferences. The sweep records every checked camera frame and representative PNGs; sampled slider frames are checked while the pointer is held down. Existing framebuffer-to-core, marker, contact-ray, endpoint, resource and lifecycle checks are retained.

- `pnpm verify:prepush` passed: formatting, Oxlint, package builds, type checks, **1,319 unit/component tests**, production build and lazy-chunk checks.
- The unchanged marker pixel checks passed twice at DPR 1 and DPR 2 after restoring fixed editorial gutters. Fractional viewport-relative page padding had introduced canvas resampling; no shader or pixel threshold was changed.
- Earlier focused runs identified obsolete fixed-camera and permanent-control/text expectations. Those tests now use native disclosure/inspection paths and assert the required hue-relative rotation. The final two focused regressions passed with `--last-failed`.
- The no-preference motion journey passed three repeats after an in-progress development HMR reload interrupted its initial run. Final gates run against a stable tree.
- Production verification passed all **3 tests** with the existing preview server on isolated port 4182 and a separate output directory. The default production command could not start because 4178 was already occupied; the existing service was not stopped.
- `pnpm test:e2e` passed all **241 browser tests**, without retries.
- After that aggregate, the final accessibility review restored current cut-side feedback inside the Section disclosure. The final tree passed **11 focused browser tests**, all **107 web unit/component tests**, the web type check/build, production artifact checks, formatting and lint, and all **3 production tests** again. The earlier complete aggregate remains recorded against its original inputs rather than being represented as a rerun of the final feedback addition.

Local evidence is retained under `.artifacts/spatial-instrument/`: `verification-state.json` identifies the aggregate inputs, `final-verification-state.json` identifies final inputs, `prepush.log` records the repository gate, and `browser.log` records the complete browser run. The `final-*` logs record focused verification after the feedback addition. `final/frames.json` and representative PNGs retain the hue sweep, pointer-held slider frames, default view, flipped cut, uncut, mobile and keyboard-feedback views. Responsive/light-preference/keyboard-focus images are also produced by the tracking browser spec in Playwright's test output. These are finite observations, not scientific or performance certificates.

## Limits

Finite Chromium/SwiftShader evidence is not physical-GPU or cross-browser certification. Touch input is browser-emulated, not a physical-device test. Surface uploads, contours, fills and display colors remain presentation approximations; exact membership remains core-owned. Physical Display P3 reproduction remains unqualified. A user can deliberately orbit edge-on or behind a cut; automatic tracking preserves that chosen angle until another orbit or explicit View section/Home command.
