import type { SelectorOption } from "../selectionShell.js";
import { hasInstrumentPointer } from "./pointerOwnership.js";
import { claimShellPopup, releaseShellPopup } from "./shellPopup.js";

export interface SelectorInput {
  value: string;
  options: readonly SelectorOption[];
  disabled: boolean;
  request(value: string): void;
}

/** Mounted DOM mechanics only. Accepted values and option markup belong to the adapter.
 * Candidate changes touch only this selector, below accepted color resolution. */
export function mountSelector(
  trigger: HTMLButtonElement,
  popup: HTMLElement,
  current: () => SelectorInput,
) {
  const document = trigger.ownerDocument;
  const window = document.defaultView!;
  const root = trigger.closest("[data-gp-root]") ?? trigger.parentElement!;
  let open = false;
  let pressedOpen = false;
  let candidate = current().value;
  let accepted = current().value;
  let buffer = "";
  let timer: number | undefined;
  let disposed = false;
  const nativePopover = typeof popup.showPopover === "function";

  function clearTypeahead() {
    buffer = "";
    window.clearTimeout(timer);
    timer = undefined;
  }
  function highlight(value: string) {
    candidate = value;
    for (const option of popup.querySelectorAll<HTMLElement>("[role=option]")) {
      const active = open && option.dataset.value === value;
      option.toggleAttribute("data-highlighted", active);
      if (active) {
        trigger.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView?.({ block: "nearest" });
      }
    }
  }
  function place() {
    if (!open) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(Math.max(rect.width, popup.scrollWidth), window.innerWidth - margin * 2);
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const up = below < popup.scrollHeight && above > below;
    const available = Math.max(0, (up ? above : below) - 4);
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${available}px`;
    popup.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
    popup.style.top = `${up ? Math.max(margin, rect.top - Math.min(popup.scrollHeight, available) - 4) : rect.bottom + 4}px`;
  }
  function close(restore = false) {
    if (!open) return;
    open = false;
    clearTypeahead();
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    if (nativePopover && popup.matches(":popover-open")) popup.hidePopover();
    popup.hidden = true;
    for (const option of popup.querySelectorAll("[data-highlighted]"))
      option.removeAttribute("data-highlighted");
    releaseShellPopup(root, close);
    if (restore && trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  function show() {
    if (disposed || current().disabled || hasInstrumentPointer(trigger)) return;
    claimShellPopup(root, close);
    open = true;
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    // Source keeps a nested host popover open and associates the top-layer surface with its invoker.
    if (nativePopover) popup.showPopover({ source: trigger });
    place();
    trigger.focus({ preventScroll: true });
    highlight(current().value);
  }
  function activate(value: string) {
    if (!open || current().disabled) return;
    close(true);
    if (value !== current().value && current().options.some((option) => option.value === value))
      current().request(value);
  }
  function key(event: KeyboardEvent) {
    if (event.isComposing || event.ctrlKey || event.metaKey) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const options = current().options;
    const index = options.findIndex((option) => option.value === candidate);
    let next: SelectorOption | undefined;
    if (event.key === "ArrowDown") next = options[(index + 1) % options.length];
    else if (event.key === "ArrowUp") next = options[(index - 1 + options.length) % options.length];
    else if (event.key === "Home") next = options[0];
    else if (event.key === "End") next = options.at(-1);
    else if (event.key === "Enter" || (event.key === " " && buffer === "")) {
      event.preventDefault();
      activate(candidate);
      return;
    } else if (event.key.length === 1 && !event.altKey) {
      window.clearTimeout(timer);
      buffer += event.key.toLocaleLowerCase();
      const repeated = [...buffer].every((letter) => letter === buffer[0]);
      const query = repeated ? buffer[0]! : buffer;
      const start = buffer.length === 1 || repeated ? index + 1 : index;
      next = Array.from(
        { length: options.length },
        (_, offset) => options[(start + offset + options.length) % options.length]!,
      ).find((option) => option.label.toLocaleLowerCase().startsWith(query));
      timer = window.setTimeout(clearTypeahead, 700);
      event.preventDefault();
    }
    if (next) {
      event.preventDefault();
      highlight(next.value);
    }
  }
  function click(event: MouseEvent) {
    // Native light dismiss can close the surface during this very press; its click must not reopen.
    const dismissed = event.detail > 0 && pressedOpen && !open;
    pressedOpen = false;
    if (open) close();
    else if (!dismissed) show();
  }
  function guard(event: PointerEvent) {
    if (hasInstrumentPointer(trigger)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    pressedOpen = open;
  }
  function optionClick(event: MouseEvent) {
    const option = (event.target as Element).closest<HTMLElement>("[role=option]");
    if (option?.dataset.value) activate(option.dataset.value);
  }
  function optionDown(event: PointerEvent) {
    // Keep the single tab stop/focus on the combobox; touch click still activates.
    event.preventDefault();
  }
  function outside(event: PointerEvent) {
    if (open && !event.composedPath().includes(trigger) && !event.composedPath().includes(popup))
      close();
  }
  function focus(event: FocusEvent) {
    if (open && !event.composedPath().includes(trigger) && !event.composedPath().includes(popup))
      close();
  }
  function toggle(event: Event) {
    if ((event as ToggleEvent).newState === "closed") close();
  }
  trigger.addEventListener("keydown", key);
  trigger.addEventListener("click", click);
  trigger.addEventListener("pointerdown", guard);
  popup.addEventListener("click", optionClick);
  popup.addEventListener("pointerdown", optionDown);
  popup.addEventListener("beforetoggle", toggle);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("focusin", focus);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  const resize =
    typeof window.ResizeObserver === "function" ? new window.ResizeObserver(place) : null;
  resize?.observe(trigger);
  return {
    reconcile() {
      if (disposed) return;
      if (current().disabled) close();
      if (accepted !== current().value) {
        accepted = current().value;
        if (open) highlight(accepted);
      }
      if (open) place();
    },
    dispose() {
      close();
      disposed = true;
      clearTypeahead();
      resize?.disconnect();
      trigger.removeEventListener("keydown", key);
      trigger.removeEventListener("click", click);
      trigger.removeEventListener("pointerdown", guard);
      popup.removeEventListener("click", optionClick);
      popup.removeEventListener("pointerdown", optionDown);
      popup.removeEventListener("beforetoggle", toggle);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    },
  };
}
