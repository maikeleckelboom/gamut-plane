<script setup lang="ts">
import {
  authorPlaneEdit,
  normalizeHue,
  oklabCoordinatePlanePoint,
  represent,
  type ColorResult,
  type ColorValue,
  type DisplayGamut,
  type GamutId,
  type PlaneEditError,
  type PlaneEditReference,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { computed, getCurrentInstance, onBeforeUpdate, ref, shallowRef, useId, watch } from "vue";
import {
  gpPart,
  editorUi,
  currentViewOptions,
  representationUi,
  currentEditorHelp,
  currentTargetCopy,
  currentTargetPresentation,
  currentWarningVisible,
  canonicalInstrumentState,
  currentRepresentationOptions,
  exactGamutUi,
  exactStatusCopy,
  formatInspectionNumber,
  guidePreferenceUi,
  initialInstrumentState,
  inspectionUi,
  instrumentViewStatesEqual,
  requestCheckedGamut,
  requestInspection,
  requestRepresentation,
  requestVisibleGuide,
} from "@gamut-plane/ui";
import NumericInput from "./NumericInput.vue";
import { legacyViewState, resolveAcceptedRevision } from "../model/acceptedResolution.js";
import { presentAcceptedRevision } from "../model/acceptedPresentation.js";
import { currentView } from "../model/currentView.js";

import ColorChannelControl from "./ColorChannelControl.vue";
import ColorPlane from "./ColorPlane.vue";
import type { CanvasColorSpaceStatus, GuideId } from "@gamut-plane/render";
import {
  currentField,
  currentExactChecks,
  currentOklchObservation,
  currentEditableDetail,
  currentGuideDisplay,
  currentTargetVisual,
  generalizedEditableDetail,
  generalizedGuideDisplay,
} from "@gamut-plane/render/internal/current";
import type { GamutPlaneState } from "../model/publicState.js";

const props = withDefaults(
  defineProps<{
    modelValue: ColorValue;
    boundaryTarget?: DisplayGamut;
    showSrgbBoundary?: boolean;
    showDisplayP3Boundary?: boolean;
    state?: GamutPlaneState;
    defaultState?: GamutPlaneState;
  }>(),
  {
    boundaryTarget: "srgb",
    showSrgbBoundary: true,
    showDisplayP3Boundary: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [color: ColorValue];
  commit: [color: ColorValue];
  cancel: [];
  capability: [status: CanvasColorSpaceStatus];
  "update:state": [state: GamutPlaneState];
}>();

defineSlots<{ "field-legend"(): unknown }>();

const plane = defineModel<PickerPlaneId>("plane", { default: "oklch" });
const instance = getCurrentInstance();
function hasRawProp(name: string): boolean {
  return Object.hasOwn(instance?.vnode.props ?? {}, name);
}
const generalized = ["state", "defaultState", "onUpdate:state"].some(hasRawProp);
const controlledState = hasRawProp("state");
function verifyRoute(): void {
  if (!generalized && ["state", "defaultState", "onUpdate:state"].some(hasRawProp))
    throw new Error("GamutPlane state route cannot change during an instance lifetime");
  if (generalized && hasRawProp("state") !== controlledState)
    throw new Error("GamutPlane state ownership cannot change during an instance lifetime");
  if (
    generalized &&
    ["plane", "onUpdate:plane", "boundaryTarget", "showSrgbBoundary", "showDisplayP3Boundary"].some(
      hasRawProp,
    )
  )
    throw new TypeError(
      "GamutPlane cannot mix generalized state with legacy plane or boundary props",
    );
}
verifyRoute();
onBeforeUpdate(verifyRoute);
const guideIds = Object.freeze([
  "display-p3-boundary",
  "srgb-boundary",
] as const satisfies readonly GuideId[]);
const guideOptions = ["srgb-boundary", "display-p3-boundary"] as const satisfies readonly GuideId[];
const gamutIds = ["srgb-gamut", "display-p3-gamut"] as const satisfies readonly GamutId[];
const localState = shallowRef<GamutPlaneState>(
  generalized
    ? canonicalInstrumentState(props.defaultState ?? initialInstrumentState<GuideId>(), guideIds)
    : initialInstrumentState<GuideId>(),
);
const readOnlyState = () => controlledState && !hasRawProp("onUpdate:state");
const acceptedState = computed(() =>
  generalized
    ? controlledState
      ? canonicalInstrumentState(props.state, guideIds)
      : localState.value
    : legacyViewState(plane.value, props.showSrgbBoundary, props.showDisplayP3Boundary),
);
function requestState(nextInput: GamutPlaneState): void {
  if (!generalized || readOnlyState()) return;
  const next = canonicalInstrumentState(nextInput, guideIds);
  if (instrumentViewStatesEqual(acceptedState.value, next)) return;
  if (!controlledState) localState.value = next;
  emit("update:state", next);
}
const instanceId = useId();
const titleId = `${instanceId}-instrument-title`;

const [hue, lightness, chroma] = editorUi["oklch-lc"].companions;
const [fixedLightness, a, b] = editorUi["oklab-ab"].companions;
const planeOptionButtons = new Map<PickerPlaneId, HTMLButtonElement>();
const revision = computed(() => resolveAcceptedRevision(props.modelValue, acceptedState.value));
const accepted = computed(() => presentAcceptedRevision(revision.value));
const legacy = computed(() => {
  if (generalized) return null;
  const view = currentView(accepted.value.selection);
  const field = currentField(view, accepted.value.editor, accepted.value.field);
  const oklch = currentOklchObservation(
    revision.value.source,
    accepted.value.observation,
    "Selected hue cannot be observed",
  );
  const checks = currentExactChecks(accepted.value.exactChecks);
  const visual = currentTargetVisual(
    field.editorId,
    props.boundaryTarget,
    accepted.value.guides,
    oklch,
  );
  const target = {
    ...visual,
    ...currentTargetPresentation(
      props.boundaryTarget,
      (props.boundaryTarget === "srgb" ? checks.srgb : checks.displayP3).status,
      visual,
    ),
  };
  const detail = currentEditableDetail(field, oklch);
  return {
    view,
    field,
    oklch,
    target,
    detail,
    guides: currentGuideDisplay(accepted.value.guides),
    help: currentEditorHelp(view, oklch.channels[2] === null, field.markerInDomain),
    warningVisible: currentWarningVisible(checks.displayP3.status),
  };
});
const generalizedVisual = computed(() =>
  generalized
    ? generalizedEditableDetail(
        revision.value.source,
        accepted.value.observation,
        accepted.value.editor,
        accepted.value.field,
      )
    : null,
);
const field = computed(
  () =>
    legacy.value?.field ??
    (generalizedVisual.value?.kind === "available" ? generalizedVisual.value.field : null),
);
const oklch = computed(
  () =>
    legacy.value?.oklch ??
    (generalizedVisual.value?.kind === "available" ? generalizedVisual.value.oklch : null),
);
const detail = computed(
  () =>
    legacy.value?.detail ??
    (generalizedVisual.value?.kind === "available" ? generalizedVisual.value.detail : null),
);
const view = computed(() => legacy.value?.view ?? field.value?.projection.plane ?? null);
const target = computed(() => legacy.value?.target ?? null);
const guides = computed(
  () => legacy.value?.guides ?? generalizedGuideDisplay(accepted.value.guides),
);
const help = computed(
  () =>
    legacy.value?.help ??
    (field.value && oklch.value && view.value
      ? currentEditorHelp(view.value, oklch.value.channels[2] === null, field.value.markerInDomain)
      : null),
);
const warningVisible = computed(() => legacy.value?.warningVisible ?? false);
const unavailableGuides = computed(() =>
  accepted.value.guides.filter(
    (guide) =>
      !field.value ||
      !detail.value ||
      guide.kind !== "resolved" ||
      guide.forms.contour.kind !== "available",
  ),
);
const y = computed(() =>
  field.value?.projection.plane === "oklch"
    ? field.value.projection.representation.channels[0]
    : (field.value?.projection.representation.channels[2] ?? 0),
);
const primaryGamutWarning = currentTargetCopy.warning;
const hueRangeDragging = ref(false);
const hueReference = ref<PlaneEditReference>();
watch(
  [() => props.modelValue, () => revision.value.contextKey],
  () => {
    const hue = oklch.value?.channels[2] ?? null;
    if (hue !== null) hueReference.value = { hue };
    else hueReference.value = undefined;
  },
  { immediate: true, flush: "sync" },
);
const fixedAxisFieldPreview = computed(() => view.value === "oklch" && hueRangeDragging.value);

function selectPlane(value: PickerPlaneId): void {
  plane.value = value;
}

function selectRepresentation(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  requestState(
    requestRepresentation(
      acceptedState.value,
      target.value as GamutPlaneState["selection"]["representationId"],
    ),
  );
  target.value = acceptedState.value.selection.representationId;
}

function toggleInspection(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  requestState(requestInspection(acceptedState.value, !target.checked));
  target.checked = acceptedState.value.selection.editorId !== null;
}

function toggleCheck(gamutId: GamutId, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  requestState(requestCheckedGamut(acceptedState.value, gamutId, target.checked));
  target.checked = acceptedState.value.checkedGamuts.includes(gamutId);
}

function toggleGuide(guideId: GuideId, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  requestState(requestVisibleGuide(acceptedState.value, guideId, target.checked, guideIds));
  target.checked = acceptedState.value.visibleGuides.includes(guideId);
}

function setPlaneOptionButton(value: PickerPlaneId, element: unknown): void {
  if (element instanceof HTMLButtonElement) planeOptionButtons.set(value, element);
  else planeOptionButtons.delete(value);
}

function movePlaneSelection(value: PickerPlaneId, event: KeyboardEvent): void {
  let direction: -1 | 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") direction = -1;
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") direction = 1;
  else return;

  event.preventDefault();
  const currentIndex = currentViewOptions.indexOf(value);
  const nextIndex =
    (currentIndex + direction + currentViewOptions.length) % currentViewOptions.length;
  const next = currentViewOptions[nextIndex];
  if (!next) return;
  selectPlane(next);
  planeOptionButtons.get(next)?.focus();
}

function publish(result: ColorResult<ColorValue, PlaneEditError>, complete: boolean): void {
  if (!result.ok) return;
  const observed = represent(result.value, "oklch");
  if (observed.ok && observed.value.channels[2] !== null)
    hueReference.value = { hue: observed.value.channels[2] };
  if (complete) emit("commit", result.value);
  else emit("update:modelValue", result.value);
}

function editOklch(channel: "l" | "c" | "h", value: number, complete: boolean): void {
  publish(
    authorPlaneEdit(revision.value.source, {
      plane: "oklch",
      kind: "channels",
      channels: { [channel]: channel === "h" ? normalizeHue(value) : value },
      ...(channel !== "h" && hueReference.value ? { reference: hueReference.value } : {}),
    }),
    complete,
  );
}

function requireOklabProjection() {
  const projection = field.value?.projection;
  if (projection?.plane !== "oklab")
    throw new Error("OKLab coordinate edit requires the accepted OKLab field");
  return projection;
}

function editOklab(channel: "l" | "a" | "b", value: number, complete: boolean): void {
  const edit =
    channel === "l"
      ? { plane: "oklab" as const, kind: "channels" as const, channels: { l: value } }
      : {
          plane: "oklab" as const,
          kind: "point" as const,
          point: oklabCoordinatePlanePoint(requireOklabProjection(), channel, value),
        };
  publish(authorPlaneEdit(revision.value.source, edit), complete);
}

watch(
  () => revision.value.contextKey,
  () => {
    hueRangeDragging.value = false;
  },
);
</script>

<template>
  <section
    class="plane-instrument"
    data-gp-root
    :data-gp-view="generalized ? accepted.selection.representationId : view"
    data-plane-instrument
    :data-active-plane="view"
    :style="detail ? { '--picker-active': detail.activeCss } : undefined"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId" class="sr-only" data-gp-visually-hidden>Color plane instrument</h2>

    <div
      v-if="generalized"
      class="gp-generalized-selection"
      :data-gp-part="gpPart.representationControl"
    >
      <label :for="`${instanceId}-representation`">Representation</label>
      <select
        :id="`${instanceId}-representation`"
        :value="accepted.selection.representationId"
        :disabled="readOnlyState()"
        @change="selectRepresentation"
      >
        <option v-for="option in currentRepresentationOptions" :key="option" :value="option">
          {{ representationUi[option].label }}
        </option>
      </select>
      <label class="gp-generalized-edit-toggle">
        <input
          type="checkbox"
          :checked="accepted.selection.editorId !== null"
          :disabled="
            readOnlyState() ||
            (accepted.selection.representationId !== 'oklch' &&
              accepted.selection.representationId !== 'oklab')
          "
          @change="toggleInspection"
        />
        Edit coordinates
      </label>
      <small
        v-if="
          accepted.selection.representationId === 'srgb' ||
          accepted.selection.representationId === 'display-p3'
        "
        >Inspection only</small
      >
      <p
        v-if="accepted.authored.representationId !== accepted.selection.representationId"
        :data-gp-part="gpPart.authorshipContext"
      >
        Authored as {{ representationUi[accepted.authored.representationId].label }} ·
        {{ accepted.selection.editorId === null ? "Inspecting" : "Editing" }} as
        {{ representationUi[accepted.selection.representationId].label }}
      </p>
    </div>

    <div v-else class="plane-instrument__view-control" :data-gp-part="gpPart.viewControl">
      <div role="radiogroup" aria-label="Coordinate view" aria-orientation="horizontal">
        <button
          v-for="option in currentViewOptions"
          :key="option"
          :ref="(element) => setPlaneOptionButton(option, element)"
          type="button"
          :data-gp-part="gpPart.viewOption"
          role="radio"
          :aria-checked="view === option"
          :tabindex="view === option ? 0 : -1"
          :data-plane-option="option"
          @click="selectPlane(option)"
          @keydown="movePlaneSelection(option, $event)"
        >
          {{ representationUi[option].label }}
        </button>
      </div>
    </div>

    <div class="plane-instrument__workspace" :data-gp-part="gpPart.workspace">
      <div class="plane-instrument__field" :data-gp-part="gpPart.field">
        <ColorPlane
          v-if="field && detail"
          :model-value="revision.source"
          :semantic-context-key="revision.contextKey"
          :field="field"
          :guides="guides"
          :marker-css="detail.markerCss"
          :edit-reference="hueReference"
          :plane="field.plane"
          :target-guide-point="target?.targetGuidePoint ?? null"
          :target-guide-css="target?.targetGuideCss ?? ''"
          :target-guide-label="target?.targetGuideLabel ?? ''"
          :warning-visible="warningVisible"
          :warning-label="primaryGamutWarning"
          :interaction-preview="fixedAxisFieldPreview"
          @update:model-value="emit('update:modelValue', $event)"
          @commit="emit('commit', $event)"
          @cancel="emit('cancel')"
          @capability="emit('capability', $event)"
        />
        <section
          v-else-if="generalized"
          class="gp-inspection"
          :data-gp-part="gpPart.inspectionReadout"
          :aria-label="`${representationUi[accepted.selection.representationId].label} coordinates`"
        >
          <p v-if="accepted.selection.editorId !== null" :data-gp-part="gpPart.availabilityMessage">
            Editing plane unavailable for this color.
          </p>
          <dl v-if="accepted.observation.ok">
            <div
              v-for="(channel, index) in inspectionUi[accepted.selection.representationId].channels"
              :key="channel.id"
            >
              <dt>{{ channel.label }} ({{ channel.symbol }})</dt>
              <dd>
                {{ formatInspectionNumber(accepted.observation.value.channels[index] ?? null) }}
              </dd>
            </div>
            <div>
              <dt>Alpha</dt>
              <dd>{{ formatInspectionNumber(accepted.observation.value.alpha) }}</dd>
            </div>
          </dl>
          <template v-else>
            <p>Coordinates unavailable for this color.</p>
            <dl>
              <div>
                <dt>Alpha</dt>
                <dd>{{ formatInspectionNumber(accepted.authored.alpha) }}</dd>
              </div>
            </dl>
          </template>
        </section>
        <slot name="field-legend" />
      </div>

      <div class="plane-instrument__controls" :data-gp-part="gpPart.controls">
        <template v-if="field && detail && oklch && help">
          <template v-if="detail.view === 'oklch'">
            <ColorChannelControl
              :key="`${revision.contextKey}:${hue.channelId}:${hue.operationId}`"
              :id="`${instanceId}-hue`"
              :channel="hue.symbol"
              :label="hue.label"
              :model-value="field.samplingFixed"
              :min="hue.sliderRange.min"
              :max="hue.sliderRange.max"
              :step="hue.step"
              :precision="hue.precision"
              :gradient="detail.hueGradient"
              :normalize-value="normalizeHue"
              :intervals="guides.hueIntervals"
              :warning-visible="warningVisible"
              :warning-label="primaryGamutWarning"
              :warning-position="detail.huePosition"
              :help="help.hueHelp ?? ''"
              @update:model-value="editOklch('h', $event, false)"
              @commit="editOklch('h', $event, true)"
              @cancel="emit('cancel')"
              @range-interaction="hueRangeDragging = $event"
            />

            <ColorChannelControl
              :key="`${revision.contextKey}:${lightness.channelId}:${lightness.operationId}`"
              :id="`${instanceId}-lightness`"
              :channel="lightness.symbol"
              :label="lightness.label"
              :model-value="oklch.channels[0]"
              :min="lightness.sliderRange.min"
              :max="lightness.sliderRange.max"
              :step="lightness.step"
              :precision="lightness.precision"
              :gradient="detail.lightnessGradient"
              :intervals="guides.lightnessIntervals"
              :warning-visible="warningVisible"
              :warning-label="primaryGamutWarning"
              :warning-position="oklch.channels[0]"
              @update:model-value="editOklch('l', $event, false)"
              @commit="editOklch('l', $event, true)"
              @cancel="emit('cancel')"
            />

            <ColorChannelControl
              :key="`${revision.contextKey}:${chroma.channelId}:${chroma.operationId}`"
              :id="`${instanceId}-chroma`"
              :channel="chroma.symbol"
              :label="chroma.label"
              :model-value="oklch.channels[1]"
              :min="chroma.sliderRange.min"
              :max="chroma.sliderRange.max"
              :step="chroma.step"
              :precision="chroma.precision"
              :gradient="detail.chromaGradient"
              :markers="target?.markers ?? []"
              :intervals="guides.chromaIntervals"
              v-bind="
                target
                  ? {
                      boundaryPreviewColor: target.targetResult.swatchCss,
                      boundaryPreviewTone: boundaryTarget,
                    }
                  : {}
              "
              :overflow-max="!('max' in chroma.numericBounds)"
              :warning-visible="warningVisible"
              :warning-label="primaryGamutWarning"
              :warning-position="detail.chromaPosition"
              :help="help.chromaHelp ?? ''"
              @update:model-value="editOklch('c', $event, false)"
              @commit="editOklch('c', $event, true)"
              @cancel="emit('cancel')"
            />
          </template>

          <template v-else>
            <ColorChannelControl
              :key="`${revision.contextKey}:${fixedLightness.channelId}:${fixedLightness.operationId}`"
              :id="`${instanceId}-oklab-lightness`"
              :channel="fixedLightness.symbol"
              :label="fixedLightness.label"
              :model-value="field.samplingFixed"
              :min="fixedLightness.sliderRange.min"
              :max="fixedLightness.sliderRange.max"
              :step="fixedLightness.step"
              :precision="fixedLightness.precision"
              :gradient="detail.fixedLightnessGradient"
              :intervals="guides.lightnessIntervals"
              :warning-visible="warningVisible"
              :warning-label="primaryGamutWarning"
              :warning-position="field.samplingFixed"
              :help="help.domainHelp ?? ''"
              @update:model-value="editOklab('l', $event, false)"
              @commit="editOklab('l', $event, true)"
              @cancel="emit('cancel')"
            />
            <div
              class="plane-instrument__coordinate-readout"
              :data-gp-part="gpPart.coordinateReadout"
              aria-label="Editable OKLab coordinates"
            >
              <span>Editable coordinate</span>
              <label>
                <span>{{ a.label }}</span>
                <NumericInput
                  :key="`${revision.contextKey}:${a.channelId}:${a.operationId}`"
                  :model-value="field.projection.representation.channels[1]"
                  :precision="a.precision"
                  :min="a.numericBounds.min"
                  :max="a.numericBounds.max"
                  :step="a.step"
                  inputmode="decimal"
                  data-oklab-coordinate="a"
                  :aria-label="a.numericLabel"
                  @update:model-value="editOklab('a', $event, false)"
                  @commit="editOklab('a', $event, true)"
                  @cancel="emit('cancel')"
                />
              </label>
              <label>
                <span>{{ b.label }}</span>
                <NumericInput
                  :key="`${revision.contextKey}:${b.channelId}:${b.operationId}`"
                  :model-value="y"
                  :precision="b.precision"
                  :min="b.numericBounds.min"
                  :max="b.numericBounds.max"
                  :step="b.step"
                  inputmode="decimal"
                  data-oklab-coordinate="b"
                  :aria-label="b.numericLabel"
                  @update:model-value="editOklab('b', $event, false)"
                  @commit="editOklab('b', $event, true)"
                  @cancel="emit('cancel')"
                />
              </label>
              <small>Disc-bounded radius ≤ 0.4000 · no RGB gamut clamp</small>
            </div>
          </template>
        </template>

        <section
          v-if="target"
          class="plane-instrument__target-result"
          :data-gp-part="gpPart.targetResult"
          :data-gp-status="target.targetResult.status"
          data-boundary-target-result
          :data-boundary-target="boundaryTarget"
          :aria-label="target.accessibleLabel"
          :data-target-exact-status="target.targetResult.status"
        >
          <div class="plane-instrument__target-heading" :data-gp-part="gpPart.targetHeading">
            <span>{{ currentTargetCopy.heading }} · {{ target.targetResult.targetLabel }}</span>
            <span
              class="plane-instrument__target-swatch"
              :data-gp-part="gpPart.targetSwatch"
              data-boundary-guide-swatch
              :style="{ background: target.targetResult.swatchCss }"
              :aria-label="target.swatchLabel"
              role="img"
            />
            <strong :data-target-status="target.displayTone">
              {{ target.displayStatus }}
            </strong>
          </div>
          <dl>
            <div>
              <dt>{{ currentTargetCopy.guideChroma }}</dt>
              <dd>{{ target.targetResult.guideChroma }}</dd>
            </div>
            <div v-if="target.targetResult.showGuideDelta">
              <dt>{{ currentTargetCopy.guideDelta }}</dt>
              <dd>−{{ target.targetResult.guideDelta }}</dd>
            </div>
          </dl>
        </section>
        <section
          v-if="generalized"
          class="gp-generalized-comparison"
          :data-gp-part="gpPart.exactResults"
          aria-label="Gamut comparison"
        >
          <p v-if="accepted.exactChecks.length === 0">No gamut checks selected</p>
          <ul v-else>
            <li
              v-for="row in accepted.exactChecks"
              :key="row.gamutId"
              :data-gp-part="gpPart.exactResult"
              :data-gp-status="row.result.ok ? row.result.value.status : 'unavailable'"
            >
              <span>{{ exactGamutUi[row.gamutId].label }}</span>
              <strong>{{
                exactStatusCopy[row.result.ok ? row.result.value.status : "unavailable"]
              }}</strong>
            </li>
          </ul>
          <details :data-gp-part="gpPart.gamutDisclosure">
            <summary>Gamut checks and guides</summary>
            <fieldset>
              <legend>Exact checks</legend>
              <label v-for="gamutId in gamutIds" :key="gamutId">
                <input
                  type="checkbox"
                  :checked="acceptedState.checkedGamuts.includes(gamutId)"
                  :disabled="readOnlyState()"
                  @change="toggleCheck(gamutId, $event)"
                />
                {{ exactGamutUi[gamutId].label }}
              </label>
            </fieldset>
            <fieldset>
              <legend>Visible guides</legend>
              <label
                v-for="guideId in guideOptions"
                :key="guideId"
                :data-gp-part="gpPart.guidePreference"
              >
                <input
                  type="checkbox"
                  :checked="acceptedState.visibleGuides.includes(guideId)"
                  :disabled="readOnlyState()"
                  @change="toggleGuide(guideId, $event)"
                />
                {{ guidePreferenceUi[guideId].label }}
              </label>
            </fieldset>
            <p v-if="unavailableGuides.length > 0" :data-gp-part="gpPart.availabilityMessage">
              {{
                !field && accepted.selection.editorId === null
                  ? "Requested guides will appear when an editable plane is selected."
                  : "Some requested guides cannot be shown for this color or editor."
              }}
            </p>
          </details>
        </section>
      </div>
    </div>
  </section>
</template>
