# Phase 1B shared UI foundation

This is the first implementation slice of [ADR 0002](decisions/0002-vnext-instrument-architecture.md), following the [Phase 1A audit](vnext-ui-foundation-audit.md). Phase 1B.2 adds one shared range interaction controller. The instrument still presents the approved v0.3 design; plane gestures and numeric drafts remain adapter-owned, while color truth and rendering algorithms remain in core and render.

## Authority and distribution

`@gamut-plane/ui` is a private workspace package with no runtime dependency on Vue, React, core or render. Its range controller uses native DOM APIs only after an adapter mounts it, so importing the package during SSR has no browser side effects. Its source remains small:

| Source                                            | Authority                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/parts.ts`                        | Instrument part names, state attribute names and bounded state values                                     |
| `packages/ui/src/glyphs.ts`                       | Warning glyph `viewBox` and path data; adapters render native SVG                                         |
| `packages/ui/src/style.css`                       | Sole authored instrument stylesheet and current semantic `--gp-*` tokens                                  |
| `packages/ui/src/interaction/rangeInteraction.ts` | Native range input/change, coalescing, parent feedback, pointer preview, interruption and silent disposal |
| `packages/ui/src/index.ts`                        | Internal exports used by the adapters                                                                     |

The UI build copies the authored sheet to `packages/ui/dist/style.css`. Each adapter build copies those exact bytes to its own `dist/style.css`. Both public consumer imports remain `@gamut-plane/vue/style.css` and `@gamut-plane/react/style.css`; consumers never import UI directly. The packed Vite, Nuxt and Next fixtures install UI from a local tarball as an adapter dependency, inspect installed files against the tarball and load CSS through the adapter entry. The Vite packed gates additionally compare both installed stylesheets against the authored source.

The root contract is `data-gp-root` with `data-gp-view="oklch|oklab"`. Parts are `view-control`, `view-option`, `workspace`, `field`, `controls`, `plane`, `surface`, `canvas`, `domain-boundary`, `gamut-guides`, `gamut-boundary`, `boundary-hit`, `marker`, `guide-connector`, `warning`, `warning-glyph`, `axis`, `render-status`, `channel`, `channel-header`, `numeric-input`, `channel-track`, `channel-field`, `native-range`, `gamut-interval`, `boundary-preview`, `coordinate-readout`, `target-result`, `target-heading` and `target-swatch`.

The other canonical state attributes are `data-gp-gamut` (`srgb|display-p3`), `data-gp-marker` (`active|target-guide`), `data-gp-axis` (`x|y`), `data-gp-channel` (`h|l|c`), `data-gp-status` (`inside|within-tolerance|outside`), `data-gp-warning`, `data-gp-overflow` and `data-gp-pointer-focus`. The last three are presence or boolean states as emitted by the existing presentation. `data-gp-visually-hidden` is an additional accessibility styling hook shared by both adapters, not a new instrument part or visual state. Adapter classes and existing test hooks remain where compatibility requires them, but the authored sheet selects the common semantic contract.

Warning size and placement stay in render; only the duplicated triangle path and `viewBox` moved to UI. Core remains authoritative for `ColorValue`, exact gamut status and mapping. Each adapter keeps its native markup, IDs, event model, draft/gesture lifecycle, SSR integration and Canvas setup. No framework-neutral DOM renderer or new public adapter API was introduced.

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

These were reproducible Chromium event-sequence results. Phase 1B.2 resolves the range difference in favor of parent authority: both adapters now discard queued `120`, retain parent Hue `270`, reconcile the native slider, and make no stale change or commit. The numeric IME difference remains deferred. Physical IME implementations can order native events differently; no general claim about every operating-system IME is made.

## Phase 1B.2 shared range authority

`mountRange(element, current)` and its `RangeInput` contract are internal exports from `@gamut-plane/ui`. `current()` supplies the latest authored value, bounds, optional native-to-authored `normalizeValue`, live/completion callbacks and optional pointer-interaction callback. The controller attaches native listeners at mount, owns the active pointer, published value, pending RAF value and expected feedback, and exposes `reconcile()` and `dispose()`. It is framework-neutral, but deliberately DOM-specific. It neither owns Vue/React lifecycle nor accesses the DOM at module evaluation.

Native `input` reads `valueAsNumber` and may publish only the latest value in a frame. Native `change` cancels pending work, reads the actual final native value, and calls the completion adapter synchronously. Each product adapter publishes the final live color before its commit callback. Cancellation, capture loss and blur discard pending work and restore the latest published native value without inventing the instrument's `cancel` event. Pointer-down alone reports no preview; the first input during that pointer gesture starts it, and completion, interruption or cancellation ends it once.

When authored parent feedback matches the published value, including Hue `360` normalized to authored `0`, the interaction continues and the native endpoint may stay at `360`. A genuinely different parent value interrupts pending or active work, updates the native range and ends a reported preview once. Disposal cancels frames, clears state and removes listeners without invoking any consumer callback, including interaction end. View changes clear the product's Hue preview in `GamutPlane` itself; child teardown does not supply that signal.

React retains committed-prop and layout-effect integration. Vue now mounts and reconciles the same controller through its lifecycle; its reactive display binding mirrors the reconciled native value so expected normalized feedback does not move the thumb. Both keep pointer-focus hooks in the adapter. Numeric drafts, plane gestures, Canvas lifecycle, ResizeObserver and warning placement remain with their current owners.

The foundation suites now assert exact canonical state values for view, gamut boundaries/intervals, markers, axes, channels, status, warning, overflow and pointer focus. A separate P3-only color `[0.68, 0.18, 252]` targeted to Display P3 proves sRGB `outside`, P3 `inside` and target `inside`. The original twelve Windows screenshots per adapter remain unchanged; semantic assertions run on all CI platforms.

## Deferred work

The vNext visual redesign, popover/compact layout, additional color spaces, gamut/model changes, renderer algorithms, and shared plane/numeric controllers remain outside this foundation slice. The existing `data-warning-side` placement hint remains a render-owned positional value; it was not promoted into the canonical UI state vocabulary. No existing accepted accessibility or hydration contract was intentionally changed.
