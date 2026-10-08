import { useLayoutEffect, useRef } from "react";
import {
  exactStatusCopy,
  mountSelector,
  selectorGroups,
  type SelectorInput,
} from "@gamut-plane/ui";
import { useCommitted } from "../hooks/useCommitted.js";

export function Selector(
  props: SelectorInput & { id: string; label: string; inlineLabel?: boolean },
) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const current = useCommitted(props);
  const binding = useRef<ReturnType<typeof mountSelector> | null>(null);
  useLayoutEffect(() => {
    const mounted = mountSelector(trigger.current!, popup.current!, () => current.current!);
    binding.current = mounted;
    return () => {
      mounted.dispose();
      binding.current = null;
    };
  }, [current]);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  return (
    <div className="gp-selector">
      <label id={`${props.id}-label`} htmlFor={props.id}>
        {props.label}
      </label>
      <button
        ref={trigger}
        id={props.id}
        type="button"
        role="combobox"
        aria-labelledby={`${props.id}-label`}
        aria-expanded="false"
        aria-haspopup="listbox"
        aria-controls={`${props.id}-list`}
        aria-describedby={
          props.options.find((option) => option.value === props.value)?.description
            ? `${props.id}-description`
            : undefined
        }
        disabled={props.disabled}
      >
        {props.inlineLabel && (
          <span className="gp-selector-inline-label" aria-hidden="true">
            {props.label}
          </span>
        )}
        <span>{props.options.find((option) => option.value === props.value)?.label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {props.options.find((option) => option.value === props.value)?.description && (
        <span id={`${props.id}-description`} data-gp-visually-hidden="">
          {props.options.find((option) => option.value === props.value)?.description}
        </span>
      )}
      <div
        ref={popup}
        id={`${props.id}-list`}
        className="gp-selector-popup"
        role="listbox"
        aria-labelledby={`${props.id}-label`}
        popover="auto"
        hidden
      >
        {selectorGroups(props.options).map((group, groupIndex) => (
          <div
            key={groupIndex}
            role={group.label ? "group" : undefined}
            aria-labelledby={group.label ? `${props.id}-group-${groupIndex}` : undefined}
          >
            {group.label && (
              <div id={`${props.id}-group-${groupIndex}`} className="gp-selector-heading">
                {group.label}
              </div>
            )}
            {group.options.map(({ option, index }) => (
              <div
                key={option.value}
                id={`${props.id}-option-${index}`}
                role="option"
                data-value={option.value}
                aria-selected={option.value === props.value}
                aria-label={
                  option.status
                    ? `${option.label}, gamut status ${exactStatusCopy[option.status]}`
                    : `${option.optionLabel ?? option.label}${option.description ? `. ${option.description}` : ""}`
                }
              >
                <span className="gp-selector-check" aria-hidden="true">
                  {option.value === props.value ? "✓" : ""}
                </span>
                <span className="gp-selector-name">{option.optionLabel ?? option.label}</span>
                {option.coordinates && (
                  <span className="gp-selector-coordinates" aria-hidden="true">
                    {option.coordinates}
                  </span>
                )}
                {option.status && (
                  <span className="gp-selector-status" data-gp-status={option.status}>
                    {option.status ? exactStatusCopy[option.status] : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
