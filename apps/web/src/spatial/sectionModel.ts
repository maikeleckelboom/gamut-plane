import { analyzeGamut, represent, type ColorValue, type GamutId } from "@gamut-plane/core";
import {
  generateLightnessSection,
  type LightnessSection,
  type SectionError,
} from "@gamut-plane/render/internal/spatial";

/**
 * The spatial viewer observes one authored `ColorValue`; it never owns or rewrites it. Everything
 * here is derived data: an OKLab observation, a section lightness and exact gamut membership.
 */
export type SectionGamut = "srgb" | "display-p3";
export const SECTION_GAMUTS: readonly SectionGamut[] = ["srgb", "display-p3"];
export const gamutIds = {
  srgb: "srgb-gamut",
  "display-p3": "display-p3-gamut",
} as const satisfies Record<SectionGamut, GamutId>;

/** OKLab coordinates of the selected color as observed through core. Alpha never moves the point. */
export type SelectedObservation =
  | Readonly<{ status: "ok"; l: number; a: number; b: number }>
  | Readonly<{ status: "unavailable" }>;

export function observeSelected(value: ColorValue): SelectedObservation {
  const observed = represent(value, "oklab");
  if (!observed.ok) return { status: "unavailable" };
  const [l, a, b] = observed.value.channels;
  return { status: "ok", l, a, b };
}

/** Exact analysis of the authored value, never inferred from drawn geometry or occlusion. */
export type Membership = "inside" | "within-tolerance" | "outside" | "unavailable";
export function selectedMembership(value: ColorValue, gamut: SectionGamut): Membership {
  const analysis = analyzeGamut(value, gamutIds[gamut]);
  return analysis.ok ? analysis.value.status : "unavailable";
}

/**
 * Which lightness the section shows. `follow` takes the accepted color's observed L; `inspect` holds
 * an independently chosen L and never touches the color. Neither mode can author a color.
 */
export type SectionMode = "follow" | "inspect";
export interface SectionSelection {
  readonly mode: SectionMode;
  readonly inspectLightness: number;
}
export const initialSectionSelection: SectionSelection = Object.freeze({
  mode: "follow",
  inspectLightness: 0.5,
});

export function sectionLightness(
  selection: SectionSelection,
  observation: SelectedObservation,
): number | null {
  if (selection.mode === "inspect") return selection.inspectLightness;
  return observation.status === "ok" ? observation.l : null;
}
/**
 * The user moved the lightness control. Only a finite value is accepted; the result enters inspect
 * mode and the observed color is not consulted again until the user returns to follow mode.
 */
export function scrubSection(selection: SectionSelection, value: number): SectionSelection {
  if (!Number.isFinite(value)) return selection;
  return { mode: "inspect", inspectLightness: Math.min(1, Math.max(0, value)) };
}
/** Start inspecting at the lightness currently shown, so entering inspect mode never jumps. */
export function inspectSection(
  selection: SectionSelection,
  observation: SelectedObservation,
): SectionSelection {
  if (selection.mode === "inspect") return selection;
  const shown = sectionLightness(selection, observation);
  return {
    mode: "inspect",
    inspectLightness: shown === null ? selection.inspectLightness : Math.min(1, Math.max(0, shown)),
  };
}
export function followSection(selection: SectionSelection): SectionSelection {
  return selection.mode === "follow"
    ? selection
    : { mode: "follow", inspectLightness: selection.inspectLightness };
}

/** The value a range control shows: always inside its own bounds, whichever mode is active. */
export function sliderValue(selection: SectionSelection, observation: SelectedObservation): number {
  const shown = sectionLightness(selection, observation);
  return shown === null ? selection.inspectLightness : Math.min(1, Math.max(0, shown));
}

export type SectionOutcome =
  | Readonly<{ status: "ready"; section: LightnessSection }>
  | Readonly<{ status: "unavailable"; error: SectionError; detail: string }>;
