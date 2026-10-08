# Compact color instrument

## Audit and scope

The current dev implementation admits OKLCH L/C, OKLab a/b and six native RGB Areas. Core owns authored `ColorValue`, observation, editor geometry and editing operations; render resolves fields, gradients, sampled guides and Reference geometry. UI owns admission, accepted state policy, native numeric/range controllers and the single canonical stylesheet. Vue and React mount those controllers through their native lifecycles. The standalone Vue application owns CSS serialization, clipboard and explicit mapping actions.

This redesign changes product presentation and selection requests. It leaves color science, field/guide algorithms, cache policy, plane interaction and output serialization intact. No Color Probe is introduced.

## Anatomy and geometry

The instrument retains its 480px maximum, inherited host font and dominant plane with existing axes, zoom, pan and Fit controls. Coordinates occupies the top row; RGB retains the Area selector. There is no ordinary Edit / Inspect control.

Below the plane, the authoritative resolved geometry identifies `fixed`, `x` and `y` channel IDs. The fixed channel has a full-width gradient rail and directly editable number. The other two channels have adjacent numeric input cards, in the editor metadata's channel order: Lightness / Chroma for OKLCH, a / b for OKLab, R / G, R / B or G / B for native RGB. The fixed channel precedes the cards in DOM and keyboard order. This intentionally replaces the previous invariant R/G/B _visual_ row order; representation channel order and RGB authoring operations do not change.

The native control anatomy deliberately changes from three ranges to one range and three labeled numeric inputs, and removes the mode radio group. Host tests or custom integrations that query those removed controls must update. Public color/state props and serialization APIs retain their contracts.

Rail and cards are presentations of the same native channel component and NumericInput controller. Cards have no hidden or duplicate ranges. Numeric validity remains distinct from slider geometry and color validity: Chroma can exceed 0.4, RGB numbers remain finite and unbounded, and OKLab scalar completion retains its counterpart-dependent disc bounds/unavailability. Display precision never rewrites an untouched authored coordinate. Enter/change/blur, Escape, stepping, missing Hue, alpha preservation, external replacement and controlled acceptance/rejection retain their existing ownership.

Keyboard numeric focus has one owner: the full card for a plane coordinate, and the value/unit wrapper for the fixed rail. The input itself has no additional outline or native border; equivalent padding preserves its content geometry. Hue's degree unit cannot shrink and has four pixels of inset inside the shared focus boundary. This remains coherent at 320px and 390px viewports, 200% text and forced colors.

Dark neutral surfaces, small labels, prominent tabular values, restrained focus and modest padding establish hierarchy. The rail spans the available width. The two cards remain peers at 320/375/390/480px; unusually enlarged text may stack them according to allocated space. Exceptional recovery copy can grow naturally without obscuring an input.

## Explicit inspection compatibility

`selection.editorId: null` remains a valid public state in every representation. Supplying it through `state` or `defaultState` continues to show honest observed coordinates and alpha without constructing an editing plane, coercing state, authoring color or dropping requested guides. This is a host-selected observation state, not an ordinary user mode.

Choosing Coordinates requests the destination's preferred admitted editor, including choosing the current representation when its accepted editor is null. A rejected request leaves the observation state intact. Read-only controlled state disables the selection request. Choosing the current representation while already editing remains a no-op and preserves an explicit RGB Area. Hosts can still enter observation by setting null; there is no ordinary control that requests it. This is an intentional interaction change, with no public state-schema migration.

## Gamut references

The closed disclosure is named **Gamut references**. Its ordinary state is one quiet row. A compact exceptional-status cue exposes explicitly checked Outside, unavailable/unchecked Reference or requested Paused boundaries; its accessible description retains the detailed Reference and exact-status meaning. The existing nonmodal popup remains the detailed surface. Exact Status, requested Boundary and Reference remain independent accepted-state dimensions, with no additional analysis on opening and no implicit mapping.

A subtle, decorative layers icon, semibold foreground label and 6px padding on every side make the disclosure recognizable as an instrument control. At unusually enlarged text sizes the cue can take a second line; ordinary widths retain the compact row. In the popup, a Boundary label can wrap its Paused cue instead of overflowing. The popup remains viewport-clamped, nonmodal and vertically scrollable when needed, with native controls and Escape focus return.

## Evidence and acceptance

UI tests own geometry-to-control roles and selection compatibility. Shared adapter contracts own native composition, numeric authoring, rejected requests and lifecycle. Browser tests own actual input, focus, responsive layout, gamut popup, output actions and accessibility. Installed Vite/Nuxt/Next consumers cover package, SSR/hydration and React Strict Mode. Reviewed screenshots document the actual before/after instrument at 320/375/390/480px and representative alternate editors, overflow and focus. Baselines change only for inspected intentional composition changes; numerical and interaction assertions are retained at their appropriate owner.

The supplied visual references were not present in the received conversation. Visual acceptance can compare the explicit requested composition and actual before/after browser evidence; direct fidelity to reference B requires that image to be available.

The [implementation review](compact-instrument-review.md) records the final captures, visual corrections, changed files and validation outcomes.
