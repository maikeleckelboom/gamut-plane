# Architecture

Gamut Plane has one public instrument state route in Vue and React. The authored `ColorValue` is controlled separately from instrument state. Instrument state contains exactly `selection`, `checkedGamuts`, and `visibleGuides`. Selection changes, exact checks, and sampled visual guides observe the authored color; only an edit creates a new `ColorValue`.

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

Core can define a technical editor and geometry without admitting that editor to the public product. UI validates public selection against an explicit admission list. The preferred editor initializes a representation selection only when admitted; an explicit valid `editorId` remains authoritative. An explicit `null` selects inspection. A representation can have zero, one, or several admitted editors. The current product has one for OKLCH (`oklch-lc`), one for OKLab (`oklab-ab`), and zero for sRGB and Display P3. The color-space context shows one Edit color checkbox when an editor is available and an inspection label otherwise. Its context row can admit an Area choice when a real second editor ships.

`GeometryId` is separate from `RepresentationId`. Every geometry declares its representation, X/Y/fixed channel bindings, directions, domain, projection, point conversion, containment, constraint, keyboard behavior, and fixed sampling policy. The shipped OKLCH rectangle binds X=`oklch.c`, Y=`oklch.l`, fixed=`oklch.h`; the OKLab disc binds X=`oklab.a`, Y=`oklab.b`, fixed=`oklab.l`. Projection facts carry both representation and geometry identity. Field resolution and renderer cache keys use the selected geometry identity, not representation alone. Pointer and keyboard edits call the selected editor's operation; companion controls use declared operation IDs. A test-only OKLCH H/C editor with fixed Lightness proves a second geometry for the same representation without adding a public product capability.

## Product behavior

Checks and guides are independent sets. The locally owned product default shows both sampled boundaries without requesting exact checks; an explicit state can request zero, one, or both of either. Canonical state arrays use stable ID order; exact results display in explicit product order: sRGB, then Display P3. Guides are sampled reference geometry and never exact gamut truth. Inspection has no fake editing plane. A requested guide remains in state when it cannot currently render and can reappear after returning to an editor. Unavailable observation, field, guide forms, and exact results retain their own meanings. Neither selection nor comparison changes map or reauthor color.

The shared UI package owns repeated labels, messages, and inspection formatting. Adapters own semantic markup and lifecycle. The standalone app hosts the same instrument beside a secondary CSS/output demonstration; it does not repeat the instrument's coordinates or requested gamut results. The shared stylesheet keeps the instrument in one vertical composition, caps its width at 480px, and adapts within narrower hosts. The host can set `--gamut-plane-accent`.

## Interaction lifecycle

There is one parent-owned color. Numeric inputs keep draft text locally until Enter, native change, or blur; Escape discards a draft. Pointer and range work coalesce in RAF while the final value publishes synchronously before commit. Plane Escape restores the exact gesture origin. A replacement authored definition or accepted editor/inspection switch interrupts pending work without reinterpreting points through another geometry. A rejected controlled state request leaves the old context active. Check/guide-only accepted changes leave the semantic context, numeric draft, Hue reference, active gesture, and pending range work intact. Unmount disposes queued work without consumer callbacks.

Vue and React use the same UI controllers but own their framework-specific committed setup and callback bridge. Vue uses VueUse for mounted resize and browser resource integration. React uses committed refs and effects; concurrent render, Suspense, and Strict Mode must not promote abandoned work to native authority. Canvas capability describes the granted context, not display hardware or exact gamut membership. The server renders controls, values, marker, requested SVG guides, and reserved geometry; browser resources begin after mount.

## Validation ownership

Core tests own science and typed geometry/operation contracts. Render tests own field/guide forms and geometry-keyed caches. UI tests own admission, state, order, copy, and controller policies. Adapter tests own native composition and framework lifecycle; shared semantics use a common contract where useful. The standalone web suite owns full product browser, accessibility, responsive, and visual references. Packed Vue/Vite and React/Vite prove installed artifacts and a representative interaction; packed Nuxt and Next prove SSR/hydration, with Next root Strict Mode. See [Testing](testing.md) and the [React parity map](react-parity.md).

Mapping, output workflows, a new shipped editor/representation, plugin registration, and a compact vNext redesign are outside the current instrument API.
