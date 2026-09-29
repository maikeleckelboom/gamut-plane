<script setup lang="ts">
import {
  normalizeHue,
  represent,
  type ColorResult,
  type ColorValue,
  type GamutId,
  type PlaneEditError,
  type PlaneEditReference,
} from "@gamut-plane/core";
import { editOperationDefinitions } from "@gamut-plane/core/internal/capabilities";
import { computed, getCurrentInstance, onBeforeUpdate, ref, shallowRef, useId, watch } from "vue";
import {
  gpPart,
  editorUi,
  representationUi,
  currentEditorHelp,
  canonicalInstrumentState,
  currentRepresentationOptions,
  currentAdmittedEditorsForRepresentation,
  exactGamutUi,
  exactStatusCopy,
  generalizedCopy,
  authorshipContextCopy,
  admittedReferenceGamuts,
  requestReferenceGamut,
  referenceWarning,
  formatInspectionNumber,
  initialInstrumentState,
  inspectionUi,
  instrumentViewStatesEqual,
  requestCheckedGamut,
  requestInspection,
  requestRepresentation,
  requestVisibleGuide,
} from "@gamut-plane/ui";
import NumericInput from "./NumericInput.vue";
import { resolveAcceptedRevision } from "../model/acceptedResolution.js";
import { presentAcceptedRevision } from "../model/acceptedPresentation.js";

import ColorChannelControl from "./ColorChannelControl.vue";
import ColorPlane from "./ColorPlane.vue";
import type { CanvasColorSpaceStatus, GuideId } from "@gamut-plane/render";
import {
  generalizedEditableDetail,
  generalizedGuideDisplay,
  referenceDisplay,
} from "@gamut-plane/render/internal/current";
import { referenceGuidePolicy } from "@gamut-plane/render/internal/capabilities";
import type { GamutPlaneState } from "../model/publicState.js";

const props = defineProps<{
  modelValue: ColorValue;
  state?: GamutPlaneState;
  defaultState?: GamutPlaneState;
}>();

const emit = defineEmits<{
  "update:modelValue": [color: ColorValue];
  commit: [color: ColorValue];
  cancel: [];
  capability: [status: CanvasColorSpaceStatus];
  "update:state": [state: GamutPlaneState];
}>();

defineSlots<{ "field-legend"(): unknown }>();

const instance = getCurrentInstance();
function hasRawProp(name: string): boolean {
  return Object.hasOwn(instance?.vnode.props ?? {}, name);
}
const controlledState = hasRawProp("state");
function verifyOwnership(): void {
  if (hasRawProp("state") !== controlledState)
    throw new Error("GamutPlane state ownership cannot change during an instance lifetime");
}
verifyOwnership();
onBeforeUpdate(verifyOwnership);
const guideIds = Object.freeze([
  "display-p3-boundary",
  "srgb-boundary",
] as const satisfies readonly GuideId[]);
const localState = shallowRef<GamutPlaneState>(
  canonicalInstrumentState(
    props.defaultState ?? initialInstrumentState<GuideId>(guideIds),
    guideIds,
  ),
);
const readOnlyState = () => controlledState && !hasRawProp("onUpdate:state");
const acceptedState = computed(() =>
  controlledState ? canonicalInstrumentState(props.state, guideIds) : localState.value,
);
function requestState(nextInput: GamutPlaneState): void {
  if (readOnlyState()) return;
  const next = canonicalInstrumentState(nextInput, guideIds);
  if (instrumentViewStatesEqual(acceptedState.value, next)) return;
  if (!controlledState) localState.value = next;
  emit("update:state", next);
}
const instanceId = useId();
const comparison = ref<HTMLDetailsElement | null>(null);
const titleId = `${instanceId}-instrument-title`;

const [hue, lightness, chroma] = editorUi["oklch-lc"].companions;
const [fixedLightness, a, b] = editorUi["oklab-ab"].companions;
const revision = computed(() => resolveAcceptedRevision(props.modelValue, acceptedState.value));
const accepted = computed(() => presentAcceptedRevision(revision.value));
const generalizedVisual = computed(() =>
  generalizedEditableDetail(
    revision.value.source,
    accepted.value.observation,
    accepted.value.editor,
    accepted.value.field,
  ),
);
const field = computed(() =>
  generalizedVisual.value.kind === "available" ? generalizedVisual.value.field : null,
);
const oklch = computed(() =>
  generalizedVisual.value.kind === "available" ? generalizedVisual.value.oklch : null,
);
const detail = computed(() =>
  generalizedVisual.value.kind === "available" ? generalizedVisual.value.detail : null,
);
const view = computed(() => field.value?.projection.representationId ?? null);
const guides = computed(() => generalizedGuideDisplay(accepted.value.guides));
const reference = computed(() =>
  referenceDisplay(
    acceptedState.value.referenceGamutId,
    accepted.value.guides,
    field.value,
    accepted.value.exactChecks,
  ),
);
const warning = computed(() =>
  referenceWarning(acceptedState.value.referenceGamutId, accepted.value.exactChecks),
);
const gamutRows = computed(() =>
  admittedReferenceGamuts.map((gamutId) => {
    const check = accepted.value.exactChecks.find((row) => row.gamutId === gamutId);
    return {
      gamutId,
      label: exactGamutUi[gamutId].label,
      guideId: referenceGuidePolicy[gamutId],
      status: check
        ? check.result.ok
          ? check.result.value.status
          : ("unavailable" as const)
        : null,
    };
  }),
);
const help = computed(() =>
  field.value && oklch.value
    ? currentEditorHelp(
        field.value.editorId,
        field.value.geometry.domain.kind,
        oklch.value.channels[2] === null,
        field.value.markerInDomain,
      )
    : null,
);
const unavailableGuides = computed(() =>
  accepted.value.guides.filter(
    (guide) =>
      !field.value ||
      !detail.value ||
      guide.kind !== "resolved" ||
      guide.forms.contour.kind !== "available",
  ),
);
const y = computed(() => field.value?.projection.coordinates.y ?? 0);
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

