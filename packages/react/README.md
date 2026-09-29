# @gamut-plane/react

A native React instrument for one authored `ColorValue`. It selects the OKLCH lightness/chroma editor or the OKLab a/b editor, and can inspect OKLCH, OKLab, sRGB, or Display P3 without editing. Exact gamut checks and sampled guides are independent requests. This package is private and unpublished.

## Component API

```tsx
"use client";

import { useState } from "react";
import { GamutPlane, type ColorValue, type GamutPlaneState } from "@gamut-plane/react";
import "@gamut-plane/react/style.css";

export function ColorEditor({ initial }: { initial: ColorValue }) {
  const [color, setColor] = useState(initial);
  const [state, setState] = useState<GamutPlaneState>({
    selection: { representationId: "oklch", editorId: "oklch-lc" },
    checkedGamuts: [],
    visibleGuides: ["display-p3-boundary", "srgb-boundary"],
  });
  return (
    <GamutPlane value={color} onValueChange={setColor} state={state} onStateChange={setState} />
  );
}
```

| Prop                        | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `value`, `onValueChange`    | Required controlled defining color and live edit callback.                          |
| `state`, `onStateChange`    | Controlled selection, checks, and guides. A missing callback makes state read-only. |
| `defaultState`              | Initializes locally owned instrument state once.                                    |
| `onValueCommit`, `onCancel` | Edit completion and cancelled gesture/draft notifications.                          |
| `onCanvasColorSpaceChange`  | Granted Canvas context: `pending`, `display-p3`, `srgb`, or `unavailable`.          |
| `legend`                    | Host content below the field.                                                       |

Native `section` props, `className`, `style`, and `ref` are supported without overriding owned semantics. Import `GamutPlaneProps`, `GamutPlaneSelection`, `GamutPlaneGamutId`, and `GamutPlaneGuideId` when needed. The supported CSS customization is `--gamut-plane-accent`; import the stylesheet once.

The default local state selects `oklch-lc` with both sampled boundaries visible and no exact checks. State is a complete atomic object. A request to `onStateChange` is frozen and canonical; the component displays it only when the parent accepts it. An instance keeps its initial controlled or local ownership mode. Invalid IDs or shapes fail clearly. Explicit empty arrays remain empty.

The public product admits `oklch-lc` for OKLCH and `oklab-ab` for OKLab. Each also allows `editorId: null` for inspection. sRGB and Display P3 are inspection only. An admitted editor is distinct from technical capability existence; the component never exposes an unadmitted editor merely because its geometry exists. The preferred editor is used only when choosing a default, never to replace a valid explicit choice. The compact UI shows an Edit color checkbox when a representation has an admitted editor; a multi-editor choice can join the context row when one is shipped.

Checks and guides can each request zero, one, or both gamuts. Exact results display sRGB then Display P3; the canonical state arrays may use a different order. A guide preference remains selected in inspection and can reappear when an editor is selected. Unavailable observation, editor, and exact facts are shown in their own regions. Inspection retains signed zero and missing Hue, uses locale-independent nine-significant-digit formatting, and never reauthors color.

## Editing and lifecycle

The parent owns the immutable `ColorValue`, created through `@gamut-plane/core`. Selecting a representation, editor, check, or guide only observes that value. A deliberate edit emits a new value defined in the selected editor, preserving alpha. Out-of-display-gamut coordinates are not mapped or clamped. The Chroma numeric field may exceed its slider range; a hue-less neutral needs a real Hue edit before chromatic OKLCH editing.

Pointer and range updates are coalesced per frame. Native number inputs keep drafts locally until completion. A defining-equal parent reconstruction acknowledges active work. A replacement color or accepted editor switch interrupts it; rejected state requests and check/guide-only changes keep the active editor context. Plane cancellation restores the origin. `onValueCommit` follows the final `onValueChange`.

## SSR and Next

The ESM entry preserves `"use client"` and imports without browser globals. Use `snapshotColor` on the server and `restoreColor` in a Client Component when passing color across a Server Component boundary. Import `@gamut-plane/react/style.css` through normal root CSS. Server HTML contains controls, values, marker, SVG guides when requested, and reserved field geometry; Canvas work begins after mount. Hydration and root Strict Mode do not publish edits. Separate React roots sharing a document need distinct matching server/client `identifierPrefix` values.

React and React DOM 19.3.x are the peer policy. Packed Vite and Next checks install private tarballs; they do not prove registry installation. See the [repository installation guide](../../README.md#install-local-packages), [testing guide](../../docs/testing.md), and [parity map](../../docs/react-parity.md).
