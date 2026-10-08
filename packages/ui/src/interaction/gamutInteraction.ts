import { hasInstrumentPointer } from "./pointerOwnership.js";
import { mountPopoverLifecycle } from "./popoverLifecycle.js";
import { claimShellPopup, releaseShellPopup } from "./shellPopup.js";

/** Mounted DOM mechanics for the nonmodal Gamuts surface. Its native controls stay adapter-owned
 * and reflect accepted state; opening, closing or replacement requests neither state nor analysis. */
export function mountGamutPopup(trigger: HTMLButtonElement, popup: HTMLElement) {
  const document = trigger.ownerDocument;
  const window = document.defaultView!;
  const root = trigger.closest("[data-gp-root]") ?? trigger.parentElement!;
  let open = false;
  let disposed = false;
  let pressedOpen = false;
  let resize: ResizeObserver | null = null;
  const popover = mountPopoverLifecycle(popup, close);

  function within(event: Event) {
    const path = event.composedPath();
    return path.includes(trigger) || path.includes(popup);
  }
  function place() {
    if (!open) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(rect.width, window.innerWidth - margin * 2);
    popup.style.width = `${width}px`;
    // Measure after the width is fixed: rows reflow with the anchored instrument width.
    const height = popup.scrollHeight + popup.offsetHeight - popup.clientHeight;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const up = below < height && above > below;
    const available = Math.max(0, (up ? above : below) - 4);
    popup.style.maxHeight = `${available}px`;
    popup.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
    popup.style.top = `${up ? Math.max(margin, rect.top - Math.min(height, available) - 4) : rect.bottom + 4}px`;
  }
  function outside(event: PointerEvent) {
    // Dismiss without stealing the pointer target's intended focus.
    if (open && !within(event)) close();
  }
  function focus(event: FocusEvent) {
    if (open && !within(event)) close();
  }
  function attach() {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    resize = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(place) : null;
    resize?.observe(trigger);
  }
  function detach() {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("focusin", focus);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    resize?.disconnect();
    resize = null;
  }
  function close(restore = false) {
    if (!open) return;
    open = false;
    trigger.setAttribute("aria-expanded", "false");
    popover.hide();
    releaseShellPopup(root, close);
    detach();
    if (restore && trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  function show() {
    if (disposed || open || hasInstrumentPointer(trigger)) return;
    claimShellPopup(root, close);
    open = true;
    trigger.setAttribute("aria-expanded", "true");
    popover.show(trigger);
    attach();
    place();
    // Nonmodal: focus stays on the invoker, and the surface follows it in sequential focus order.
    trigger.focus({ preventScroll: true });
  }
  function click(event: MouseEvent) {
    // Native light dismiss can close the surface during this very press; its click must not reopen.
    const dismissed = event.detail > 0 && pressedOpen && !open;
    pressedOpen = false;
    if (open) close();
    else if (!dismissed) show();
  }
  function key(event: KeyboardEvent) {
    if (!open || event.key !== "Escape" || event.isComposing) return;
    // Consume Escape so an enclosing host or plane does not also act on it.
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }
  function guard(event: PointerEvent) {
    if (hasInstrumentPointer(trigger)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    pressedOpen = open;
  }
  function dismiss(event: MouseEvent) {
    if (event.target instanceof window.Element && event.target.closest("[data-gp-close]"))
      close(true);
  }
  trigger.addEventListener("click", click);
  trigger.addEventListener("keydown", key);
  trigger.addEventListener("pointerdown", guard);
  popup.addEventListener("keydown", key);
  popup.addEventListener("click", dismiss);
  return {
    reconcile() {
      if (!disposed) place();
    },
    dispose() {
      close();
      disposed = true;
      trigger.removeEventListener("click", click);
      trigger.removeEventListener("keydown", key);
      trigger.removeEventListener("pointerdown", guard);
      popup.removeEventListener("keydown", key);
      popup.removeEventListener("click", dismiss);
      popover.dispose();
    },
  };
}
