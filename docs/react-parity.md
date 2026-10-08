# React and Vue parity

Vue and React expose the same generalized instrument state: one authored `ColorValue`, a representation/editor selection, independent exact checks, independent visible-guide requests, and independent Reference gamut focus. They use core's color and geometry facts, render's resolved field/guide visuals, and UI's product policy, copy, stylesheet, and native interaction controllers. Their public syntax and lifecycle remain framework-native.

| Concern          | Vue                                                 | React                                        | Owner of shared invariant           |
| ---------------- | --------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| Color            | `v-model`                                           | `value` / `onValueChange`                    | Core definition and edit operations |
| Instrument state | `v-model:state` or `defaultState`                   | `state` / `onStateChange` or `defaultState`  | UI validation and policy            |
| Selection        | Coordinates and RGB Area selector                   | Same native controls                         | UI admission/preference and copy    |
| Inspection       | Host-selected null observation and alpha            | Same semantics                               | Core observation; UI formatting     |
| Exact checks     | Zero, one, or both                                  | Same                                         | Core analysis; UI display order     |
| Guides           | Requested independently; unavailable forms retained | Same                                         | Render resolution                   |
| Field            | Vue mounted resources                               | React committed resources                    | Core geometry; render painting      |
| Input            | Vue native controls and reactive feedback           | React native controls and committed feedback | UI controllers; core authorship     |
| SSR/hydration    | Packed Nuxt fixture                                 | Packed Next fixture                          | Framework adapter                   |

Both adapters render one fixed-axis rail and two numeric cards from geometry, with the same shared stylesheet and numeric draft controller. There is no ordinary Edit / Inspect switch. Hosts retain explicit null observation; choosing Coordinates from it requests the preferred admitted editor, and controlled rejection preserves the observation. RGB visual order follows Area rather than invariant R/G/B rows.

Both adapters keep a rejected controlled state request out of accepted presentation. A Status/Boundary/Reference-only accepted change preserves the selected editor's semantic key, active drafts, range/gesture work, and Hue reference. An accepted editor or inspection change invalidates old interaction context. Exact results display beside their gamut in sRGB then Display P3 order, independently of canonical wire order. Current copy comes from UI. Neither adapter supports the removed view/target/visibility API.

## Evidence map

| Invariant                                                               | Primary test owner          | Adapter integration                                           |
| ----------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| Representation conversion, exact gamut, authoring, geometry             | Core unit/type tests        | Representative edit and no-re-authorship assertions           |
| Field/guide form independence and geometry cache identity               | Render unit/type tests      | Field and requested-guide presentation                        |
| Admission 0/1/multiple, preferred editor, state validation, order, copy | UI unit/type tests          | Native controls and read-only/rejected state                  |
| Native range, number draft, plane gesture policy                        | UI controller tests         | Focus, callbacks, mount/disposal                              |
| React concurrency, Suspense, Strict Mode                                | React component/packed Next | React only                                                    |
| Vue reactive accepted/rejected state and mounted resources              | Vue component/packed Nuxt   | Vue only                                                      |
| Product browser, accessibility, responsive, visual                      | Standalone web suite        | Packed host smoke and React editable/inspection parity images |

The canonical screenshot matrix belongs to `apps/web`, which uses the shared stylesheet and complete reusable Vue instrument. React keeps only editable and inspection parity images in its packed Vite host. Vue packed Vite keeps a representative interaction and installed-artifact proof without another screenshot matrix. Nuxt and Next focus on their host's SSR/hydration behavior.

The two-dimensional plane retains `role="application"` because one native slider cannot express both editable axes; the role is confined to that surface. Native selection, checkboxes, ranges, and numeric controls keep their ordinary semantics. Automated axe and keyboard checks do not replace manual assistive-technology acceptance.

Phase 2N.2 shares native RGB contour and R/G/B interval composition across both adapters. Successful full/empty/degenerate slices never imply Paused. Both adapters preserve sampled Reference facts, reject incompatible spatial endpoints, retain independent exact Outside warnings, and hydrate server-rendered native contour/interval nodes in place. The mathematical matrix belongs to render; shared adapter contracts verify wiring without duplicating that oracle. Phase 2N.3 strengthens that contract with point/line contour presentation and incompatible-Reference warning assertions. The [integrated candidate record](phase-2n3-acceptance.md) records rendered inspection, retained framework sentinels and review limitations.
