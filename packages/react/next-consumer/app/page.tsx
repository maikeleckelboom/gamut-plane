import { InstrumentHost } from "../instrumentHost";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const initial = query.alternate
    ? { l: 0.31, c: 0.41, h: -28.25, alpha: 0.61 }
    : { l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 };
  return (
    <InstrumentHost
      initial={initial}
      hidden={Boolean(query.hidden)}
      narrow={Boolean(query.narrow)}
    />
  );
}
