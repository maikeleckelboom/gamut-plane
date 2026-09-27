import type {
  ChannelId,
  EditOperationId,
  EditorDefinition,
  EditorId,
  RepresentationDefinition,
} from "@gamut-plane/core/internal/capabilities";
import {
  currentEditorByView,
  currentPrimaryEditors,
  editorUi,
  representationUi,
  type CompanionBinding,
  type EditorUi,
} from "../src/instrumentMetadata.js";

for (const row of Object.values(representationUi)) row.id satisfies RepresentationDefinition["id"];
for (const editor of currentPrimaryEditors) {
  editor.id satisfies EditorId;
  const identity: Pick<EditorDefinition, "id" | "representationId"> = editor;
  void identity;
  for (const control of editor.companions) {
    control.channelId satisfies ChannelId;
    control.operationId satisfies EditOperationId;
    control satisfies CompanionBinding;
  }
}

// @ts-expect-error an OKLCH channel cannot bind an OKLab semantic operation
const wrongRepresentation: CompanionBinding = {
  channelId: "oklch.h",
  operationId: "oklab-disc-coordinate",
};
// @ts-expect-error normalized Hue authorship cannot bind Lightness
const wrongHue: CompanionBinding = { channelId: "oklch.l", operationId: "oklch-hue-edit" };
// @ts-expect-error a point operation is not a companion scalar operation
const pointCompanion: CompanionBinding = { channelId: "oklab.a", operationId: "oklab-ab-point" };
const inventedChannel: CompanionBinding = {
  // @ts-expect-error no invented qualified channels
  channelId: "oklab.c",
  operationId: "oklab-channel-patch",
};
// @ts-expect-error no invented operations
const inventedOperation: CompanionBinding = { channelId: "oklab.a", operationId: "oklab-a-number" };
// @ts-expect-error editor identity and representation remain correlated
const wrongEditor: EditorUi = { ...editorUi["oklab-ab"], representationId: "oklch" };
// @ts-expect-error companion channels must belong to their primary context
const wrongCompanions: EditorUi = {
  ...editorUi["oklab-ab"],
  companions: editorUi["oklch-lc"].companions,
};
// @ts-expect-error metadata existence does not grant RGB primary admission
void currentEditorByView.srgb;
// @ts-expect-error product metadata is readonly
editorUi["oklch-lc"].companions[0].step = 1;
void [
  wrongRepresentation,
  wrongHue,
  pointCompanion,
  inventedChannel,
  inventedOperation,
  wrongEditor,
  wrongCompanions,
];
