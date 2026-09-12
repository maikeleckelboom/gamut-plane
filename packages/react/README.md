# @gamut-plane/react

A private native React vertical slice: one controlled OKLCH plane with authored values, a marker, both gamut guides, pointer and keyboard editing, completion, cancellation and Canvas capability reporting. It is not a full port of the Vue instrument.

```tsx
"use client";

import { useState } from "react";
import { GamutPlane, type OklchColor } from "@gamut-plane/react";
import "@gamut-plane/react/style.css";

export function ColorEditor({ initial }: { initial: OklchColor }) {
  const [color, setColor] = useState(initial);
  return <GamutPlane value={color} onChange={setColor} />;
}
```

`value` and `onChange` are required. Optional `onCommit(value)` reports the actual completed edit, `onCancel()` reports a cancelled gesture, and `onCapability(status)` reports `pending`, `display-p3`, `srgb` or `unavailable`. The parent owns color. Equivalent cloned feedback and new callback identities are supported without memoization; different external values supersede the current gesture. Escape, pointer cancellation and capture loss roll a drag back. Unmount discards queued work silently. Arrow keys edit and complete immediately; Shift increases the step, Home/End move chroma to its limits.

The color contract matches core: finite lightness and alpha in 0–1, nonnegative finite chroma and finite hue. Rendering never clamps authored colors into a display gamut. SSR emits the instrument, labels, values, marker and SVG guides. The exported CSS reserves the square field. Canvas paints after mount, with capability initially pending. No browser resources are allocated during render; Strict Mode setup/cleanup/setup is supported.

The compiled package preserves its `"use client"` boundary. In Next.js App Router, a Server Component passes a serializable initial color to an ordinary Client Component such as `ColorEditor`. Import the stylesheet in the root layout using `import "@gamut-plane/react/style.css"`. No custom transpilation, SSR disabling, alias or manual renderer initialization is required.

```tsx
// app/page.tsx (Server Component)
import { ColorEditor } from "./colorEditor";

export default function Page() {
  return <ColorEditor initial={{ l: 0.68, c: 0.18, h: 252, alpha: 0.37 }} />;
}
```

The peer range is deliberately limited to React / React DOM 19.3.x; the tested fixture pins 19.3.0 and Next.js 16.3.4. This slice does not promise OKLab, the complete Vue channel controls, uncontrolled color, slots or expanded theming. Canvas requires client JavaScript; server rasterization and no-JavaScript interaction are not provided.

The package is unpublished. Packed consumers install `@gamut-plane/core`, `@gamut-plane/render` and this package from their tarballs. Registry installation is not verified.
