<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useDocumentVisibility, useEventListener, useResizeObserver } from "@vueuse/core";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";
import {
  createSpatialScene,
  type SpatialFrameInfo,
  type SpatialGamut,
  type SpatialLabel,
  type SpatialMode,
  type SpatialScene,
  type SpatialStatus,
  type SpatialSection,
} from "./spatialScene";
import {
  createSectionScheduler,
  createSectionStore,
  followSection,
  initialSectionSelection,
  inspectSection,
  observeSelected,
  scrubSection,
  sectionLightness,
  selectedMembership,
  sliderValue,
  SECTION_GAMUTS,
  type SectionOutcomes,
  type SectionSelection,
} from "./sectionModel";
import {
  announceSection,
  describeMarker,
  describeSection,
  describeSelectedColor,
  formatLightness,
  gamutNames,
} from "./sectionSummary";
import "./spatial.css";
import { screenRuler } from "./spatialCamera";
import {
  acceptHue,
  createHueStore,
  hueRelationship,
  initialHueSelection,
  inspectHue,
  observeHue,
  viewedHue,
  type HueOutcomes,
} from "./hueModel";

// One authoritative authored color. The compact instrument edits it; this view only observes it.
const initial = createColorValue({ space: "oklch", channels: [0.68, 0.15, 252], alpha: 1 });
if (!initial.ok) throw new Error("Invalid initial selected color");
const selectedColor = shallowRef<ColorValue>(initial.value);
const instrumentState = ref<GamutPlaneState>({
  selection: { representationId: "oklab", editorId: "oklab-ab" },
  checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
  referenceGamutId: "srgb-gamut",
  visibleGuides: ["display-p3-boundary", "srgb-boundary"],
});

const stage = ref<HTMLElement>();
const workspace = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const active = ref<SpatialGamut>("srgb");
const compare = ref(true);
const mode = ref<SpatialMode>("shape");
const cut = ref(true);
const status = ref<SpatialStatus | "loading">("loading");
const labels = ref<readonly SpatialLabel[]>([]);
const scale = ref(60);
const ruler = computed(() => screenRuler(scale.value));
const frames = ref(0);
const frameInfo = shallowRef<SpatialFrameInfo | null>(null);
const visibility = useDocumentVisibility();
const names = gamutNames;
const gamuts = ["srgb", "display-p3"] as const;
const modes = [
  { id: "shape", label: "Shape" },
  { id: "color", label: "Color" },
] as const;
const other = computed<SpatialGamut>(() => (active.value === "srgb" ? "display-p3" : "srgb"));
// OKLab opponent axes: +a toward red, -a toward green, +b toward yellow, -b toward blue.
const axisText = {
  L: "L 1 · white",
  "+a": "+a red",
  "-a": "−a green",
  "+b": "+b yellow",
  "-b": "−b blue",
  black: "L 0 · black",
} as const;
const previewNote = computed(() =>
  mode.value === "color"
    ? "sRGB preview. Colors outside sRGB are clipped; Display P3 reproduction is not qualified."
    : "Surfaces and contours are sampled. Gamut membership is checked independently from the authored color.",
);

