export interface LinearControlInterval {
  start: number;
  end: number;
  tone: "srgb" | "display-p3";
}
const tones = ["display-p3", "srgb"] as const;

/** Merge sampled visual intervals; exact gamut status is analyzed from ColorValue elsewhere. */
export function channelSections(
  intervals: readonly LinearControlInterval[],
): LinearControlInterval[] {
  return tones.flatMap((tone) => {
    const sections: LinearControlInterval[] = [];
    const sorted = intervals
      .filter((interval) => interval.tone === tone)
      .map((interval) => {
        const start = Math.min(1, Math.max(0, interval.start));
        return { tone, start, end: Math.min(1, Math.max(start, interval.end)) };
      })
      .filter((interval) => interval.end - interval.start > Number.EPSILON * 16)
      .sort((a, b) => a.start - b.start);
    for (const interval of sorted) {
      const previous = sections.at(-1);
      if (previous && interval.start <= previous.end + Number.EPSILON * 16)
        previous.end = Math.max(previous.end, interval.end);
      else sections.push(interval);
    }
    return sections;
  });
}
