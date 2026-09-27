import { InstrumentHost } from "../instrumentHost";
import { createColorValue, snapshotColor } from "@gamut-plane/core";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const initial = createColorValue(
    query.alternate
      ? { space: "oklch", channels: [0.31, 0.41, -28.25], alpha: 0.61 }
      : { space: "oklch", channels: [0.68, 0.52345678, 612.123456], alpha: 0.37 },
  );
  if (!initial.ok) throw new Error("Invalid Next consumer color");
  return (
    <InstrumentHost
      initial={snapshotColor(initial.value)}
      hidden={Boolean(query.hidden)}
      narrow={Boolean(query.narrow)}
    />
  );
}
