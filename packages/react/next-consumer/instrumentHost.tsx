"use client";

import React, { useState } from "react";
import {
  createColorValue,
  definitionOf,
  represent,
  restoreColor,
  snapshotColor,
  type ColorSnapshotV1,
  type ColorValue,
} from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/react";
import { useEvents } from "./eventsProvider";

function observedReadout(value: ColorValue) {
  const result = represent(value, "oklch");
  if (!result.ok) throw new Error("Cannot observe Next consumer color");
  const [l, c, h] = result.value.channels;
  return { l, c, h, alpha: result.value.alpha };
}

export function InstrumentHost({
  initial,
  hidden = false,
  narrow = false,
}: {
  initial: ColorSnapshotV1;
  hidden?: boolean;
  narrow?: boolean;
}) {
  const [colors, setColors] = useState<ColorValue[]>(() => {
    const first = restoreColor(initial);
    if (!first.ok) throw new Error("Invalid Next consumer snapshot");
    const observed = represent(first.value, "oklch");
    if (!observed.ok) throw new Error("Cannot observe Next consumer snapshot");
    const second = createColorValue({
      space: "oklch",
      channels: [0.43, observed.value.channels[1], 120.25],
      alpha: observed.value.alpha,
    });
    if (!second.ok) throw new Error("Invalid Next consumer snapshot");
    return [first.value, second.value];
  });
  const [isHidden, setHidden] = useState(hidden);
  const [isNarrow, setNarrow] = useState(narrow);
  const [mounted, setMounted] = useState(true);
  const [completion, setCompletion] = useState(true);
  const [renderCount, rerender] = useState(0);
  const record = useEvents();
  const [states, setStates] = useState<GamutPlaneState[]>([
    {
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    },
    {
      selection: { representationId: "oklab", editorId: "oklab-ab" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    },
  ]);
  return (
    <div>
      <button onClick={() => setHidden(!isHidden)}>Toggle visibility</button>
      <button onClick={() => setNarrow(!isNarrow)}>Resize hosts</button>
      <button onClick={() => setMounted(!mounted)}>Toggle mount</button>
      <button onClick={() => rerender(renderCount + 1)}>Rerender parent</button>
      <button
        onClick={() =>
          setColors((values) =>
            values.map((value) => {
              const rebuilt = createColorValue(definitionOf(value));
              if (!rebuilt.ok) throw new Error("Invalid controlled color");
              return rebuilt.value;
            }),
          )
        }
      >
        Clone colors
      </button>
      <button
        onClick={() =>
          setColors((values) => {
            const replacement = createColorValue({
              space: "oklch",
              channels: [0.21, 0.31, 82],
              alpha: 0.63,
            });
            if (!replacement.ok) throw new Error("Invalid replacement color");
            return [replacement.value, values[1]!];
          })
        }
      >
        Replace first
      </button>
      <button onClick={() => setCompletion(!completion)}>Toggle completion callback</button>
      <output data-parent-render>{renderCount}</output>
      {mounted &&
        colors.map((color, index) => (
          <div
            key={index}
            data-host={index === 0 ? "first" : "second"}
            style={{
              width: isNarrow ? 280 : 760,
              maxWidth: "100%",
              display: isHidden ? "none" : undefined,
            }}
          >
            <GamutPlane
              state={states[index]!}
              onStateChange={(next) =>
                setStates((previous) =>
                  previous.map((state, position) => (position === index ? next : state)),
                )
              }
              legend={<p data-legend>Host boundary legend</p>}
              value={color}
              onValueChange={(next) => {
                setColors((values) =>
                  values.map((value, position) => (position === index ? next : value)),
                );
                record("changes");
              }}
              onValueCommit={completion ? (next) => record("commits", next) : undefined}
              onCancel={() => record("cancels")}
            />
            <output data-color data-definition={JSON.stringify(snapshotColor(color))}>
              {JSON.stringify(observedReadout(color))}
            </output>
          </div>
        ))}
    </div>
  );
}