// --- Section state: derived from the shared color and one local selection --------------------------
const observation = computed(() => observeSelected(selectedColor.value));
const membership = computed(() => ({
  srgb: selectedMembership(selectedColor.value, "srgb"),
  "display-p3": selectedMembership(selectedColor.value, "display-p3"),
}));
const selection = ref<SectionSelection>(initialSectionSelection);
const sectionType = ref<"lightness" | "hue">("lightness");
const hueSelection = ref(initialHueSelection);
const selectedHue = computed(() => observeHue(selectedColor.value));
watch(
  selectedHue,
  (h) => {
    hueSelection.value = acceptHue(hueSelection.value, h);
  },
  { immediate: true },
);
const hue = computed(() => viewedHue(hueSelection.value, selectedHue.value));
// Scene-frame updates must not replace uncommitted text with the accepted viewing angle.
const hueDraft = ref<number | string>(hue.value);
watch(hue, (value) => {
  hueDraft.value = value;
});
const hueOutcomes = shallowRef<HueOutcomes | null>(null);
const hueStore = createHueStore();
const pending = ref(false);
const directionNote = computed(() =>
  sectionType.value === "hue" && selectedHue.value === null
    ? hueSelection.value.mode === "inspect"
      ? "The selected color has no meaningful hue. This direction is inspected independently."
      : hueSelection.value.retainedHue === null
        ? "The selected color has no meaningful hue. H 0° is the initial viewing direction."
        : `The selected color has no meaningful hue. Retaining H ${hue.value.toFixed(1)}° for viewing.`
    : null,
);
const lightness = computed(() => sectionLightness(selection.value, observation.value));
const slider = computed(() => sliderValue(selection.value, observation.value));
const outcomes = shallowRef<SectionOutcomes | null>(null);
const shownLightness = ref<number | null>(null);
const store = createSectionStore();
type SectionRequest = { type: "lightness" | "hue"; value: number | null };
const request = computed<SectionRequest>((previous) => {
  const value = sectionType.value === "hue" ? hue.value : lightness.value;
  return previous?.type === sectionType.value && previous.value === value
    ? previous
    : { type: sectionType.value, value };
});
let scheduler: ReturnType<typeof createSectionScheduler<SectionRequest, SpatialSection>> | null =
  null;
