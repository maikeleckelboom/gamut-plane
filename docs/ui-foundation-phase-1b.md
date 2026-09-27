# Phase 1B shared UI foundation

This is the first implementation slice of [ADR 0002](decisions/0002-vnext-instrument-architecture.md), following the [Phase 1A audit](vnext-ui-foundation-audit.md). Phase 1B.2 added one shared range controller; Phase 1B.3 adds one shared numeric-draft controller. The instrument still presents the approved v0.3 design. Plane gestures remain adapter-owned; color truth and rendering algorithms remain in core and render.

## Authority and distribution

`@gamut-plane/ui` is a private workspace package with no runtime dependency on Vue, React, core or render. Its range and numeric controllers use native DOM APIs only after an adapter mounts them, so importing the package during SSR has no browser side effects. Its source remains small:

| Source                                              | Authority                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/parts.ts`                          | Instrument part names, state attribute names and bounded state values                                       |
| `packages/ui/src/glyphs.ts`                         | Warning glyph `viewBox` and path data; adapters render native SVG                                           |
| `packages/ui/src/style.css`                         | Sole authored instrument stylesheet and current semantic `--gp-*` tokens                                    |
| `packages/ui/src/interaction/rangeInteraction.ts`   | Native range input/change, coalescing, parent feedback, pointer preview, interruption and silent disposal   |
| `packages/ui/src/interaction/numericInteraction.ts` | Native numeric draft metadata, completion, composition, parent/precision reconciliation and silent disposal |
| `packages/ui/src/index.ts`                          | Internal exports used by the adapters                                                                       |

The UI build copies the authored sheet to `packages/ui/dist/style.css`. Each adapter build copies those exact bytes to its own `dist/style.css`. Both public consumer imports remain `@gamut-plane/vue/style.css` and `@gamut-plane/react/style.css`; consumers never import UI directly. The packed Vite, Nuxt and Next fixtures install UI from a local tarball as an adapter dependency, inspect installed files against the tarball and load CSS through the adapter entry. The Vite packed gates additionally compare both installed stylesheets against the authored source.

The root contract is `data-gp-root` with `data-gp-view="oklch|oklab"`. Parts are `view-control`, `view-option`, `workspace`, `field`, `controls`, `plane`, `surface`, `canvas`, `domain-boundary`, `gamut-guides`, `gamut-boundary`, `boundary-hit`, `marker`, `guide-connector`, `warning`, `warning-glyph`, `axis`, `render-status`, `channel`, `channel-header`, `numeric-input`, `channel-track`, `channel-field`, `native-range`, `gamut-interval`, `boundary-preview`, `coordinate-readout`, `target-result`, `target-heading` and `target-swatch`.

The other canonical state attributes are `data-gp-gamut` (`srgb|display-p3`), `data-gp-marker` (`active|target-guide`), `data-gp-axis` (`x|y`), `data-gp-channel` (`h|l|c`), `data-gp-status` (`inside|within-tolerance|outside`), `data-gp-warning`, `data-gp-overflow` and `data-gp-pointer-focus`. The last three are presence or boolean states as emitted by the existing presentation. `data-gp-visually-hidden` is an additional accessibility styling hook shared by both adapters, not a new instrument part or visual state. Adapter classes and existing test hooks remain where compatibility requires them, but the authored sheet selects the common semantic contract.

Warning size and placement stay in render; only the duplicated triangle path and `viewBox` moved to UI. Core remains authoritative for `ColorValue`, exact gamut status and mapping. Each adapter keeps its native markup, IDs, product callbacks, lifecycle, SSR integration and Canvas setup. The native numeric text stays in the input itself. No framework-neutral DOM renderer or new public adapter API was introduced.

## Comparable parity fixtures

The Vue and React packed Vite consumers have equivalent `?parity` hosts. The hosts expose the same requested dimensions, selected color, view, guide visibility and target gamut. Their paired `e2e/uiFoundation.spec.ts` files assert semantic parts and relationships, roles, labels, ID association, Canvas state, guide/target visibility and exact sRGB/P3 statuses. The screenshots were captured before the anatomy/style migration and retained as references through both adapter migrations. Existing approved Vue and React visual references were not changed.

| Capture                                           | State and host width                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `oklch`, `oklab`                                  | In-gamut baseline in each view, 800px                          |
| `p3-only`                                         | Outside sRGB, inside Display P3, 800px                         |
| `outside`                                         | Outside both displayed gamuts, warning and target guide, 800px |
| `srgb-hidden`, `guides-hidden`                    | One or both guide layers hidden, 800px                         |
| `target-p3`                                       | Out-of-gamut color with Display P3 target, 800px               |
| `narrow`                                          | 340px container                                                |
| `threshold-623`, `threshold-624`, `threshold-625` | Container-query boundary widths                                |
| `enlarged-text`                                   | 800px host with 200% root text                                 |

There are twelve new Windows screenshots for each adapter, taken in the same Chromium version and dimensions. Pre-migration images were compared pixel by pixel across adapters and matched in all twelve states. Playwright compares each adapter's final output against its own pre-migration reference. On non-Windows platforms these new screenshots are not compared; the semantic and status assertions still run, and existing platform visual suites continue to run as configured. This bounds the cross-framework pixel claim to the Windows Chromium fixture.

## Behavior boundaries frozen before controller work

The paired browser tests deliberately dispatch the same native event sequence in each packed Vite consumer. Phase 1B recorded two observable differences before controller extraction:

| Sequence                                                                                                                       | Vue                                                                         | React                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Start numeric composition, set Hue to `120`, dispatch composing input and `change`, then end composition and dispatch `change` | Completes during composition, formats `120.0`, and emits one commit overall | Keeps the `120` draft with zero commits until composition ends, then commits once        |
| Queue Hue range `input` at `120`, synchronously replace the parent color with Hue `270`, then wait two animation frames        | The queued value publishes `120` after replacement, with no commit          | The replacement remains `270`; the queued value is interrupted, with no change or commit |

These were reproducible Chromium event-sequence results. Phase 1B.2 resolves the range difference in favor of parent authority: both adapters now discard queued `120`, retain parent Hue `270`, reconcile the native slider, and make no stale change or commit. Phase 1B.3 resolves the numeric difference in favor of React's explicit composition-session policy. Physical IME implementations can order native events differently; no general claim about every operating-system IME is made.

## Phase 1B.2 shared range authority

`mountRange(element, current)` and its `RangeInput` contract are internal exports from `@gamut-plane/ui`. `current()` supplies the latest authored value, bounds, optional native-to-authored `normalizeValue`, live/completion callbacks and optional pointer-interaction callback. The controller attaches native listeners at mount, owns the active pointer, published value, pending RAF value and expected feedback, and exposes `reconcile()` and `dispose()`. It is framework-neutral, but deliberately DOM-specific. It neither owns Vue/React lifecycle nor accesses the DOM at module evaluation.

Native `input` reads `valueAsNumber` and may publish only the latest value in a frame. Native `change` cancels pending work, reads the actual final native value, and calls the completion adapter synchronously. Each product adapter publishes the final live color before its commit callback. Cancellation, capture loss and blur discard pending work and restore the latest published native value without inventing the instrument's `cancel` event. Pointer-down alone reports no preview; the first input during that pointer gesture starts it, and completion, interruption or cancellation ends it once.

When authored parent feedback matches the published value, including Hue `360` normalized to authored `0`, the interaction continues and the native endpoint may stay at `360`. A genuinely different parent value interrupts pending or active work, updates the native range and ends a reported preview once. Disposal cancels frames, clears state and removes listeners without invoking any consumer callback, including interaction end. View changes clear the product's Hue preview in `GamutPlane` itself; child teardown does not supply that signal.

React retains committed-prop and layout-effect integration. Vue now mounts and reconciles the same controller through its lifecycle; its reactive display binding mirrors the reconciled native value so expected normalized feedback does not move the thumb. Both keep pointer-focus hooks in the adapter. Plane gestures, Canvas lifecycle, ResizeObserver and warning placement remain with their current owners.

The foundation suites now assert exact canonical state values for view, gamut boundaries/intervals, markers, axes, channels, status, warning, overflow and pointer focus. A separate P3-only color `[0.68, 0.18, 252]` targeted to Display P3 proves sRGB `outside`, P3 `inside` and target `inside`. The original twelve Windows screenshots per adapter remain unchanged; semantic assertions run on all CI platforms.

## Phase 1B.3 shared numeric draft authority

Pre-extraction source and green adapter tests recorded this numeric matrix:

| Action                                                                            | Vue before 1B.3                                                                                            | React before 1B.3               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Native input, Enter/change/blur, repeated completion                              | Local draft; valid value clamped and completed once                                                        | Same                            |
| Invalid/empty completion, dirty/idle Escape, authored-value replacement, disposal | Restore without edit; dirty Escape cancels; idle Escape bubbles; parent replaces draft; disposal is silent | Same                            |
| Precision-only change during a draft                                              | Draft retained                                                                                             | Draft discarded and reformatted |
| Native change during active composition                                           | Completes                                                                                                  | Keeps draft pending             |
| Enter with `isComposing=true`                                                     | Ignored                                                                                                    | Ignored                         |
| Enter/Escape with explicit composition active but key flag false                  | May act on draft                                                                                           | Ignored                         |

`mountNumericInput(element, current)` is the sole authored numeric-draft policy. It tracks only dirty state, a restoration revision, composition-session state and disposal. Native `input type="number"` owns temporary text and bad-input state; typing does not publish a color edit. Dirty Enter, native `change` and blur read the final `valueAsNumber`, clamp a finite value to current bounds, and invoke the adapter's completion callback once. Invalid or empty input emits no completion or cancellation. A revision-guarded microtask then writes the latest authoritative `value` at current `precision` directly to the DOM, clearing native bad-input state without overwriting a newer edit. The adapter retains ColorValue authoring and update-before-commit semantics. Chroma intentionally supplies no numeric maximum when overflow editing is allowed.

Explicit `compositionstart`/`compositionend` state and `KeyboardEvent.isComposing` suppress Enter/Escape during composition; native `change` and blur also remain inert until composition ends. `compositionend` itself does not complete. Dirty Escape outside composition restores and cancels once; idle Escape remains available to the host. Authoritative value or precision changes discard a local draft and reformat silently. Bound-only changes do not complete or reset it. Disposal removes listeners and invalidates restoration without callbacks.

React mounts the controller in its layout lifecycle and supplies committed props through `useCommitted`; its numeric JSX and public API remain unchanged. Vue mounts the same controller, emits its existing events, and watches only value/precision for reconciliation. A Vue directive emits the initial numeric `value` in server markup and assigns it on client mount; Vue does not bind the live native value reactively, so unrelated prop updates cannot erase a draft. Vue now ignores native change/blur during active composition, protects Enter/Escape with explicit session state, and reformats on precision-only changes.

Paired unit tests cover ordinary completion/deduplication, bounds, invalid drafts, Escape, parent/precision replacement, composition change/blur/key sequences, post-composition completion and silent disposal. Both packed Vite consumers pass the same synthetic Chromium sequence: change during composition leaves zero commits and the `120` draft, composition end leaves zero commits, and later change commits once. This proves that tested event order only. Physical IME acceptance remains a manual verification item.

## Deferred work

The vNext visual redesign, popover/compact layout, additional color spaces, gamut/model changes, renderer algorithms and shared plane controller remain outside this foundation slice. For future arbitrary/dynamic channel descriptors, review the range controller's bounds-only reconciliation and the difference between React's authored range scalar and Vue's bounded visible scalar; fixed v0.3 bounds show no current product defect. The existing `data-warning-side` placement hint remains a render-owned positional value; it was not promoted into the canonical UI state vocabulary. No existing accepted accessibility or hydration contract was intentionally changed.
