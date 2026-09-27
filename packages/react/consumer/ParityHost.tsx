import { useState } from "react";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { GamutPlane, type DisplayGamut, type GamutPlaneView } from "@gamut-plane/react";

const query = new URLSearchParams(location.search);
const channels = [
  Number(query.get("l") ?? 0.5),
  Number(query.get("c") ?? 0.2),
  Number(query.get("h") ?? 0.5),
] as const;
const created = createColorValue({ space: "oklch", channels, alpha: 0.7 });
if (!created.ok) throw new Error("Invalid parity color");
const initialColor = created.value;
const initialView: GamutPlaneView = query.get("view") === "oklab" ? "oklab" : "oklch";
const initialSrgb = query.get("srgb") !== "false";
const initialP3 = query.get("p3") !== "false";
const target: DisplayGamut = query.get("target") === "display-p3" ? "display-p3" : "srgb";
const width = Number(query.get("width") ?? 800);
const srgbAnalysis = analyzeGamut(initialColor, "srgb-gamut");
const p3Analysis = analyzeGamut(initialColor, "display-p3-gamut");
if (!srgbAnalysis.ok || !p3Analysis.ok) throw new Error("Invalid parity gamut analysis");
const srgbStatus = srgbAnalysis.value.status;
const p3Status = p3Analysis.value.status;

export function ParityHost() {
  const [value, setValue] = useState(initialColor);
  const [view, setView] = useState(initialView);
  const [srgb, setSrgb] = useState(initialSrgb);
  const [p3, setP3] = useState(initialP3);
  return (
    <main className="parity-host">
      <div
        className="parity-instance"
        style={{ width }}
        data-srgb-status={srgbStatus}
        data-p3-status={p3Status}
      >
        <GamutPlane
          value={value}
          onValueChange={setValue}
          view={view}
          onViewChange={setView}
          boundaryTarget={target}
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
    </main>
  );
}
