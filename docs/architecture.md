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

The render `internal/current` entry and UI current-editor helpers integrate the eight shipped editors. They have live generalized responsibilities; they do not implement another public product route. Internal capability entries are sibling-package contracts, not application imports.

## Editor selection and geometry

The relationship is:

```text
representation → admitted editors → preferred editor → selected editor → geometry → operation
```

Core can define a technical editor and geometry without admitting that editor to the public product. UI validates public selection against an explicit admission list. The preferred editor initializes a representation selection only when admitted; an explicit valid `editorId` remains authoritative. An explicit `null` selects inspection in every representation. The current product has one editor for OKLCH (`oklch-lc`), one for OKLab (`oklab-ab`), and three each for sRGB and Display P3. Coordinates is a select-only combobox with a single-select listbox. Its trigger and selected check follow accepted state; a highlighted candidate is ephemeral. Choosing the current representation is a no-op, including explicit inspection. Changing Coordinates uses the destination's preferred admitted editor. Edit/Inspect uses native radio semantics derived from `selection.editorId`. Area uses the same selector while editing RGB: closed labels are R / G, R / B and G / B; open options identify the fixed channel, and accessible descriptions name horizontal, vertical and fixed channels. Returning from Inspect chooses the preferred editor, without editor history.

`GeometryId` is separate from `RepresentationId`. Every geometry declares its representation, X/Y/fixed channel bindings, directions, domain, projection, point conversion, containment, constraint, keyboard behavior, and fixed sampling policy. The shipped OKLCH rectangle binds X=`oklch.c`, Y=`oklch.l`, fixed=`oklch.h`; the OKLab disc binds X=`oklab.a`, Y=`oklab.b`, fixed=`oklab.l`. Projection facts carry both representation and geometry identity. Field resolution and renderer cache keys use the selected geometry identity, not representation alone. Pointer and keyboard edits call the selected editor's operation; companion controls use declared operation IDs. A test-only OKLCH H/C editor with fixed Lightness proves a second geometry for the same representation without adding a public product capability.

Phase 2N.0 defines three encoded-RGB rectangles each for sRGB and Display P3: R/G at fixed B, R/B at fixed G, and G/B at fixed R. Each Area has its own editor, geometry and point operation. Phase 2N.1 explicitly admits all six, preferring `srgb-rg` and `display-p3-rg`. Core's `editorsByRepresentation` records technical existence; product admission, preferred initialization, UI metadata, fields and guides remain separate. The [native RGB contracts](vnext-product-capability-model.md#native-rgb-contracts-phase-2n0) specify the six bindings and remaining guide work.

Native RGB geometry observes the selected representation directly through `represent()`. Raw projection and `toPoint`/`fromPoint` retain extended coordinates: screen X is the X channel and screen Y is one minus the Y channel. Domain membership is independent, and every finite fixed coordinate defines a valid slice. An explicit point operation first validates a finite point and constrains it to the nominal closed unit square, then authors exactly the two varying channels. Raw channel patches accept finite extended values. Both operations define the result in the selected encoded RGB space and preserve observed untouched coordinates and alpha, except an explicitly requested supported alpha edit. No intermediate OKLCH observation, mapping, rounding or hidden clipping is required. The legacy public two-plane API is unchanged; these operations belong to the internal core capability contract.

Render's explicit field support includes both perceptual samplers and six render-owned native RGB samplers. RGB samples retain their selected encoded space through opaque Canvas fields, marker colors and scalar gradients; sampling neither authors a ColorValue nor converts to OKLCH. The discriminated editable detail composes directly from a successful selected RGB observation, independently of OKLCH observation or exact-analysis failure. Hue edit-reference bookkeeping belongs only to the perceptual editors. Field cache identity includes selected geometry/sampler, actual fixed coordinate, dimensions, DPR, granted Canvas space and quality. Varying-coordinate or Status/Boundary/Reference changes do not repaint an unchanged slice.

All six RGB editors explicitly support both gamut guides. Render intersects the target linear RGB cube with the actual fixed-channel plane, approximates encoded boundary curves with a certified bounded error, and independently resolves native channel intervals. Full, partial, empty and degenerate successes remain distinct from unsupported or unavailable forms; only actual inability to resolve/present a Boundary causes Paused. Core exposes a narrow internal conversion bridge using its existing library, without a transitive render dependency. UI validates identity-only known-editor facts and imports neither runtime core math nor render. See [native RGB guide ownership and numerics](native-rgb-guides.md).

