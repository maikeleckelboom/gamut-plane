"use client";

import { useEffect, useState } from "react";
import { restoreColor, snapshotColor, type ColorSnapshotV1 } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/react";

const initialState: GamutPlaneState = {
  selection: { representationId: "srgb", editorId: "srgb-rg" },
  checkedGamuts: ["srgb-gamut"],
  referenceGamutId: null,
  visibleGuides: ["srgb-boundary"],
};

export function GeneralizedHost({ initial }: { initial: ColorSnapshotV1 }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const [value, setValue] = useState(() => {
    const restored = restoreColor(initial);
    if (!restored.ok) throw new Error("Invalid generalized Next snapshot");
    return restored.value;
  });
  const [state, setState] = useState(initialState);
  return (
    <div
      data-generalized-host
      data-generalized-hydrated={hydrated ? "true" : undefined}
      style={{ width: "min(440px, 100%)" }}
    >
      <GamutPlane value={value} onValueChange={setValue} state={state} onStateChange={setState} />
      <output data-definition={JSON.stringify(snapshotColor(value))}>
        {JSON.stringify(snapshotColor(value))}
      </output>
    </div>
  );
}