function selectReference(gamutId: GamutId | null): void {
  requestState(requestReferenceGamut(acceptedState.value, gamutId));
  // A controlled parent may reject the native radio change; restore the entire group.
  for (const input of comparison.value?.querySelectorAll<HTMLInputElement>(
    "input[data-reference-choice]",
  ) ?? []) {
    input.checked = input.value === (acceptedState.value.referenceGamutId ?? "none");
  }
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
  if (channel === "h") {
    const operation = editOperationDefinitions[hue.operationId];
    publish(
      operation.author(revision.value.source, {
        ...operation.request,
        channels: { h: operation.normalize(value) },
      }),
      complete,
    );
  } else if (channel === "l") {
    const operation = editOperationDefinitions[lightness.operationId];
    publish(
      operation.author(revision.value.source, {
        ...operation.request,
        channels: { l: value },
        ...(hueReference.value ? { reference: hueReference.value } : {}),
      }),
      complete,
    );
  } else {
    const operation = editOperationDefinitions[chroma.operationId];
    publish(
      operation.author(revision.value.source, {
        ...operation.request,
        channels: { c: value },
        ...(hueReference.value ? { reference: hueReference.value } : {}),
      }),
      complete,
    );
  }
}

function requireOklabProjection() {
  const projection = field.value?.projection;
  if (projection?.representationId !== "oklab")
    throw new Error("OKLab coordinate edit requires the accepted OKLab field");
  return {
    plane: "oklab" as const,
    representation: projection.representation,
    point: projection.point,
  };
}

