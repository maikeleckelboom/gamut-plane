import {
  analyzeRequestedGamuts,
  representationDefinitions,
} from "@gamut-plane/core/internal/capabilities";
import { createApp, h, ref } from "vue";
import { createColorValue, definitionOf } from "@gamut-plane/core";
import {
  coordinatesOptions,
  requestGamutAction,
  shellSelectionFacts,
  semanticContextKey,
  type GamutAction,
  type ShellSelection,
} from "../../../../packages/ui/src/index.js";
import GamutPlane from "../../../../packages/vue/src/components/GamutPlane.vue";
import GamutComparison from "../../../../packages/vue/src/components/GamutComparison.vue";
import SelectionContext from "../../../../packages/vue/src/components/SelectionContext.vue";
import type { GamutPlaneState } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

document.body.style.cssText =
  "margin:24px;background:#15171a;color:white;font-family:Arial,sans-serif";
const query = new URLSearchParams(location.search);
const created = query.has("lab")
  ? createColorValue({
      space: "oklab",
      channels: [0.68, Number(query.get("a") ?? 0.1), Number(query.get("b") ?? 0.2)],
      alpha: 0.37,
    })
  : query.has("unavailable")
    ? createColorValue({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 })
    : createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 1 });
if (!created.ok) throw Error("fixture");
const initial = created.value;
const readOnly = query.has("readonly");
const guideIds = ["display-p3-boundary", "srgb-boundary"] as const;
const alternate = { id: "test-hc", representationId: "oklch", label: "Hue / Chroma" } as const;
const facts = {
  ...shellSelectionFacts,
  knownEditors: [...shellSelectionFacts.knownEditors, alternate],
  admittedEditors: [...shellSelectionFacts.admittedEditors, alternate],
};
createApp({
  setup() {
    const value = ref(initial);
    const state = ref<GamutPlaneState>({
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
      visibleGuides: ["srgb-boundary", "display-p3-boundary"],
      referenceGamutId: "srgb-gamut",
    });
    const selection = ref<ShellSelection>({ representationId: "oklch", editorId: "test-hc" });
    const commits = ref(0);
    const updates = ref(0);
    const requests = ref(0);
    const reject = ref(false);
    const requestState = (next: GamutPlaneState) => {
      requests.value++;
      if (!reject.value) state.value = next;
    };
    // Secondary hosts use the same shared accepted-state action route as the instrument.
    const gamuts = (id: string) =>
      h(GamutComparison, {
        id,
        state: state.value,
        checks: analyzeRequestedGamuts(value.value, state.value.checkedGamuts),
        paused: [],
        readOnly: false,
        onRequest: (action: GamutAction<(typeof guideIds)[number]>) =>
          requestState(requestGamutAction(state.value, action, guideIds)),
      });
    return () =>
      h("main", [
        h("div", { id: "controls" }, [
          h(
            "button",
            {
              onClick: () => {
                reject.value = !reject.value;
              },
            },
            "Reject requests",
          ),
          h(
            "button",
            {
              onClick: () => {
                state.value = {
                  ...state.value,
                  checkedGamuts: [],
                  visibleGuides: [],
                  referenceGamutId: null,
                };
              },
            },
            "Clear comparison",
          ),
          h(
            "button",
            { onClick: () => document.querySelector("dialog")!.showModal() },
            "Open host dialog",
          ),
          h("button", { popovertarget: "host-popover" }, "Open host popover"),
        ]),
        h("div", { id: "instrument", style: "width:440px;max-width:100%" }, [
          h(GamutPlane, {
            modelValue: value.value,
            state: state.value,
            "onUpdate:modelValue": (next) => {
              value.value = next;
              updates.value++;
            },
            onCommit: () => {
              commits.value++;
            },
            ...(readOnly ? {} : { "onUpdate:state": requestState }),
          }),
        ]),
        h("output", {
          id: "events",
          "data-commits": commits.value,
          "data-updates": updates.value,
          "data-requests": requests.value,
          "data-definition": JSON.stringify(definitionOf(value.value)),
          "data-context": semanticContextKey(state.value.selection),
        }),
        h(
          "section",
          {
            "data-gp-root": "",
            id: "area-fixture",
            style: "width:440px;max-width:100%;margin-top:24px",
          },
          [
            h(SelectionContext, {
              id: "area-test",
              selection: selection.value,
              options: coordinatesOptions([], [], representationDefinitions),
              disabled: false,
              facts,
              onRequest: (next) => {
                selection.value = next;
              },
            }),
            gamuts("area-gamuts"),
          ],
        ),
        h("output", { id: "area-context" }, semanticContextKey(selection.value)),
        h("dialog", [
          h("div", { "data-gp-root": "", style: "width:440px;overflow:hidden" }, [
            h(SelectionContext, {
              id: "dialog-test",
              selection: selection.value,
              options: coordinatesOptions([], [], representationDefinitions),
              disabled: false,
              facts,
              onRequest: (next) => {
                selection.value = next;
              },
            }),
            gamuts("dialog-gamuts"),
          ]),
        ]),
        h("div", { id: "host-popover", popover: "auto" }, [
          h("section", { "data-gp-root": "", style: "width:440px;overflow:hidden" }, [
            h(SelectionContext, {
              id: "popover-test",
              selection: selection.value,
              options: coordinatesOptions([], [], representationDefinitions),
              disabled: false,
              facts,
              onRequest: (next) => {
                selection.value = next;
              },
            }),
            gamuts("popover-gamuts"),
          ]),
        ]),
      ]);
  },
}).mount("#fixture");
