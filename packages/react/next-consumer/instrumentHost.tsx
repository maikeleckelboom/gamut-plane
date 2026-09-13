"use client";

import React, { useState } from "react";
import { GamutPlane, type GamutPlaneView, type OklchColor } from "@gamut-plane/react";
import { useEvents } from "./eventsProvider";

export function InstrumentHost({
  initial,
  hidden = false,
  narrow = false,
}: {
  initial: OklchColor;
  hidden?: boolean;
  narrow?: boolean;
}) {
  const [colors, setColors] = useState(() => [{ ...initial }, { ...initial, l: 0.43, h: 120.25 }]);
  const [isHidden, setHidden] = useState(hidden);
  const [isNarrow, setNarrow] = useState(narrow);
  const [mounted, setMounted] = useState(true);
  const [completion, setCompletion] = useState(true);
  const [renderCount, rerender] = useState(0);
  const record = useEvents();
  const [view, setView] = useState<GamutPlaneView>("oklch");
  return (
    <div>
      <button onClick={() => setHidden(!isHidden)}>Toggle visibility</button>
      <button onClick={() => setNarrow(!isNarrow)}>Resize hosts</button>
      <button onClick={() => setMounted(!mounted)}>Toggle mount</button>
      <button onClick={() => rerender(renderCount + 1)}>Rerender parent</button>
      <button onClick={() => setColors((values) => values.map((value) => ({ ...value })))}>
        Clone colors
      </button>
      <button
        onClick={() =>
          setColors((values) => [{ l: 0.21, c: 0.31, h: 82, alpha: 0.63 }, values[1]!])
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
              {...(index === 0 ? { view, onViewChange: setView } : { defaultView: "oklab" })}
              legend={<p data-legend>Host boundary legend</p>}
              value={color}
              onValueChange={(next) => {
                setColors((values) =>
                  values.map((value, position) => (position === index ? { ...next } : value)),
                );
                record("changes");
              }}
              onValueCommit={completion ? (next) => record("commits", next) : undefined}
              onCancel={() => record("cancels")}
            />
            <output data-color>{JSON.stringify(color)}</output>
          </div>
        ))}
    </div>
  );
}
