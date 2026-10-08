/** Native top-layer mechanics shared by selectors, references and context menus. Their owners
 * synchronize logical state and focus; this boundary alone invokes the browser's popover API. */
export function mountPopoverLifecycle(surface: HTMLElement, onNativeClose: () => void) {
  const nativePopover = typeof surface.showPopover === "function";
  let nativeClosing = false;

  function toggle(event: Event) {
    if ((event as ToggleEvent).newState !== "closed") return;
    // beforetoggle runs while :popover-open still matches. Synchronize the owner without
    // reentering hidePopover(), and leave focus restoration to the browser on native dismissal.
    nativeClosing = true;
    try {
      onNativeClose();
    } finally {
      nativeClosing = false;
    }
  }
  surface.addEventListener("beforetoggle", toggle);

  return {
    show(source: HTMLElement) {
      surface.hidden = false;
      // Source preserves ancestry when an instrument is inside a host popover.
      if (nativePopover) surface.showPopover({ source });
    },
    hide() {
      if (nativePopover && !nativeClosing && surface.matches(":popover-open"))
        surface.hidePopover();
      surface.hidden = true;
    },
    dispose() {
      surface.removeEventListener("beforetoggle", toggle);
    },
  };
}
