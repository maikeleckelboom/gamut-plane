import { InstrumentHost } from "../../instrumentHost";

export default function Page() {
  return (
    <InstrumentHost
      initial={{
        type: "gamut-plane/color",
        version: 1,
        space: "oklch",
        channels: [0.68, 0.52345678, 612.123456],
        alpha: 0.37,
      }}
    />
  );
}
