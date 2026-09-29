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

Core can define a technical editor and geometry without admitting that editor to the public product. UI validates public selection against an explicit admission list. The preferred editor initializes a representation selection only when admitted; an explicit valid `editorId` remains authoritative. An explicit `null` selects inspection. A representation can have zero, one, or several admitted editors. The current product has one for OKLCH (`oklch-lc`), one for OKLab (`oklab-ab`), and zero for sRGB and Display P3. The Coordinates context shows one Edit color checkbox when an editor is available and an inspection label otherwise. Its context row can admit an Area choice when a real second editor ships.

`GeometryId` is separate from `RepresentationId`. Every geometry declares its representation, X/Y/fixed channel bindings, directions, domain, projection, point conversion, containment, constraint, keyboard behavior, and fixed sampling policy. The shipped OKLCH rectangle binds X=`oklch.c`, Y=`oklch.l`, fixed=`oklch.h`; the OKLab disc binds X=`oklab.a`, Y=`oklab.b`, fixed=`oklab.l`. Projection facts carry both representation and geometry identity. Field resolution and renderer cache keys use the selected geometry identity, not representation alone. Pointer and keyboard edits call the selected editor's operation; companion controls use declared operation IDs. A test-only OKLCH H/C editor with fixed Lightness proves a second geometry for the same representation without adding a public product capability.

## Product behavior

Checks and guides are independent sets. The locally owned product default requests both exact statuses and both sampled boundaries, with sRGB as Reference; an explicit state can request zero, one, or both of either. Canonical state arrays use stable ID order; exact results display in explicit product order: sRGB, then Display P3. Guides are sampled reference geometry and never exact gamut truth. Inspection has no fake editing plane. A requested guide remains in state when it cannot currently render and can reappear after returning to an editor. Unavailable observation, field, guide forms, and exact results retain their own meanings. Neither selection nor comparison changes map or reauthor color.

The shared UI package owns repeated labels, messages, and inspection formatting. Adapters own semantic markup and lifecycle. The standalone app hosts the same instrument beside a secondary CSS/output demonstration; it does not repeat the instrument's coordinates or requested gamut results. The shared stylesheet keeps the instrument in one vertical composition, caps its width at 480px, and adapts within narrower hosts. The host can set `--gamut-plane-accent`.

## Reference focus

`referenceGamutId: GamutId | null` is independent semantic focus, admitted by `admittedReferenceGamuts` in UI `instrumentState.ts`. Only sRGB, Display P3 and null are accepted. Unknown or non-admitted Reference IDs reject the full state; technical capability existence never implies product admission. Choosing Reference does not request analysis or a boundary, and disabling either request does not clear Reference. Controlled state remains authoritative.

Render `capabilities/guideSupport.ts` owns the explicit `referenceGuidePolicy`: sRGB gamut to sRGB boundary; Display P3 gamut to Display P3 boundary. Render owns `GuideId`, so this introduces no UI-to-render dependency. `current/referenceDisplay.ts` borrows the requested guide's `forms.reference` fact, including boundary color, maximum chroma and delta. It projects that sample with the selected geometry's point math. `spatial.kind: "unavailable"` retains the sampled fact while suppressing both connector and marker for missing field support, unsupported geometry, nonfinite projection or an endpoint outside the editing domain. It never constrains the Reference endpoint. Active-color marker constraint behavior is unchanged.

Spatial Reference feedback is shown only for a positive sampled boundary excursion (`showSpatial`). An accepted exact Inside or Within tolerance result also suppresses it. With Status disabled, that presentation decision uses only the sampled excursion and makes no exact membership claim. The sampled fact and projection remain available independently of visibility. No hidden checks are introduced.

Shared UI `referenceWarning` consumes only the accepted revision's explicitly requested exact rows. Only `outside` for the selected Reference warns; `inside`, `within-tolerance`, unavailable and absent checks do not. Boundary visibility never controls this warning. Plane and range feedback use the same small triangle. The plane prefers above-right of the active marker with a clear gap, falling back to another diagonal when field space requires it. Existing surface measurements and live marker positioning own that placement. Range feedback uses a meaningful in-range thumb position. Numeric-only coordinates have no fabricated positional glyph. Accessible warnings name the gamut.

Inspection preserves Reference, checks and requested guides without constructing a field. Returning to an editor can restore the sampled spatial feedback. The per-gamut disclosure uses native Status/Boundary checkboxes and one Reference radio group (including No Reference); requested exact states remain associated with their gamut. Sampled Guide C/delta values stay structured and have no permanent result panel.

## Interaction lifecycle

There is one parent-owned color. Numeric inputs keep draft text locally until Enter, native change, or blur; Escape discards a draft. Pointer and range work coalesce in RAF while the final value publishes synchronously before commit. Plane Escape restores the exact gesture origin. A replacement authored definition or accepted editor/inspection switch interrupts pending work without reinterpreting points through another geometry. A rejected controlled state request leaves the old context active. Status/Boundary/Reference-only accepted changes leave the semantic context, numeric draft, Hue reference, active gesture, and pending range work intact. Unmount disposes queued work without consumer callbacks.

Vue and React use the same UI controllers but own their framework-specific committed setup and callback bridge. Vue uses VueUse for mounted resize and browser resource integration. React uses committed refs and effects; concurrent render, Suspense, and Strict Mode must not promote abandoned work to native authority. Canvas capability describes the granted context, not display hardware or exact gamut membership. The server renders controls, values, marker, requested SVG guides, and reserved geometry; browser resources begin after mount.

## Validation ownership

Core tests own science and typed geometry/operation contracts. Render tests own field/guide forms and geometry-keyed caches. UI tests own admission, state, order, copy, and controller policies. Adapter tests own native composition and framework lifecycle; shared semantics use a common contract where useful. The standalone web suite owns full product browser, accessibility, responsive, and visual references. Packed Vue/Vite and React/Vite prove installed artifacts and a representative interaction; packed Nuxt and Next prove SSR/hydration, with Next root Strict Mode. See [Testing](testing.md) and the [React parity map](react-parity.md).

Mapping, output workflows, a new shipped editor/representation, plugin registration, and a compact vNext redesign are outside the current instrument API.