export type SectionOutcomes = Readonly<Record<SectionGamut, SectionOutcome>>;

/** In-plane tolerance and vertex budget used by the viewer. The scene's line buffers are sized to it. */
export const SECTION_LIMITS = Object.freeze({ maxVertices: 4096 });

export interface SectionStats {
  hits: number;
  misses: number;
  builds: number;
  evictions: number;
}
export type SectionGenerator = typeof generateLightnessSection;

/**
 * A bounded least-recently-used cache of exact sections keyed by (gamut, the requested lightness as
 * the exact double). Nothing is quantized to improve the hit rate; two nearby lightnesses are two
 * different sections.
 */
export function createSectionStore(
  options: { capacity?: number; generate?: SectionGenerator } = {},
) {
  const capacity = options.capacity ?? 24;
  const generate = options.generate ?? generateLightnessSection;
  const cache = new Map<string, SectionOutcome>();
  const stats: SectionStats = { hits: 0, misses: 0, builds: 0, evictions: 0 };
  function get(space: SectionGamut, lightness: number): SectionOutcome {
    const key = `${space}:${lightness}`;
    const cached = cache.get(key);
    if (cached) {
      stats.hits++;
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    stats.misses++;
    stats.builds++;
    const result = generate({ space, lightness, limits: SECTION_LIMITS });
    const outcome: SectionOutcome = result.ok
      ? { status: "ready", section: result.value }
      : { status: "unavailable", error: result.error, detail: result.detail };
    cache.set(key, outcome);
    while (cache.size > capacity) {
      cache.delete(cache.keys().next().value!);
      stats.evictions++;
    }
    return outcome;
  }
  return {
    get,
    outcomes(lightness: number): SectionOutcomes {
      return { srgb: get("srgb", lightness), "display-p3": get("display-p3", lightness) };
    },
    stats,
    get size() {
      return cache.size;
    },
  };
}
export type SectionStore = ReturnType<typeof createSectionStore>;

export interface SectionUpdate {
  /** Increases with every request; a result for an older request is never delivered. */
  readonly revision: number;
  readonly lightness: number | null;
  readonly outcomes: SectionOutcomes | null;
}

/**
 * Latest-wins section requests. A request only records the wanted lightness and asks the host to
 * flush on its next frame, so a burst of accepted edits builds at most once per frame. If a result
 * ever completes later than a newer request (an asynchronous generator), it is dropped.
 */
export function createSectionScheduler(options: {
  compute: (lightness: number) => SectionOutcomes | Promise<SectionOutcomes>;
  schedule: (flush: () => void) => unknown;
  cancel?: (handle: unknown) => void;
  onUpdate: (update: SectionUpdate) => void;
}) {
  let wanted: number | null = null;
  let revision = 0;
  let handle: unknown = null;
  let disposed = false;
  let delivered = 0;
  const flush = () => {
    handle = null;
    if (disposed) return;
    const current = revision;
    const lightness = wanted;
    if (lightness === null) {
      delivered = current;
      options.onUpdate({ revision: current, lightness: null, outcomes: null });
      return;
    }
    const deliver = (outcomes: SectionOutcomes) => {
      if (disposed || current !== revision || current <= delivered) return;
      delivered = current;
      options.onUpdate({ revision: current, lightness, outcomes });
    };
    const result = options.compute(lightness);
    if (result instanceof Promise) void result.then(deliver);
    else deliver(result);
  };
  return {
    request(lightness: number | null) {
      if (disposed) return;
      wanted = lightness;
      revision++;
      handle ??= options.schedule(flush);
    },
    /** Test and teardown hook: run the pending flush now. */
    flushNow() {
      if (handle !== null) {
        options.cancel?.(handle);
        flush();
      }
    },
    dispose() {
      disposed = true;
      if (handle !== null) options.cancel?.(handle);
      handle = null;
    },
    get pending() {
      return handle !== null;
    },
  };
}
