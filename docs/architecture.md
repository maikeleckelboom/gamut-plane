# Architecture

Gamut Plane has one public instrument state route in Vue and React. The authored `ColorValue` is controlled separately from instrument state. Instrument state contains exactly `selection`, `checkedGamuts`, `visibleGuides`, and `referenceGamutId`. Selection changes, Reference focus, exact checks, and sampled visual guides observe the authored color; only an edit creates a new `ColorValue`.

## Ownership

| Package                | Responsibility                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gamut-plane/core`    | Immutable authored color, representation conversion, exact gamut analysis, geometry definitions, and edit operations. No DOM or framework dependency.         |
| `@gamut-plane/render`  | Canvas field and sampled guide data, field/guide resolution, CSS/SVG visual detail. No product state or framework lifecycle.                                  |
| `@gamut-plane/ui`      | Product admission, preferred editor, canonical state policy, copy, ordering, anatomy, stylesheet, native interaction controllers. No color science or Canvas. |
| Vue and React adapters | Public API, accepted state ownership, native markup, committed resources, measurement, focus, and callback delivery.                                          |
| `apps/web`             | Standalone Vue host, CSS output and clipboard UI, canonical product browser/visual suite.                                                                     |

The adapter-local accepted revision composes one authored source and one validated accepted state. Its seven-field presentation view is `authored`, `selection`, `observation`, `exactChecks`, `editor`, `field`, and `guides`. These facts retain source identity where applicable. Exact rows are computed from the original `ColorValue` only for requested gamuts; an empty request performs no ordinary analysis. A failed check remains unavailable rather than becoming `outside`. Guide resolution is independent of whether a Canvas field exists.

The render `internal/current` entry and UI current-editor helpers are bounded integrations for the two shipped editors. They have live generalized responsibilities; they do not implement another public product route. Internal capability entries are sibling-package contracts, not application imports.

## Editor selection and geometry

The relationship is:

```text
representation → admitted editors → preferred editor → selected editor → geometry → operation
```

Core can define a technical editor and geometry without admitting that editor to the public product. UI validates public selection against an explicit admission list. The preferred editor initializes a representation selection only when admitted; an explicit valid `editorId` remains authoritative. An explicit `null` selects inspection. A representation can have zero, one, or several admitted editors. The current product has one for OKLCH (`oklch-lc`), one for OKLab (`oklab-ab`), and zero for sRGB and Display P3. Coordinates is a select-only combobox with a single-select listbox. Its trigger and selected check follow accepted state; a highlighted candidate is ephemeral. Choosing the current representation is a no-op, including explicit inspection. Edit/Inspect uses native radio semantics derived from `selection.editorId`, with plain Inspecting context for representations without admitted editors. Area uses the same selector only when editing with multiple admitted editors; it selects an admitted editor identity. Returning from Inspect chooses the current preferred editor, without editor history. Test-only admission fixtures prove the multiple-editor composition without adding a shipped editor.

`GeometryId` is separate from `RepresentationId`. Every geometry declares its representation, X/Y/fixed channel bindings, directions, domain, projection, point conversion, containment, constraint, keyboard behavior, and fixed sampling policy. The shipped OKLCH rectangle binds X=`oklch.c`, Y=`oklch.l`, fixed=`oklch.h`; the OKLab disc binds X=`oklab.a`, Y=`oklab.b`, fixed=`oklab.l`. Projection facts carry both representation and geometry identity. Field resolution and renderer cache keys use the selected geometry identity, not representation alone. Pointer and keyboard edits call the selected editor's operation; companion controls use declared operation IDs. A test-only OKLCH H/C editor with fixed Lightness proves a second geometry for the same representation without adding a public product capability.

## Product behavior

Checks and guides are independent sets. The locally owned product default requests both exact statuses and both sampled boundaries, with sRGB as Reference; an explicit state can request zero, one, or both of either. Canonical state arrays use stable ID order; exact results display in explicit product order: sRGB, then Display P3. Guides are sampled reference geometry and never exact gamut truth. Inspection has no fake editing plane. A requested guide remains in state when it cannot currently render and can reappear after returning to an editor. Unavailable observation, field, guide forms, and exact results retain their own meanings. Neither selection nor comparison changes map or reauthor color.

Core representation capability definitions declare `associatedGamutId`: null for OKLCH/OKLab, sRGB gamut for sRGB, and Display P3 gamut for Display P3. This technical relationship does not constrain coordinate validity or request any work. UI `coordinatesOptions` projects passive badges only from explicitly checked, accepted exact rows. Unchecked and unassociated options have no badge; failed requested analysis is Unavailable. The popup never runs analysis or caches old results.

The shared UI package owns repeated labels, messages, and inspection formatting. Adapters own semantic markup and lifecycle. The standalone app hosts the same instrument beside a secondary CSS/output demonstration; it does not repeat the instrument's coordinates or requested gamut results. The shared stylesheet keeps the instrument in one vertical composition, caps its width at 480px, and adapts within narrower hosts. The host can set `--gamut-plane-accent`.

## Reference focus

`referenceGamutId: GamutId | null` is independent semantic focus, admitted by `admittedReferenceGamuts` in UI `instrumentState.ts`. Only sRGB, Display P3 and null are accepted. Unknown or non-admitted Reference IDs reject the full state; technical capability existence never implies product admission. Choosing Reference does not request analysis or a boundary, and disabling either request does not clear Reference. Controlled state remains authoritative.

Render `capabilities/guideSupport.ts` owns the explicit `referenceGuidePolicy`: sRGB gamut to sRGB boundary; Display P3 gamut to Display P3 boundary. Render owns `GuideId`, so this introduces no UI-to-render dependency. `current/referenceDisplay.ts` borrows the requested guide's `forms.reference` fact, including boundary color, maximum chroma and delta. It projects that sample with the selected geometry's point math. `spatial.kind: "unavailable"` retains the sampled fact while suppressing both connector and marker for missing field support, unsupported geometry, nonfinite projection or an endpoint outside the editing domain. It never constrains the Reference endpoint. Active-color marker constraint behavior is unchanged.

The connector and sampled boundary marker are a contextual out-of-gamut excursion annotation, not passive Reference geometry. `showExcursion` requires the selected Reference gamut's explicitly requested, accepted exact result to be `outside`. Both annotations render only when the explicitly mapped Boundary is also requested, its sampled Reference form is available, and its endpoint projects truthfully into the active editor geometry. Exact analysis determines whether an excursion is applicable; the sampled guide supplies the approximate endpoint. Inside, within-tolerance, unavailable and unchecked statuses produce neither annotation. Ordinary requested boundaries and slider intervals remain visible independently, and Reference selection persists. `PickerGuide.deltaC` retains sampled outward excursion information; it is neither a membership/visibility criterion nor a general distance-to-boundary metric. No hidden checks are introduced.

Shared UI `referenceWarning` consumes only the accepted revision's explicitly requested exact rows. Only `outside` for the selected Reference warns; `inside`, `within-tolerance`, unavailable and absent checks do not. Boundary visibility never controls this warning. Plane and range feedback use the same small triangle. The plane prefers above-right of the active marker with a clear gap, falling back to another diagonal when field space requires it. Existing surface measurements and live marker positioning own that placement. Range feedback uses a meaningful in-range thumb position. Numeric-only coordinates have no fabricated positional glyph. Accessible warnings name the gamut.

Inspection preserves Reference, checks and requested guides without constructing a field. Returning to an editor can restore an applicable excursion annotation. The per-gamut disclosure uses native Status/Boundary checkboxes and one Reference radio group (including No Reference); requested exact states remain associated with their gamut. Sampled Guide C/delta values stay structured and have no permanent result panel.

## Interaction lifecycle

There is one parent-owned color. Numeric inputs keep draft text locally until Enter, native change, or blur; Escape discards a draft. Pointer and range work coalesce in RAF while the final value publishes synchronously before commit. Plane Escape restores the exact gesture origin. A replacement authored definition or accepted editor/inspection switch interrupts pending work without reinterpreting points through another geometry. A rejected controlled state request leaves the old context active. Status/Boundary/Reference-only accepted changes leave the semantic context, numeric draft, Hue reference, active gesture, and pending range work intact. Unmount disposes queued work without consumer callbacks.

The selector controller owns per-instance open/candidate/typeahead state below accepted color resolution. Native Popover moves the surface to the top layer while retaining instrument ancestry and tokens; nested host invoker relationships are preserved. Focus remains on the combobox. Escape closes only the selector, Tab proceeds normally, and outside dismissal never applies a candidate. Mounted plane/range controllers expose pointer ownership so a selector cannot steal an active gesture. Ordinary numeric blur completes a draft in the old context before a selection request.

Direct range controls use a shared 32px technical notation rail: H/L/C sit in the continuous dark track strip, with the label above the track and numeric value on the right. The native input and all intervals/warnings remain inside the actual track box. Numeric-only OKLab a/b controls have no rail. Intrinsic wrapping adapts the context row to allocated host width; DOM order and the 480px maximum remain stable.

Vue and React use the same UI controllers but own their framework-specific committed setup and callback bridge. Vue uses VueUse for mounted resize and browser resource integration. React uses committed refs and effects; concurrent render, Suspense, and Strict Mode must not promote abandoned work to native authority. Canvas capability describes the granted context, not display hardware or exact gamut membership. The server renders controls, values, marker, requested SVG guides, and reserved geometry; browser resources begin after mount.

## Validation ownership

Core tests own science and typed geometry/operation contracts. Render tests own field/guide forms and geometry-keyed caches. UI tests own admission, state, order, copy, and controller policies. Adapter tests own native composition and framework lifecycle; shared semantics use a common contract where useful. The standalone web suite owns full product browser, accessibility, responsive, and visual references. Packed Vue/Vite and React/Vite prove installed artifacts and a representative interaction; packed Nuxt and Next prove SSR/hydration, with Next root Strict Mode. See [Testing](testing.md) and the [React parity map](react-parity.md).

Mapping, output workflows, a new shipped editor/representation, plugin registration, and a compact vNext redesign are outside the current instrument API.

## Direct editor coordinates

An admitted editor may expose direct 1D companion controls for its editable coordinates.
OKLCH exposes H/L/C beside its L/C plane; OKLab exposes L/a/b beside its a/b plane.
The subdued plane-axis labels identify the 2D geometry and remain visible independently
of the direct-control notation rail. The separate editable OKLab coordinate block is removed.

Core's internal `oklab-disc-coordinate` capability resolves each direct range from the fixed
counterpart: a spans `[-sqrt(r*r - b*b), +sqrt(r*r - b*b)]`, and b uses the corresponding
slice at fixed a. Core rounds endpoints inward to 12 decimal places to keep DOM bounds
stable across server/browser observation noise without admitting points outside the disc.
The radius comes from core's admitted disc geometry. A counterpart exactly
at the radius permits only zero; a counterpart beyond it makes that direct slice unavailable.
Range availability is separate from authored coordinate validity. Overflow retains the real
numeric value while the native thumb stays clamped at the nearest endpoint; unavailable slices retain a read-only numeric value and
an accessible recovery explanation. The plane can still author an in-domain point.

Direct scalar authorship bounds only the edited channel and then uses the existing OKLab
channel edit, preserving the counterpart, Lightness and alpha exactly. This avoids round-trip
noise from normalized plane points changing the active slice during a drag. The existing
`oklabCoordinatePlanePoint()` and plane/keyboard point semantics are unchanged. Numeric completion
uses the same dynamic endpoints as the range. Continuous native tracks allow exact zero and
endpoints, with the shared controller retaining 0.001 arrow increments and Home/End.
Counterpart changes interrupt pending range work and numeric drafts without remounting controls.
The shared range controller installs accepted DOM bounds before writing the clamped value,
including when Vue reconciles props before patching its DOM. This keeps both thumbs stable
during coupled plane edits at the disc edge.

Render owns the a/b gradients, sampling the scalar slice with accepted L and the counterpart
fixed, through the existing OKLab-to-OKLCH serialization path and alpha convention. Gradients
are presentation only. No gamut selection, exact result, sampled boundary, clipping or mapping
determines these ranges. No a/b gamut intervals are supplied. Exact Reference warnings appear
only at truthful current thumb positions. These are internal capabilities; no public headless
API is introduced.
