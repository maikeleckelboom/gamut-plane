import { createColorValue, snapshotColor } from "@gamut-plane/core";
import { GeneralizedHost } from "../../generalizedHost";

export default function Page() {
  const initial = createColorValue({ space: "oklch", channels: [0.62, 0.2, 45], alpha: 0.37 });
  if (!initial.ok) throw new Error("Invalid generalized Next color");
  return <GeneralizedHost initial={snapshotColor(initial.value)} />;
}
