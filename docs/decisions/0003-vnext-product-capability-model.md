# 0003: vNext product capability model

Status: accepted design for vNext; not implemented by Phase 2A.

## Context

[ADR 0002](0002-vnext-instrument-architecture.md) establishes one compact reusable instrument over one authored ColorValue, many representations, set-based gamut comparison and independent visual guides. The completed [Phase 1B foundation](../ui-foundation-phase-1b.md) establishes shared UI policy and preserves core/render/framework boundaries.

Current core can define and observe four representations while the adapters expose two editors. Exact gamut IDs already differ from representation IDs. Authored coordinates can exceed ordinary editor ranges, missing hue differs from numeric hue, and explicit mapping to a gamut can return a value defined in another representation. The [Phase 2A design and source audit](../vnext-product-capability-model.md) demonstrates why representation, editor, gamut, guide and output must be independent capability families.

## Decision

### Authoritative capability families

Use immutable, project-owned built-in definitions with stable IDs and explicit relationships. This is not a public runtime registry or plugin graph.

- **Core** owns technical representation/channel definitions, observation and definition authorship, editor capabilities and geometry/edit/keyboard math, exact gamut references/analysis, explicit mapping and serialization/output policies.
- **Render** owns field/guide support relations, sampled/generated visualization data, renderer algorithms, contour/gradient serialization and warning placement. It references core math without becoming color authority.
- **UI** owns user-facing labels/descriptions, presentation defaults, capability exposure/selection policy, anatomy, styles, glyphs and existing framework-neutral interaction policies. It consumes supplied technical/visual facts; it does not own conversion, analysis or mapping.
- **Adapters** own native markup, component APIs, accepted state integration, reactivity/committed lifecycle, DOM/environment/focus/capture integration, renderer resource hookup and SSR/hydration.

No universal representation descriptor owns all these responsibilities. Resolve a convenient read-only capability view at the composition boundary. Keep core free of DOM/render/framework imports, render dependent on core, and UI independent of framework runtimes. Do not add dependency edges merely to house the catalog in one package. Runtime capability objects never become consumer state.

### Representation, channels and editors

Use **representation** as the internal umbrella for an exact coordinate interpretation. Stable identity includes the technical encoding and reference context needed to interpret its coordinates. Preserve current representation ID values; a future encoding or reference-context variant must not silently reuse another interpretation's identity. Color model is classification metadata, not an inheritance hierarchy or dispatch rule.

A channel has representation-qualified identity, ordered coordinate position, unit and core domain semantics. Keep authored validity, nominal/reference ranges, geometry constraints and ordinary UI slider/numeric ranges separate. Useful editor bounds cannot narrow ColorValue validity. Preserve missing coordinates, explicitly defined powerless coordinates and signed-zero identity. Presentation fallback values cannot enter authored data, output or snapshots. Cyclic interpretation and explicit edit normalization do not redefine equality or normalize untouched authored coordinates.

An editor identifies a persistent primary editing context with its own stable identity, authoring representation and operation contract. A representation may have zero, one or several such contexts. Low-level edit operations are distinct from exposed editors: UI composes companion controls from semantic operations and channel bindings, without inventing scientific identities for different DOM input mechanisms. A callable raw channel patch does not establish a shipped unrestricted numeric editor. Geometry math stays in core. Renderer or guide support is not a prerequisite for numeric observation/authorship. Unsupported or temporarily unavailable operations are scoped results that preserve owner-specific failures, never fake geometry, invented coordinates or a global instrument failure.

### Authorship and selection

ColorValue remains the sole authored authority. Selecting a representation/editor, opening coordinates, changing guides, analyzing gamuts or copying output does not re-author it. Deliberate coordinate/geometry edits author in the selected editor's representation; explicit mapping application can replace it with the mapper's result. Derive defining representation from ColorValue rather than storing another writable copy.

Ordinary active selection is an atomic pair of observation representation ID and nullable editor ID. A non-null editor must belong to that representation and the UI/product's admitted primary-selection domain. Capability existence and technical compatibility imply neither admission nor ordinary selector exposure. Companion operations are not primary selections; host control and restoration obey the same admission policy. Editing representation is derived from the editor. Additional advanced observations do not require more independent authored or editing authorities. Show the authored-representation distinction when it differs from the editing/inspection context or otherwise affects interpretation.

Color remains parent-controlled. Selection, checked gamuts and requested guides can be controlled or locally initialized. Controlled requests do not become active until accepted; defaults initialize rather than continuously reset. Drafts, pointer state, focus, edit references and action previews remain ephemeral. Preserve Phase 1B's committed framework integration, gesture interruption, exact rollback and callback-silent disposal.