UI's shared `authoredMarkerPoint` policy uses raw RGB projection in declarative markup, initialization, imperative restoration, resize, reconciliation and lifecycle replay. Pointer/keyboard actions remain constrained, and a bounded preview may appear during a gesture. Cancellation or controlled rejection restores the accepted raw projection, even without a host rerender. Surface clipping can hide an extended marker; accessible overflow copy explains numeric recovery. OKLab's accepted edge-marker policy and OKLCH behavior remain unchanged.

## Product behavior

Checks and guides are independent sets. The locally owned product default requests both exact statuses and both sampled boundaries, with sRGB as Reference; an explicit state can request zero, one, or both of either. Canonical state arrays use stable ID order; exact results display in explicit product order: sRGB, then Display P3. Guides are sampled reference geometry and never exact gamut truth. Inspection has no fake editing plane. A requested guide remains in state when it cannot currently render and can reappear after returning to an editor. Unavailable observation, field, guide forms, and exact results retain their own meanings. Neither selection nor comparison changes map or reauthor color.

Core representation capability definitions declare `associatedGamutId`: null for OKLCH/OKLab, sRGB gamut for sRGB, and Display P3 gamut for Display P3. This technical relationship does not constrain coordinate validity or request any work. UI `coordinatesOptions` projects passive badges only from explicitly checked, accepted exact rows. Unchecked and unassociated options have no badge; failed requested analysis is Unavailable. The popup never runs analysis or caches old results.

The shared UI package owns repeated labels, messages, and inspection formatting. Adapters own semantic markup and lifecycle. The standalone app hosts the same instrument beside a secondary CSS/output demonstration; it does not repeat the instrument's coordinates or requested gamut results. The shared stylesheet keeps the instrument in one vertical composition, caps its width at 480px, and adapts within narrower hosts. The host can set `--gamut-plane-accent`.

## Reference focus

`referenceGamutId: GamutId | null` is independent semantic focus, admitted by `admittedReferenceGamuts` in UI `instrumentState.ts`. Only sRGB, Display P3 and null are accepted. Unknown or non-admitted Reference IDs reject the full state; technical capability existence never implies product admission. Choosing Reference does not request analysis or a boundary, and disabling either request does not clear Reference. Controlled state remains authoritative.

Render `capabilities/guideSupport.ts` owns the explicit `referenceGuidePolicy`: sRGB gamut to sRGB boundary; Display P3 gamut to Display P3 boundary. Render owns `GuideId`, so this introduces no UI-to-render dependency. `current/referenceDisplay.ts` borrows the requested guide's `forms.reference` fact, including boundary color, maximum chroma and delta. It projects that sample with the selected geometry's point math. `spatial.kind: "unavailable"` retains the sampled fact while suppressing both connector and marker for missing field support, unsupported geometry, nonfinite projection or an endpoint outside the editing domain. It never constrains the Reference endpoint. RGB spatial Reference additionally requires converted fixed-channel compatibility within a dedicated `1e-7` encoded-coordinate tolerance, justified against conversion noise including transfer junctions. Connector origins use the raw RGB authored-point policy; incompatible endpoints retain sampled facts and independent exact warnings.

The connector and sampled boundary marker are a contextual out-of-gamut excursion annotation, not passive Reference geometry. `showExcursion` requires the selected Reference gamut's explicitly requested, accepted exact result to be `outside`. Both annotations render only when the explicitly mapped Boundary is also requested, its sampled Reference form is available, and its endpoint projects truthfully into the active editor geometry. Exact analysis determines whether an excursion is applicable; the sampled guide supplies the approximate endpoint. Inside, within-tolerance, unavailable and unchecked statuses produce neither annotation. Ordinary requested boundaries and slider intervals remain visible independently, and Reference selection persists. `PickerGuide.deltaC` retains sampled outward excursion information; it is neither a membership/visibility criterion nor a general distance-to-boundary metric. No hidden checks are introduced.

