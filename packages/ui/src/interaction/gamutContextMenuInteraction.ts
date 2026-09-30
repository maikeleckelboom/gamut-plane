import type { GamutMenuGroup } from "../gamutContextMenu.js";
import type { GamutAction } from "../gamutShell.js";
import { hasInstrumentPointer } from "./pointerOwnership.js";
import { claimShellPopup, releaseShellPopup } from "./shellPopup.js";

type MenuInput<G extends string> = Readonly<{
  groups: readonly GamutMenuGroup<G>[];
  readOnly: boolean;
  request(action: GamutAction<G>): void;
}>;

/** Mounted plane-only mechanics. Native markup and the latest accepted facts stay adapter-owned. */
export function mountGamutContextMenu<G extends string>(
  plane: HTMLElement,
  menu: HTMLElement,
  read: () => MenuInput<G>,
) {
  const document = plane.ownerDocument;
  const window = document.defaultView!;
  const root = plane.closest("[data-gp-root]")!;
  const nativePopover = typeof menu.showPopover === "function";
  let open = false;
  let disposed = false;
  let anchor: Readonly<{ x: number; y: number }> | null = null;
  let resize: ResizeObserver | null = null;

  function items() {
    // ARIA-disabled items remain focusable for inspection, including a wholly read-only menu.
    return Array.from(menu.querySelectorAll<HTMLButtonElement>("button[data-gp-command]"));
  }
  function rove(item: HTMLButtonElement) {
    for (const button of items()) button.tabIndex = button === item ? 0 : -1;
    item.focus();
  }
  function place() {
    if (!open) return;
    const margin = 8;
    menu.style.maxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`;
    menu.style.maxHeight = `${Math.max(0, window.innerHeight - margin * 2)}px`;
    const box = menu.getBoundingClientRect();
    const field = plane.getBoundingClientRect();
    const point = anchor ?? { x: field.left + field.width / 2, y: field.top + field.height / 2 };
    menu.style.left = `${Math.max(margin, Math.min(point.x, window.innerWidth - box.width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(point.y, window.innerHeight - box.height - margin))}px`;
  }
  function outside(event: PointerEvent) {
    if (open && !event.composedPath().includes(menu)) close();
  }
  function focus(event: FocusEvent) {
    if (!open) return;
    if (!event.composedPath().includes(menu)) close();
    else {
      const target = event.target;
      for (const button of items()) button.tabIndex = button === target ? 0 : -1;
    }
  }
  function attach() {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    resize = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(place) : null;
    resize?.observe(plane);
    resize?.observe(menu);
  }
  function detach() {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("focusin", focus);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    resize?.disconnect();
    resize = null;
  }
  function close(restore = false, nativeClosing = false) {
    if (!open) return;
    open = false;
    if (nativePopover && !nativeClosing && menu.matches(":popover-open")) menu.hidePopover();
    menu.hidden = true;
    releaseShellPopup(root, close);
    detach();
    for (const button of items()) button.tabIndex = -1;
    if (restore && plane.isConnected) plane.focus({ preventScroll: true });
  }
  function invoke(event: MouseEvent) {
    if (disposed) return;
    const pointerType = "pointerType" in event ? (event as PointerEvent).pointerType : "";
    if (pointerType === "touch") return;
    // Suppress the native menu during owned gestures so it cannot take capture/focus. Never
    // finish, cancel or queue an action on the owning controller's behalf.
    event.preventDefault();
    event.stopPropagation();
    if (hasInstrumentPointer(plane)) return;
    // Chromium emits button -1 for both ContextMenu and Shift+F10. Legacy keyboard events
    // can instead have button 0 and no pointer coordinates. The browser event is the only opener.
    const keyboard =
      event.button === -1 || (event.button === 0 && event.clientX === 0 && event.clientY === 0);
    anchor = keyboard ? null : { x: event.clientX, y: event.clientY };
    if (!open) {
      claimShellPopup(root, close);
      open = true;
      menu.hidden = false;
      // Manual top-layer markup avoids native light-dismiss on mouseup in browsers that dispatch
      // contextmenu on mousedown. This controller owns dismissal; source preserves the host invoker.
      if (nativePopover) menu.showPopover({ source: plane });
      attach();
    }
    place();
    const buttons = items();
    const preferred = buttons.find(
      (button) =>
        button.getAttribute("role") === "menuitemradio" &&
        button.getAttribute("aria-checked") === "true",
    );
    if (preferred ?? buttons[0]) rove((preferred ?? buttons[0])!);
  }
  function activate(event: MouseEvent) {
    if (!open || !(event.target instanceof window.Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-gp-command]");
    if (!button || !menu.contains(button)) return;
    const input = read();
    if (input.readOnly) return;
    const item = input.groups
      .flatMap((group) => group.items)
      .find((item) => item.id === button.dataset.gpCommand);
    if (!item) return;
    input.request(item.action);
    close(true);
  }
  function key(event: KeyboardEvent) {
    if (!open || event.isComposing) return;
    if (event.key === "Tab") {
      // Resume the document's sequential order at the plane; the browser performs this Tab.
      close(true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const buttons = items();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) buttons[index]?.click();
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    const button = buttons[next];
    if (button) rove(button);
  }
  function toggle(event: Event) {
    if ((event as ToggleEvent).newState === "closed") close(false, true);
  }
  plane.addEventListener("contextmenu", invoke);
  menu.addEventListener("click", activate);
  menu.addEventListener("keydown", key);
  menu.addEventListener("beforetoggle", toggle);
  return {
    reconcile() {
      if (!disposed) place();
    },
    dispose() {
      close();
      disposed = true;
      plane.removeEventListener("contextmenu", invoke);
      menu.removeEventListener("click", activate);
      menu.removeEventListener("keydown", key);
      menu.removeEventListener("beforetoggle", toggle);
    },
  };
}
