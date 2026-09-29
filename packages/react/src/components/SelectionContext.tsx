import {
  generalizedCopy,
  gpPart,
  selectionContext,
  requestShellSelection,
  type SelectorOption,
  type ShellSelection,
  type ShellEditor,
  type SelectionFacts,
  type SelectionAction,
} from "@gamut-plane/ui";
import { Selector } from "./Selector.js";

/** Internal shell accepts admission facts for cardinality proof; public GamutPlane supplies shipped facts only. */
export function SelectionContext({
  id,
  selection,
  options,
  disabled,
  request,
  facts,
}: {
  id: string;
  selection: ShellSelection;
  options: readonly SelectorOption[];
  disabled: boolean;
  request(selection: ShellSelection): void;
  facts?: SelectionFacts<ShellEditor>;
}) {
  const context = selectionContext(selection, facts);
  function act(action: SelectionAction) {
    if (disabled) return;
    const next = requestShellSelection(selection, action, facts);
    if (next !== selection) request(next);
  }
  return (
    <div className="gp-generalized-selection" data-gp-part={gpPart.representationControl}>
      <div className="gp-context-row">
        <Selector
          id={`${id}-representation`}
          label={generalizedCopy.representation}
          value={selection.representationId}
          options={options}
          disabled={disabled}
          request={(value) => act({ kind: "representation", value })}
        />
        {context.canEdit ? (
          <fieldset className="gp-mode" disabled={disabled}>
            <legend data-gp-visually-hidden="">{generalizedCopy.interactionMode}</legend>
            {(["edit", "inspect"] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={mode}
                  checked={context.editing === (mode === "edit")}
                  onChange={() => act({ kind: "mode", value: mode })}
                />
                <span>{generalizedCopy[mode]}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <span className="gp-context-mode">{generalizedCopy.inspectionOnly}</span>
        )}
      </div>
      {context.areas.length > 1 && (
        <Selector
          id={`${id}-area`}
          label={generalizedCopy.area}
          value={selection.editorId!}
          options={context.areas}
          disabled={disabled}
          request={(value) => act({ kind: "area", value })}
        />
      )}
    </div>
  );
}