Shared UI `referenceWarning` consumes only the accepted revision's explicitly requested exact rows. Only `outside` for the selected Reference warns; `inside`, `within-tolerance`, unavailable and absent checks do not. Boundary visibility never controls this warning. Plane and range feedback use the same small triangle. The plane prefers above-right of the active marker with a clear gap, falling back to another diagonal when field space requires it. Existing surface measurements and live marker positioning own that placement. Range feedback uses a meaningful in-range thumb position. Extended scalar coordinates have no fabricated positional glyph. Accessible warnings name the gamut and remain available when an RGB marker is clipped or spatial Reference is unavailable.

Inspection preserves Reference, checks and requested guides without constructing a field. Returning to an editor can restore an applicable excursion annotation. Sampled Guide C/delta values stay structured and have no permanent result panel.

## Gamuts shell

Gamuts is progressive disclosure. A normal button named Gamuts opens a nonmodal, anchored popup (`role="dialog"`, not a listbox or menu) of ordinary native controls. Rows group by gamut in product display order: the gamut name with its exact status, then independent Status and Boundary checkboxes. One Reference radio group follows: sRGB, Display P3 or None. Status, Boundary and Reference remain independent state dimensions. Each change applies immediately through the shared `requestGamutAction`, built from the latest accepted state; there is no Apply or transactional Cancel, and closing never undoes an accepted change. A rejected controlled request leaves every native control at accepted state. Controlled state without an update handler still opens for inspection, with disabled controls and a Read-only note; color editing stays available.

Only `checkedGamuts` requests exact analysis. Opening Gamuts requests no state and runs no analysis. An unchecked gamut reads Status off, never a retained or inferred result; a failed requested check reads Unavailable, distinct from Outside. The closed trigger is Reference-first: `Reference <gamut> · <status>` or No Reference, plus a bounded count of other explicitly checked gamuts that are Outside (`1 other outside`, or `2 outside` without a Reference). Its accessible description is one punctuated sentence from the same shared policy. Its height does not change with the status while editing. A requested Boundary stays selected while the current view cannot draw it, such as during inspection, and is marked Paused with an accessible explanation; it draws again when an editor can render it.

UI `gamutShell.ts` owns row facts, summary derivation, Reference choices, paused copy and state actions, so adapters render markup only and accelerators reuse the same actions. `gamutInteraction.ts` owns the mounted surface: native Popover in the top layer with the trigger as `source`, instrument ancestry for tokens and styles, trigger-width placement, and document/window listeners only while open. Opening keeps focus on the trigger; the surface follows it in tab order without a focus trap. Escape and Close return focus to the trigger without reaching an outer host or the plane. Outside pointer or focus dismissal keeps the user's target focus, and leaving by Tab closes the surface. A trigger press that light-dismissed the surface does not reopen it. `shellPopup.ts` keeps at most one instrument-owned popup per root across Coordinates, Area, Gamuts and the plane context menu; replacement only closes. Opening is refused while a plane or range pointer gesture is active. Popup state is ephemeral and never enters `GamutPlaneState`.

The editable plane's compact context menu is an accelerator over the canonical Gamuts inspector. Right-click, ContextMenu and Shift+F10 use the browser's single `contextmenu` path. Pointer invocation anchors at the event's viewport coordinates; keyboard invocation uses the plane center. A manual top-layer Popover leaves dismissal to the controller, preventing native mouseup light-dismiss on platforms that emit `contextmenu` during mousedown. The overlay clamps inside the viewport and adds no closed layout height. There is no touch long-press recognition. Active pointer ownership blocks invocation without finishing, cancelling or queueing work. Chromium's secondary mouse-button transitions during a primary drag are ignored by the plane controller because those `pointermove` events express context-menu intent rather than a new plane point.

`gamutContextMenu.ts` projects the same `gamutRows` and `referenceChoices` into Reference, Boundary and Status groups: three menu radio commands and four menu checkbox commands, with accepted exact status and Paused descriptions. The mounted `gamutContextMenuInteraction.ts` reads current accepted actions at activation and calls the adapter's existing `requestGamutAction` route. It owns no color, analysis or persistent state. Vue renders native buttons; React publishes its callback/facts bridge only after commit. Both server-render hidden markup and dispose native listeners on unmount. Rejected requests close normally and remain rejected when reopened. Read-only state still opens for inspection with focusable `aria-disabled` items and no state requests; color editing remains available.

