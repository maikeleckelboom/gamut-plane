import { Fragment, useLayoutEffect, useRef } from "react";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import type { GuideId } from "@gamut-plane/render";
import { referenceGuidePolicy } from "@gamut-plane/render/internal/capabilities";
import {
  gamutContextMenuGroups,
  gamutContextMenuName,
  generalizedCopy,
  gpPart,
  mountGamutContextMenu,
  type GamutAction,
} from "@gamut-plane/ui";
import { useCommitted } from "../hooks/useCommitted.js";
import type { GamutPlaneState } from "../model/publicState.js";

export function GamutContextMenu({
  id,
  state,
  checks,
  paused,
  readOnly,
  request,
}: {
  id: string;
  state: GamutPlaneState;
  checks: readonly GamutCheckResult[];
  paused: readonly GuideId[];
  readOnly: boolean;
  request(action: GamutAction<GuideId>): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const groups = gamutContextMenuGroups(state, checks, referenceGuidePolicy, paused);
  const current = useCommitted({ groups, readOnly, request });
  const binding = useRef<ReturnType<typeof mountGamutContextMenu> | null>(null);
  useLayoutEffect(() => {
    const surface = menu.current!.parentElement!.querySelector<HTMLElement>(
      '[data-gp-part="surface"]',
    )!;
    const mounted = mountGamutContextMenu(surface, menu.current!, () => current.current!);
    binding.current = mounted;
    return () => {
      mounted.dispose();
      binding.current = null;
    };
  }, [current]);
  useLayoutEffect(() => binding.current?.reconcile());
  return (
    <div
      ref={menu}
      className="gp-gamut-menu"
      data-gp-part={gpPart.gamutContextMenu}
      role="menu"
      aria-label={gamutContextMenuName}
      aria-describedby={readOnly ? `${id}-menu-read-only` : undefined}
      popover="manual"
      hidden
    >
      {readOnly && (
        <span id={`${id}-menu-read-only`} data-gp-visually-hidden="">
          {generalizedCopy.readOnly}
        </span>
      )}
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 && <hr className="gp-gamut-menu-separator" />}
          <div role="group" aria-labelledby={`${id}-menu-${group.id}`}>
            <div id={`${id}-menu-${group.id}`} className="gp-gamut-menu-heading">
              {group.label}
            </div>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="gp-gamut-menu-item"
                role={item.role}
                data-gp-command={item.id}
                aria-checked={item.checked}
                aria-disabled={readOnly}
                aria-labelledby={`${id}-menu-${item.id}-label`}
                aria-describedby={item.fact ? `${id}-menu-${item.id}-fact` : undefined}
                tabIndex={-1}
              >
                <span className="gp-gamut-menu-indicator" aria-hidden="true" />
                <span id={`${id}-menu-${item.id}-label`}>{item.label}</span>
                {item.fact && (
                  <span
                    className="gp-gamut-menu-fact"
                    data-gp-status={item.status ?? undefined}
                    aria-hidden={item.description ? true : undefined}
                    id={item.description ? undefined : `${id}-menu-${item.id}-fact`}
                  >
                    {item.fact}
                  </span>
                )}
                {item.description && (
                  <span id={`${id}-menu-${item.id}-fact`} data-gp-visually-hidden="">
                    {item.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