Accepting an editor/control semantic-context change invalidates ephemeral interaction state bound to its previous meaning, even within the same representation or with equal values. Rejected controlled requests retain the accepted context and its interaction. Adapters must prevent old queued work or native completion from entering a newly bound operation; value equality or DOM reuse does not establish semantic identity. This rule does not choose a controller key/remount mechanism or change Phase 1B controllers.

### Comparison, guides and directional operations

A gamut reference is a membership criterion, distinct from a representation. Apply the existing `inside | within-tolerance | outside` status independently to each requested reference. Unsupported capability or analysis failure is outside that status enum. Retain individual results/failures; an empty checked collection does not imply success.

Checked-gamut and visible-guide selections are independent immutable ID arrays with set semantics, validated IDs and deterministic canonical ordering. Guide IDs identify visual aids; render-owned support relations determine effective availability in a particular editor. Requested guide preferences can survive an unsupported editor. Guides may be visible without exact checks when their forms need only sampled geometry; forms conditioned on exact status require that separate result. Sampled data never decides exact membership.

Retire ordinary comparison's singular `boundaryTarget` in the future product model. Reserve **target/destination** for mapping or constrained output actions. A destination need not be checked or visible. Current destinations can use GamutId directly; arbitrary profile export is not established.

Mapping stays explicit with a named method, destination and outcome. Non-destructive preview, applying mapping and output-only mapping have different effects. Preview is derived action state bound to its source and request, never a second persistent selected color. A stale preview cannot be applied to a changed source. The mapping destination does not dictate the mapped value's defining representation.

Output is a separate capability family: syntax/coordinate encoding, destination constraints, mapping policy, alpha and output precision/quantization are explicit. Hex is not a representation. Copy/output-only mapping does not mutate selected color, and serialization failures cannot be replaced by sampled previews or silent clipping. Display precision is separate from output precision.

### Determinism and consumption

State crossing SSR, storage, URLs or framework boundaries contains stable IDs, canonical arrays and a versioned core color snapshot. Keep runtime functions, descriptors, resources, draft text and derived caches out of transport. Validate complete selections/requests before acceptance; unknown persisted IDs or mismatched relationships must not silently change meaning. Server/client initial resolution is deterministic and environment capability starts pending.

Pre-resolve stable active capabilities when selection/configuration changes; evaluate value-dependent availability when the accepted color changes. Keep catalog searches, large descriptor allocation and speculative ColorValue construction out of pointer/sampling hot paths. Preserve existing numeric scratch, scheduling and field invalidation discipline. New capabilities do not force eager loading of all future visualization data.

## Consequences

Components consume structured capabilities and scoped outcomes rather than accumulating representation-specific branches. Owner-local definitions and explicit relation checks require more discipline than one convenient descriptor, but preserve scientific authority, explain unsupported combinations, and allow incremental addition of observation, editors, gamut analysis, guides and output.

This decision requires a future explicit migration of the closed view/plane and per-gamut visibility APIs. It does not change them now. Keep migration details, rejected alternatives, concrete pseudo-types and the bounded Phase 2B recommendation in the [design document](../vnext-product-capability-model.md). Future Svelte/vanilla adapters can consume the same plain facts and policies without importing Vue/React concepts.

## Relationship to earlier decisions

ADR 0001 remains authoritative for current two-plane behavior. ADR 0002's product direction and Phase 1B's completed ownership remain intact. This ADR resolves their open capability identity, layering and state-separation questions; it does not reopen the shared controllers or adopt a visual redesign, public plugin API, new representations, Zag, Open Props, additional adapters or a new persistence API.

## Phase 2L amendment: Reference gamut focus

Phase 2L adds `referenceGamutId: GamutId | null` to the public view state after the original decision. Reference is independent semantic focus on a product-admitted gamut. It implies neither exact checks nor visible guides. UI owns admission; render owns an explicit primary gamut-to-guide mapping. A requested guide may provide a sampled Reference fact without a valid spatial projection; no constrained endpoint is presented as the sample. Spatial feedback is limited to boundary excursions and suppressed by accepted exact Inside/Within tolerance. Only an accepted, explicitly requested exact outside result for Reference warns. Inspection or projection unavailability does not invalidate the preference, and Reference is excluded from edit semantic-context identity. The composed default requests both shipped checks and boundaries with sRGB Reference; controlled requests remain authoritative.