function editOklab(channel: "l" | "a" | "b", value: number, complete: boolean): void {
  if (channel === "l") {
    const operation = editOperationDefinitions[fixedLightness.operationId];
    publish(
      operation.author(revision.value.source, {
        ...operation.request,
        channels: { l: value },
      }),
      complete,
    );
  } else {
    const control = channel === "a" ? a : b;
    const operation = editOperationDefinitions[control.operationId];
    publish(
      operation.author(revision.value.source, {
        ...operation.request,
        point: operation.toPoint(requireOklabProjection(), channel, value),
      }),
      complete,
    );
  }
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
    :data-gp-view="accepted.selection.representationId"
    data-plane-instrument
    :data-active-plane="view"
    :style="detail ? { '--picker-active': detail.activeCss } : undefined"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId" class="sr-only" data-gp-visually-hidden>{{ generalizedCopy.instrument }}</h2>

    <div class="gp-generalized-selection" :data-gp-part="gpPart.representationControl">
      <div class="gp-context-row">
        <div class="gp-context-space">
          <label :for="`${instanceId}-representation`">{{ generalizedCopy.representation }}</label>
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
        </div>
        <label
          v-if="
            currentAdmittedEditorsForRepresentation(accepted.selection.representationId).length > 0
          "
          class="gp-generalized-edit-toggle"
        >
          <input
            type="checkbox"
            :checked="accepted.selection.editorId !== null"
            :disabled="readOnlyState()"
            @change="toggleInspection"
          />
          {{ generalizedCopy.editCoordinates }}
        </label>
        <span v-else class="gp-context-mode">{{ generalizedCopy.inspectionOnly }}</span>
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
          :reference="reference"
          :warning="warning"
          :marker-css="detail.markerCss"
          :edit-reference="hueReference"
          :plane="field.plane"
          :interaction-preview="fixedAxisFieldPreview"
          @update:model-value="emit('update:modelValue', $event)"
          @commit="emit('commit', $event)"
          @cancel="emit('cancel')"
          @capability="emit('capability', $event)"
        />
        <section
          v-else
          class="gp-inspection"
          :data-gp-part="gpPart.inspectionReadout"
          :aria-label="`${representationUi[accepted.selection.representationId].label} coordinates`"
        >
          <h3>{{ generalizedCopy.coordinates }}</h3>
          <p v-if="accepted.selection.editorId !== null" :data-gp-part="gpPart.availabilityMessage">
            {{ generalizedCopy.planeUnavailable }}
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
              <dt>{{ generalizedCopy.alpha }}</dt>
              <dd>{{ formatInspectionNumber(accepted.observation.value.alpha) }}</dd>
            </div>
          </dl>
          <template v-else>
            <p>{{ generalizedCopy.coordinatesUnavailable }}</p>
            <dl>
              <div>
                <dt>{{ generalizedCopy.alpha }}</dt>
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
              :warning="warning"
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
              :help="help.hueHelp ?? ''"
              @update:model-value="editOklch('h', $event, false)"
              @commit="editOklch('h', $event, true)"
              @cancel="emit('cancel')"
              @range-interaction="hueRangeDragging = $event"
            />

            <ColorChannelControl
              :warning="warning"
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
              @update:model-value="editOklch('l', $event, false)"
              @commit="editOklch('l', $event, true)"
              @cancel="emit('cancel')"
            />

            <ColorChannelControl
              :warning="warning"
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
              :intervals="guides.chromaIntervals"
              :overflow-max="!('max' in chroma.numericBounds)"
              :help="help.chromaHelp ?? ''"
              @update:model-value="editOklch('c', $event, false)"
              @commit="editOklch('c', $event, true)"
              @cancel="emit('cancel')"
            />
          </template>

          <template v-else>
            <ColorChannelControl
              :warning="warning"
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
              :help="help.domainHelp ?? ''"
              @update:model-value="editOklab('l', $event, false)"
              @commit="editOklab('l', $event, true)"
              @cancel="emit('cancel')"
            />
            <div
              class="plane-instrument__coordinate-readout"
              :data-gp-part="gpPart.coordinateReadout"
              :aria-label="generalizedCopy.oklabCoordinates"
            >
              <span>{{ generalizedCopy.coordinates }}</span>
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
            </div>
          </template>
        </template>

        <p
          v-if="accepted.authored.representationId !== accepted.selection.representationId"
          :data-gp-part="gpPart.authorshipContext"
        >
          {{ authorshipContextCopy(accepted.authored.representationId) }}
        </p>
        <section
          class="gp-generalized-comparison"
          :data-gp-part="gpPart.exactResults"
          :aria-label="generalizedCopy.comparison"
        >
          <details ref="comparison" :data-gp-part="gpPart.gamutDisclosure">
            <summary>
              <span>{{ generalizedCopy.disclosure }}</span>
              <small v-if="unavailableGuides.length > 0">{{
                generalizedCopy.boundaryPaused
              }}</small>
            </summary>
            <fieldset v-for="row in gamutRows" :key="row.gamutId" class="gp-gamut-row">
              <legend>{{ row.label }}</legend>
              <span
                v-if="row.status !== null"
                :data-gp-part="gpPart.exactResult"
                :data-gp-gamut="row.gamutId"
                :data-gp-status="row.status"
              >
                <strong>{{ exactStatusCopy[row.status] }}</strong>
              </span>
              <div class="gp-gamut-choices">
                <label>
                  <input
                    type="checkbox"
                    :aria-label="`${row.label} Status`"
                    :checked="acceptedState.checkedGamuts.includes(row.gamutId)"
                    :disabled="readOnlyState()"
                    @change="toggleCheck(row.gamutId, $event)"
                  />
                  {{ generalizedCopy.exactChecks }}
                </label>
                <label :data-gp-part="gpPart.guidePreference">
                  <input
                    type="checkbox"
                    :aria-label="`${row.label} Boundary`"
                    :checked="acceptedState.visibleGuides.includes(row.guideId)"
                    :disabled="readOnlyState()"
                    @change="toggleGuide(row.guideId, $event)"
                  />
                  {{ generalizedCopy.visibleGuides }}
                </label>
                <label>
                  <input
                    type="radio"
                    :name="`${instanceId}-reference`"
                    :value="row.gamutId"
                    data-reference-choice
                    :aria-label="`Use ${row.label} as Reference`"
                    :checked="acceptedState.referenceGamutId === row.gamutId"
                    :disabled="readOnlyState()"
                    @change="selectReference(row.gamutId)"
                  />
                  {{ generalizedCopy.reference }}
                </label>
              </div>
            </fieldset>
            <label class="gp-no-reference">
              <input
                type="radio"
                :name="`${instanceId}-reference`"
                value="none"
                data-reference-choice
                :checked="acceptedState.referenceGamutId === null"
                :disabled="readOnlyState()"
                @change="selectReference(null)"
              />
              {{ generalizedCopy.noReference }}
            </label>
            <p v-if="unavailableGuides.length > 0" :data-gp-part="gpPart.availabilityMessage">
              {{
                !field && accepted.selection.editorId === null
                  ? generalizedCopy.guidesPending
                  : generalizedCopy.guidesUnavailable
              }}
            </p>
          </details>
        </section>
      </div>
    </div>
  </section>
</template>