const marker = computed(() =>
  observation.value.status === "ok"
    ? ([observation.value.a, observation.value.l, observation.value.b] as const)
    : null,
);
const sectionText = computed(() => {
  if (sectionType.value === "lightness")
    return describeSection(
      selection.value.mode,
      shownLightness.value,
      outcomes.value,
      observation.value,
    );
  if (pending.value) return `Computing H ${hue.value.toFixed(1)}° section.`;
  return (
    `H ${hue.value.toFixed(1)}° · ` +
    gamuts
      .map((space) => {
        const result = hueOutcomes.value?.[space];
        return result?.status === "ready"
          ? `${names[space]}: ${result.section.loops.length} area sector${result.section.loops.length === 1 ? "" : "s"}${result.section.contacts.length ? `, ${result.section.contacts.length} isolated contact ray` : ""}`
          : `${names[space]} section unavailable at this hue`;
      })
      .join(". ")
  );
});
const selectedText = computed(() => describeSelectedColor(observation.value, membership.value));
const markerNote = computed(() =>
  describeMarker(frameInfo.value?.markerHidden ?? null, frameInfo.value?.markerInView ?? null),
);
const sectionExceptional = computed(
  () =>
    (sectionType.value === "hue" &&
      Object.values(hueOutcomes.value ?? {}).some(
        (o) => o.status !== "ready" || o.section.loops.length > 1 || o.section.contacts.length > 0,
      )) ||
    observation.value.status !== "ok" ||
    (sectionType.value === "lightness" &&
      outcomes.value !== null &&
      Object.values(outcomes.value).some(
        (outcome) => outcome.status !== "ready" || outcome.section.kind !== "region",
      )),
);
const announcement = ref("");
let announceTimer: ReturnType<typeof setTimeout> | undefined;
const settledAnnouncement = computed(() =>
  sectionType.value === "hue"
    ? `${sectionText.value} ${directionNote.value ?? ""}`
    : announceSection(
        selection.value.mode,
        shownLightness.value,
        outcomes.value,
        observation.value,
        membership.value,
      ),
);
// Meaningful settled changes only: wait until the color and section stop changing.
watch(settledAnnouncement, (text) => {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announcement.value = text;
  }, 600);
});
const followActive = computed(
  () => (sectionType.value === "hue" ? hueSelection.value : selection.value).mode === "follow",
);
function chooseFollow() {
  if (sectionType.value === "hue") {
    hueSelection.value = acceptHue({ ...hueSelection.value, mode: "follow" }, selectedHue.value);
    return;
  }
  selection.value = followSection(selection.value);
}
function chooseInspect() {
  if (sectionType.value === "hue") {
    hueSelection.value = inspectHue(hueSelection.value, hue.value);
    return;
  }
  selection.value = inspectSection(selection.value, observation.value);
}
function scrub(event: Event) {
  if (sectionType.value === "hue") {
    hueSelection.value = inspectHue(
      hueSelection.value,
      (event.target as HTMLInputElement).valueAsNumber,
    );
    hueDraft.value = hue.value;
    return;
  }
  selection.value = scrubSection(selection.value, Number((event.target as HTMLInputElement).value));
}
function stepHue(event: KeyboardEvent) {
  if (
    sectionType.value !== "hue" ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  hueSelection.value = inspectHue(
    hueSelection.value,
    hue.value +
      (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 10 : 1),
  );
}

let scene: SpatialScene | null = null;
const fit = () => scene?.fit();
const home = () => scene?.home();
const restore = () => scene?.restore();
const fitSection = () => scene?.fitSection();
const flipCut = () => scene?.flipCut();
const restoreSurface = () => scene?.restoreSurface();
function viewSection() {
  // Explicit alignment establishes the front-facing cut for subsequent orbit.
  cut.value = true;
  scene?.viewSection();
}
function showSelected() {
  scene?.showSelected();
}
function resize() {
  // Projection uses the canvas box; surrounding controls do not participate.
  const rect = canvas.value?.getBoundingClientRect();
  if (rect) scene?.resize(rect.width, rect.height, window.devicePixelRatio);
}
useResizeObserver([stage, canvas], resize);
watch(visibility, (value) => scene?.setVisible(value === "visible"));
watch([active, compare, mode, cut], () =>
  scene?.update({
    active: active.value,
    compare: compare.value,
    mode: mode.value,
    cut: cut.value,
  }),
);
// Development-only counters for browser tests and the evidence report.
const metrics = { requests: 0, computes: 0, lastComputeMs: 0, maxComputeMs: 0, totalComputeMs: 0 };
watch([request, marker], ([value, point], [previous]) => {
  if (value !== previous) {
    metrics.requests++;
    pending.value = true;
    // Compute before either scene mutation requests a render. Synchronous results arrive in
    // the same frame; asynchronous work would still show explicit pending without stale lines.
    scheduler?.request(value);
    scene?.setSection(
      value.type === "hue"
        ? { type: "hue", hue: value.value!, lightness: null, outcomes: null }
        : { lightness: value.value, outcomes: null },
    );
  }
  scene?.setMarker(point);
});
onMounted(() => {
  useEventListener(window, "resize", resize);
  useEventListener(document, "click", (event) => {
    workspace.value
      ?.querySelectorAll<HTMLDetailsElement>(".spatial-disclosure[open]")
      .forEach((details) => {
        if (!details.contains(event.target as Node)) details.open = false;
      });
  });
  useEventListener(workspace, "keydown", (event) => {
    if (event.key !== "Escape") return;
    const details = (event.target as HTMLElement).closest<HTMLDetailsElement>(
      ".spatial-disclosure[open]",
    );
    if (!details) return;
    details.open = false;
    details.querySelector("summary")?.focus();
    event.preventDefault();
  });
  scheduler = createSectionScheduler<SectionRequest, SpatialSection>({
    compute: (value) => {
      const before = performance.now();
      const result: SpatialSection =
        value.type === "hue"
          ? {
              type: "hue",
              hue: value.value!,
              lightness: null,
              outcomes: hueStore.outcomes(value.value!),
            }
          : {
              lightness: value.value,
              outcomes: value.value === null ? null : store.outcomes(value.value),
            };
      const elapsed = performance.now() - before;
      metrics.computes++;
      metrics.lastComputeMs = elapsed;
      metrics.maxComputeMs = Math.max(metrics.maxComputeMs, elapsed);
      metrics.totalComputeMs += elapsed;
      return result;
    },
    schedule: (flush) => requestAnimationFrame(flush),
    cancel: (handle) => cancelAnimationFrame(handle as number),
    onUpdate: (update) => {
      const result = update.outcomes;
      if (!result) return;
      pending.value = false;
      if (result.type === "hue") hueOutcomes.value = result.outcomes;
      else {
        outcomes.value = result.outcomes;
        shownLightness.value = result.lightness;
      }
      scene?.setSection(result);
    },
  });
  try {
    scene = createSpatialScene(
      canvas.value!,
      (value) => {
        status.value = value;
      },
      (points, length, count, info) => {
        labels.value = points;
        scale.value = length;
        frames.value = count;
        frameInfo.value = info;
      },
    );
    scene?.setVisible(visibility.value === "visible");
    scene?.setMarker(marker.value);
    resize();
    // Test seam (development builds only): lets browser tests read renderer facts such as camera
    // matrices and upload counters. It is read-only and absent from production builds.
    if (!import.meta.env.PROD && stage.value) {
      Object.defineProperty(stage.value, "spatialInspect", {
        value: () => scene?.inspect(),
        configurable: true,
      });
      Object.defineProperty(stage.value, "spatialMetrics", {
        value: () => ({
          ...metrics,
          store: { ...store.stats, size: store.size },
          hueStore: { ...hueStore.stats, size: hueStore.size },
        }),
        configurable: true,
      });
    }
  } catch {
    scene?.dispose();
    status.value = "unavailable";
  }
  // Compute the first section for the initial color without waiting for a change.
  scheduler.request(request.value);
});
onBeforeUnmount(() => {
  clearTimeout(announceTimer);
  scheduler?.dispose();
  scene?.dispose();
});

/** Test and evidence hook: the authored definition, so representation switches can be shown not to change it. */
const authored = computed(() => {
  const definition = definitionOf(selectedColor.value);
  return { space: definition.space, channels: definition.channels.join(",") };
});
const visibleSectionGamuts = computed(() =>
  SECTION_GAMUTS.filter((space) => space === active.value || compare.value),
);
const relationship = computed(() => {
  if (sectionType.value === "hue") {
    if (!marker.value) return null;
    const relation = hueRelationship(marker.value, hue.value);
    if (relation.onHalfPlane) return "Selected color lies on the viewed hue half-plane.";
    return `${relation.opposite ? "Selected color is on the opposite radial side" : "Selected color is away from the viewed half-plane"} · plane displacement ${relation.displacement.toFixed(3)} · radial projection ${relation.radius.toFixed(3)}.`;
  }
  if (observation.value.status !== "ok" || shownLightness.value === null) return null;
  const delta = observation.value.l - shownLightness.value;
  return `Selected L ${formatLightness(observation.value.l)} · Section L ${formatLightness(shownLightness.value)} · ΔL ${delta >= 0 ? "+" : "−"}${formatLightness(Math.abs(delta))}`;
});
</script>
<template>
  <main ref="workspace" class="spatial-app">
    <header class="spatial-header">
      <a href="/" class="spatial-brand">Gamut Plane</a>
      <h1 id="spatial-title">Spatial study</h1>
      <span>OKLab / OKLCH</span>
    </header>
    <section
      class="spatial-workspace"
      aria-labelledby="spatial-title"
      :data-authored-space="authored.space"
      :data-authored-channels="authored.channels"
    >
      <div class="spatial-columns">
        <div class="spatial-scene-column">
          <div class="spatial-toolbar">
            <fieldset class="spatial-group">
              <legend class="sr-only">Surface</legend>
              <label v-for="space in gamuts" :key="space" class="spatial-choice">
                <input v-model="active" type="radio" name="spatial-surface" :value="space" />
                <span>{{ names[space] }}</span>
              </label>
            </fieldset>
            <fieldset class="spatial-group">
              <legend class="sr-only">Presentation</legend>
              <label v-for="item in modes" :key="item.id" class="spatial-choice">
                <input v-model="mode" type="radio" name="spatial-mode" :value="item.id" />
                <span>{{ item.label }}</span>
              </label>
            </fieldset>
            <details class="spatial-disclosure spatial-view-options">
              <summary>View</summary>
              <div class="spatial-options">
                <button :disabled="status !== 'ready'" @click="fit">Fit visible</button>
                <button :disabled="status !== 'ready'" @click="home">Home</button>
                <button
                  :disabled="status !== 'ready' || !marker"
                  @click="frameInfo?.revealed ? restoreSurface() : showSelected()"
                >
                  {{ frameInfo?.revealed ? "Restore surface" : "Show selected" }}
                </button>
                <label class="spatial-compare"
                  ><input v-model="compare" type="checkbox" />
                  <span>Show {{ names[other] }} outline</span></label
                >
              </div>
            </details>
          </div>
          <div
            ref="stage"
            class="spatial-stage"
            :data-spatial-status="status"
            :data-spatial-frames="frames"
          >
            <div class="spatial-caption">
              <span v-if="mode === 'color'">sRGB preview</span>
              <span v-if="frameInfo?.revealed">Surfaces hidden</span>
              <span v-else-if="frameInfo?.sectionOnly">{{
                sectionType === "hue" ? "C → / L ↑" : "a → / b ↑"
              }}</span>
            </div>
            <div class="spatial-viewport">
              <canvas
                ref="canvas"
                tabindex="0"
                aria-label="Orthographic gamut scene"
                aria-describedby="spatial-instructions spatial-summary"
              />
              <span
                v-for="label in labels.filter((item) => item.shown)"
                :key="label.id"
                class="spatial-axis"
                :class="{ 'spatial-axis-far': label.far }"
                aria-hidden="true"
                :style="{ left: `${label.x}px`, top: `${label.y}px` }"
                >{{ axisText[label.id] }}</span
              >
              <span
                v-if="frameInfo?.plane && shownLightness !== null"
                class="spatial-plane-tag"
                aria-hidden="true"
                :style="{ left: `${frameInfo.plane.x}px`, top: `${frameInfo.plane.y}px` }"
                >{{
                  sectionType === "hue"
                    ? `H ${hue.toFixed(1)}°`
                    : `L ${formatLightness(shownLightness)}`
                }}</span
              >
              <div v-if="status === 'unavailable'" class="spatial-message" role="status">
                <strong>3D rendering is unavailable</strong>
                <p>
                  This study needs WebGL2. Enable graphics acceleration or use a browser with WebGL2
                  support. The color instrument and the section facts still work.
                </p>
                <a href="/">Open the compact instrument</a>
              </div>
              <div v-else-if="status === 'lost'" class="spatial-message" role="status">
                <strong>Graphics context interrupted</strong>
                <p>The scene will resume when the browser restores the context.</p>
                <button @click="restore">Try to restore</button
                ><a href="/">Return to the instrument</a>
              </div>
            </div>
            <div class="spatial-scale">
              <span :style="{ width: `${ruler.pixels}px` }"></span>{{ ruler.units }} OKLab
            </div>
          </div>
          <section class="spatial-section" aria-label="Section controls">
            <div class="spatial-section-strip">
              <fieldset class="spatial-group">
                <legend class="sr-only">Section type</legend>
                <label class="spatial-choice"
                  ><input
                    v-model="sectionType"
                    type="radio"
                    name="section-type"
                    value="lightness"
                    aria-label="Lightness section"
                  /><span>Lightness</span></label
                >
                <label class="spatial-choice"
                  ><input
                    v-model="sectionType"
                    type="radio"
                    name="section-type"
                    value="hue"
                    aria-label="Hue section"
                  /><span>Hue</span></label
                >
              </fieldset>
              <select
                aria-label="Section value source"
                :value="followActive ? 'follow' : 'inspect'"
                @change="
                  ($event.target as HTMLSelectElement).value === 'follow'
                    ? chooseFollow()
                    : chooseInspect()
                "
              >
                <option value="follow">Follow selected color</option>
                <option value="inspect">
                  {{ sectionType === "hue" ? "Inspect hue" : "Inspect lightness" }}
                </option>
              </select>
              <label v-if="sectionType === 'hue' && !followActive" class="spatial-hue-input">
                <span class="sr-only">Inspected hue in degrees</span>
                <input
                  type="number"
                  step="any"
                  v-model="hueDraft"
                  aria-label="Inspected hue in degrees"
                  @change="scrub"
                  @keydown.enter="scrub"
                  @keydown="stepHue"
                />°
              </label>
              <span
                v-else
                class="spatial-section-value"
                :data-section-lightness="sectionType === 'lightness' ? '' : undefined"
              >
                {{
                  sectionType === "hue"
                    ? `H ${hue.toFixed(1)}°`
                    : shownLightness === null
                      ? "None"
                      : `L ${formatLightness(shownLightness)}`
                }}
              </span>
              <label class="spatial-compare spatial-cut" :class="{ 'spatial-cut-active': cut }">
                <input
                  v-model="cut"
                  type="checkbox"
                  :disabled="frameInfo?.sectionOnly || frameInfo?.revealed"
                />
                <span>Cut away</span>
              </label>
              <details class="spatial-disclosure">
                <summary>Section</summary>
                <div class="spatial-options">
                  <button
                    :disabled="
                      status !== 'ready' || (sectionType === 'lightness' && shownLightness === null)
                    "
                    @click="viewSection"
                  >
                    View section
                  </button>
                  <button :disabled="status !== 'ready'" @click="fitSection">Fit section</button>
                  <template
                    v-if="
                      cut &&
                      frameInfo &&
                      frameInfo.cutSide !== 0 &&
                      !frameInfo.sectionOnly &&
                      !frameInfo.revealed
                    "
                  >
                    <button
                      :disabled="status !== 'ready'"
                      aria-describedby="spatial-cut-direction"
                      @click="flipCut"
                    >
                      Flip cut
                    </button>
                    <output id="spatial-cut-direction" aria-live="polite"
                      >{{
                        sectionType === "hue"
                          ? frameInfo.cutSide === -1
                            ? "−normal"
                            : "+normal"
                          : frameInfo.cutSide === -1
                            ? "Lower"
                            : "Upper"
                      }}
                      half removed</output
                    >
                  </template>
                </div>
              </details>
            </div>
            <label v-if="!followActive" class="spatial-slider">
              <span class="sr-only">{{
                sectionType === "hue" ? "Hue (OKLCH H)" : "Lightness (OKLab L)"
              }}</span>
              <input
                type="range"
                min="0"
                :max="sectionType === 'hue' ? 360 : 1"
                :step="sectionType === 'hue' ? 0.1 : 0.001"
                :value="sectionType === 'hue' ? hue : slider"
                :aria-valuetext="
                  sectionType === 'hue' ? `H ${hue.toFixed(1)}°` : `L ${formatLightness(slider)}`
                "
                data-section-slider
                @input="scrub"
                @keydown="stepHue"
              />
            </label>
          </section>
          <div class="spatial-reading">
            <ul v-if="shownLightness !== null" class="spatial-keys" aria-label="Section key">
              <li v-for="space in visibleSectionGamuts" :key="space" :data-section-key="space">
                <i aria-hidden="true" :class="`spatial-key-line spatial-key-${space}`"></i
                >{{ names[space] }}
              </li>
              <li v-if="marker" data-section-key="selected">
                <i aria-hidden="true" class="spatial-key-marker"></i>Selected
              </li>
            </ul>
            <details class="spatial-details">
              <summary>About this view</summary>
              <div class="spatial-detail-content">
                <p>{{ previewNote }}</p>
                <p>{{ selectedText }}</p>
                <p>{{ sectionText }}</p>
                <p v-if="relationship" data-section-relationship>{{ relationship }}</p>
                <p>
                  Solid green: sRGB section. Dashed amber: Display P3 section. Hollow marker: behind
                  the surface. Dotted hue contacts have no area. The neutral edge has no chroma.
                </p>
                <p id="spatial-instructions">
                  Drag to orbit · Right-drag or two fingers to pan · Scroll or pinch to zoom.
                  Keyboard: arrows orbit, Shift + arrows pan, + / − zoom, Home resets. In Hue, the
                  view follows the section and keeps your orbit angle. View section aligns it.
                </p>
              </div>
            </details>
          </div>
          <div id="spatial-summary" class="spatial-summary" data-section-summary>
            <p v-if="observation.status !== 'ok'">{{ selectedText }}</p>
            <p v-if="sectionExceptional">{{ sectionText }}</p>
            <p v-if="directionNote" data-hue-direction>{{ directionNote }}</p>
            <p v-if="mode === 'color' && active === 'display-p3'">
              Display P3 colors are clipped to this sRGB preview.
            </p>
            <p v-if="markerNote" data-marker-note>{{ markerNote }}</p>
          </div>
          <p class="sr-only" role="status" aria-live="polite" data-section-announcement>
            {{ announcement }}
          </p>
        </div>
        <aside class="spatial-instrument-column" aria-label="Color inspector">
          <GamutPlane v-model="selectedColor" v-model:state="instrumentState" />
        </aside>
      </div>
    </section>
  </main>
</template>
