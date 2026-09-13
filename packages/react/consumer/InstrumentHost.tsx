import { useRef, useState } from "react";
import { GamutPlane, type GamutPlaneView, type OklchColor } from "@gamut-plane/react";

const initial = (): OklchColor => ({ l: 0.5, c: 0.2, h: 0.5, alpha: 0.7 });

export function InstrumentHost() {
  const query = new URLSearchParams(location.search);
  const single = query.has("single");
  const [first, setFirst] = useState(initial);
  const [second, setSecond] = useState(initial);
  const [view, setView] = useState<GamutPlaneView>("oklch");
  const [width, setWidth] = useState(single ? 900 : 340);
  const [shown, setShown] = useState(!query.has("hidden"));
  const [dark, setDark] = useState(false);
  const [commits, setCommits] = useState([0, 0]);
  const [changes, setChanges] = useState(0);
  const [cancels, setCancels] = useState(0);
  const [escapes, setEscapes] = useState(0);
  const [srgb, setSrgb] = useState(true);
  const [p3, setP3] = useState(true);
  const [accent, setAccent] = useState(false);
  const root = useRef<HTMLElement>(null);
  const countCommit = (index: number) =>
    setCommits((values) => values.map((value, i) => (i === index ? value + 1 : value)));
  return (
    <main
      onKeyDown={(event) => {
        if (event.key === "Escape") setEscapes((count) => count + 1);
      }}
    >
      <h1>Instrument test host</h1>
      <label>
        Host width{" "}
        <input
          type="number"
          value={width}
          onChange={(event) => setWidth(event.currentTarget.valueAsNumber)}
        />
      </label>
      <button onClick={() => setShown(!shown)}>Toggle first</button>
      <button onClick={() => setDark(!dark)}>Toggle surroundings</button>
      <button onClick={() => setFirst({ l: 0.7, c: 0.52, h: 270, alpha: 0.3 })}>
        Replace first color
      </button>
      <button onClick={() => setView(view === "oklch" ? "oklab" : "oklch")}>Parent view</button>
      <button onClick={() => setAccent(!accent)}>Toggle accent</button>
      <button
        onClick={() => root.current?.querySelector<HTMLElement>('[role="application"]')?.focus()}
      >
        Focus from ref
      </button>
      <output data-escapes>{escapes}</output>
      <output data-changes>{changes}</output>
      <output data-cancels>{cancels}</output>
      <div className={`host-scroll ${dark ? "dark" : ""}`}>
        <div className="host-spacer" />
        <div className="host-instance" data-host="first" style={{ width }}>
          <div style={{ display: shown ? undefined : "none" }}>
            <GamutPlane
              ref={root}
              id="first-instrument"
              data-host-prop="first"
              className="host-picker"
              style={{ "--gamut-plane-accent": accent ? "oklch(0.8 0.12 180)" : undefined }}
              value={first}
              onValueChange={(next) => {
                setFirst({ ...next });
                setChanges((count) => count + 1);
              }}
              onValueCommit={() => countCommit(0)}
              onCancel={() => setCancels((count) => count + 1)}
              showSrgbBoundary={srgb}
              showDisplayP3Boundary={p3}
              legend={
                <div data-legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={srgb}
                      onChange={(event) => setSrgb(event.currentTarget.checked)}
                    />
                    sRGB guide
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={p3}
                      onChange={(event) => setP3(event.currentTarget.checked)}
                    />
                    Display P3 guide
                  </label>
                </div>
              }
            />
          </div>
          <output data-color>{JSON.stringify(first)}</output>
          <output data-commits>{commits[0]}</output>
        </div>
        <div className="host-spacer" />
      </div>
      {!single && (
        <div className="host-instance dark" data-host="second" style={{ width: 800 }}>
          <GamutPlane
            value={second}
            onValueChange={setSecond}
            view={view}
            onViewChange={setView}
            onValueCommit={() => countCommit(1)}
          />
          <output data-color>{JSON.stringify(second)}</output>
          <output data-commits>{commits[1]}</output>
          <output data-plane>{view}</output>
        </div>
      )}
      <div data-host-collision className="gpr-color-plane-gamut gpr-channel-control-gamut-range">
        Host content
      </div>
    </main>
  );
}
