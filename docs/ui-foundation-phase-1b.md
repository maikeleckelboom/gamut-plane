# Phase 1B shared UI foundation

This is the first implementation slice of [ADR 0002](decisions/0002-vnext-instrument-architecture.md), following the [Phase 1A audit](vnext-ui-foundation-audit.md). The instrument still presents the approved v0.3 design. Plane, range and numeric controllers remain adapter-owned; color truth and rendering algorithms remain in core and render.

## Authority and distribution

`@gamut-plane/ui` is a private workspace package with no runtime dependency on Vue, React, core, render or the DOM. Its source is deliberately small:

| Source                      | Authority                                                                |
| --------------------------- | ------------------------------------------------------------------------ |
| `packages/ui/src/parts.ts`  | Instrument part names, state attribute names and bounded state values    |
| `packages/ui/src/glyphs.ts` | Warning glyph `viewBox` and path data; adapters render native SVG        |
| `packages/ui/src/style.css` | Sole authored instrument stylesheet and current semantic `--gp-*` tokens |
| `packages/ui/src/index.ts`  | Internal exports used by the adapters                                    |

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

The paired browser tests deliberately dispatch the same native event sequence in each packed Vite consumer. They record observable adapter differences rather than choosing a new behavior:

| Sequence                                                                                                                       | Vue                                                                         | React                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Start numeric composition, set Hue to `120`, dispatch composing input and `change`, then end composition and dispatch `change` | Completes during composition, formats `120.0`, and emits one commit overall | Keeps the `120` draft with zero commits until composition ends, then commits once        |
| Queue Hue range `input` at `120`, synchronously replace the parent color with Hue `270`, then wait two animation frames        | The queued value publishes `120` after replacement, with no commit          | The replacement remains `270`; the queued value is interrupted, with no change or commit |

These are reproducible Chromium event-sequence results. Physical IME implementations can order native events differently; no general claim about every operating-system IME is made. Neither behavior was changed in this pass. The next controller extraction must decide the intended contract explicitly and adjust tests and documentation with that decision.

## Deferred work

The vNext visual redesign, popover/compact layout, additional color spaces, gamut/model changes, renderer algorithms, and shared plane/range/numeric controllers remain outside this foundation slice. The existing `data-warning-side` placement hint remains a render-owned positional value; it was not promoted into the canonical UI state vocabulary. No existing accepted accessibility or hydration contract was intentionally changed.
