import { createColorValue, snapshotColor } from "@gamut-plane/core";
import { GeneralizedHost } from "../../generalizedHost";

export default function Page() {
  const initial = createColorValue({ space: "srgb", channels: [1.2, 0.4, -0.1], alpha: 0.37 });
  if (!initial.ok) throw new Error("Invalid generalized Next color");
  return <GeneralizedHost initial={snapshotColor(initial.value)} />;
}
