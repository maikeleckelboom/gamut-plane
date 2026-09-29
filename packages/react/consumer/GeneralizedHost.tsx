import { useState } from "react";
import { createColorValue, snapshotColor } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/react";

const result = createColorValue({ space: "oklch", channels: [0.62, 0.2, 45], alpha: 0.37 });
if (!result.ok) throw new Error("Invalid generalized consumer color");
const initialColor = result.value;
const initialState: GamutPlaneState = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: [],
  referenceGamutId: null,
  visibleGuides: [],
};

/** Parent ownership is ordinary library consumption; all state controls are inside GamutPlane. */
export function GeneralizedHost() {
  const [value, setValue] = useState(initialColor);
  const [state, setState] = useState(initialState);
  return (
    <main className="generalized-host">
      <h1>Generalized instrument</h1>
      <GamutPlane value={value} onValueChange={setValue} state={state} onStateChange={setState} />
      <output data-definition={JSON.stringify(snapshotColor(value))}>
        {JSON.stringify(snapshotColor(value))}
      </output>
      <output data-generalized-state={JSON.stringify(state)}>{JSON.stringify(state)}</output>
    </main>
  );
}
