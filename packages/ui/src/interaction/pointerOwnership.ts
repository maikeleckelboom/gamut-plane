const owners = new WeakMap<Element, Set<unknown>>();
const starts = new WeakMap<Element, Set<(owner: unknown) => void>>();

/** Observe the start of ownership in this instrument, without adding DOM listeners or state. */
export function onInstrumentPointerStart(element: Element, callback: (owner: unknown) => void) {
  const root = element.closest("[data-gp-root]");
  if (!root) return () => {};
  let callbacks = starts.get(root);
  if (!callbacks) starts.set(root, (callbacks = new Set()));
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) starts.delete(root);
  };
}

/**
 * Controllers publish ownership; the shell only observes it and never cancels a gesture. Each
 * controller passes its own `owner` token, so releasing it can never clear another controller's
 * claim on the same element. Without a token the element itself is the owner.
 */
export function setPointerOwnership(
  element: Element,
  active: boolean,
  owner: unknown = element,
): void {
  let claims = owners.get(element);
  if (active) {
    if (!claims) owners.set(element, (claims = new Set()));
    if (claims.has(owner)) return;
    claims.add(owner);
    const root = element.closest("[data-gp-root]");
    if (root) for (const callback of starts.get(root) ?? []) callback(owner);
    return;
  }
  claims?.delete(owner);
  if (claims?.size === 0) owners.delete(element);
}

export function hasInstrumentPointer(element: Element): boolean {
  const root = element.closest("[data-gp-root]");
  return (
    root !== null &&
    Array.from(
      root.querySelectorAll('[data-gp-part="surface"], [data-gp-part="native-range"]'),
    ).some((node) => owners.has(node))
  );
}

/** True when another controller than `owner` currently holds a claim on this exact element. */
export function hasOtherPointerOwner(element: Element, owner: unknown): boolean {
  const claims = owners.get(element);
  if (!claims) return false;
  for (const claim of claims) if (claim !== owner) return true;
  return false;
}