The menu moves focus to the selected Reference, uses one roving item across the seven commands, and supports ArrowUp/Down, Home/End, Enter/Space and Escape. Activation or Escape closes and restores the invoking plane; the first Escape cannot reach an enclosing dialog/popover. Tab and Shift+Tab close and continue in normal document order from the plane. Outside pointer dismissal preserves the clicked target's focus. Opening or replacing either gamut shell surface runs no hidden analysis, and ordinary numeric blur may complete a draft once under the existing input contract.

## Interaction lifecycle

There is one parent-owned color. Numeric inputs keep draft text locally until Enter, native change, or blur; Escape discards a draft. Pointer and range work coalesce in RAF while the final value publishes synchronously before commit. Plane Escape restores the exact gesture origin. A replacement authored definition or accepted editor/inspection switch interrupts pending work without reinterpreting points through another geometry. A rejected controlled state request leaves the old context active. Status/Boundary/Reference-only accepted changes leave the semantic context, numeric draft, Hue reference, active gesture, and pending range work intact. Unmount disposes queued work without consumer callbacks.

The selector controller owns per-instance open/candidate/typeahead state below accepted color resolution. Native Popover moves the surface to the top layer while retaining instrument ancestry and tokens; nested host invoker relationships are preserved. Focus remains on the combobox. Escape closes only the selector, Tab proceeds normally, and outside dismissal never applies a candidate. Mounted plane/range controllers expose pointer ownership so a selector cannot steal an active gesture. Ordinary numeric blur completes a draft in the old context before a selection request.

Direct controls use a shared 32px technical notation rail: OKLCH exposes H/L/C, OKLab exposes L/a/b and every RGB Area exposes R/G/B, with the label above the track and numeric value on the right. The native input and all intervals/warnings remain inside the actual track box. Intrinsic wrapping adapts the context row to allocated host width; DOM order and the 480px maximum remain stable.

Vue and React use the same UI controllers but own their framework-specific committed setup and callback bridge. Vue uses VueUse for mounted resize and browser resource integration. React uses committed refs and effects; concurrent render, Suspense, and Strict Mode must not promote abandoned work to native authority. Canvas capability describes the granted context, not display hardware or exact gamut membership. The server renders controls, values, marker, requested SVG guides, and reserved geometry; browser resources begin after mount.

## Validation ownership

Core tests own science and typed geometry/operation contracts. Render tests own field/guide forms and geometry-keyed caches. UI tests own admission, state, order, copy, and controller policies. Adapter tests own native composition and framework lifecycle; shared semantics use a common contract where useful. The standalone web suite owns full product browser, accessibility, responsive, and visual references. Packed Vue/Vite and React/Vite prove installed artifacts and a representative interaction; packed Nuxt and Next prove SSR/hydration, with Next root Strict Mode. See [Testing](testing.md) and the [React parity map](react-parity.md).

Mapping, output workflows, new representations, plugin registration, and a compact vNext redesign are outside the current instrument API. Phase 2N.2 supplies native RGB gamut slices, channel intervals and conditionally compatible Reference conversion. Integrated closeout and test-debt review remain deferred to 2N.3.

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
an accessible recovery explanation. OKLab domain and unavailable-slice explanations are
visually hidden descriptions associated with the controls, never permanent help paragraphs.
The plane can still author an in-domain point.

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

RGB direct controls always use Red, Green, Blue order, independently of Area. Slider bounds are normalized `[0,1]`; separate numeric bounds accept every finite value. Both use step 0.001 and display precision 4 without passive rounding or authorship. Extended values retain their actual numeric/authored coordinate while the slider thumb presents its nominal endpoint with an overflow description. Extended siblings and fixed coordinates never disable scalar editing. Native channel patches observe the selected representation, preserve the other two observed channels and alpha, and use operation-context reconciliation without depending on comparisons. Native gradients hold both actual sibling coordinates fixed and use opaque presentation. Editing the fixed plane channel redraws that slice; varying-channel edits leave it cached.
