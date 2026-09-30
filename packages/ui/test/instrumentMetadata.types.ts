import type {
  ChannelId,
  EditOperationId,
  EditorDefinition,
  EditorId,
  RepresentationDefinition,
} from "@gamut-plane/core/internal/capabilities";
import {
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
// @ts-expect-error product metadata is readonly
editorUi["oklch-lc"].companions[0].step = 1;
editorUi["srgb-rg"].companions[0].channelId satisfies "srgb.r";
editorUi["display-p3-gb"].companions[2].operationId satisfies "display-p3-channel-patch";
// @ts-expect-error RGB companion metadata cannot be relabelled to another encoding
const wrongRgbMetadata: EditorUi = {
  ...editorUi["srgb-rg"],
  companions: editorUi["display-p3-rg"].companions,
};
void wrongRgbMetadata;
// @ts-expect-error the new patch encoding cannot accept another RGB representation's channel
const wrongRgbCompanion: CompanionBinding = {
  channelId: "display-p3.r",
  operationId: "srgb-channel-patch",
};
void [
  wrongRepresentation,
  wrongHue,
  pointCompanion,
  inventedChannel,
  inventedOperation,
  wrongEditor,
  wrongCompanions,
  wrongRgbCompanion,
];
