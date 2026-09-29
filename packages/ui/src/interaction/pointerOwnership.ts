const owners = new WeakSet<Element>();

/** Controllers publish ownership; the shell only observes it and never cancels a gesture. */
export function setPointerOwnership(element: Element, active: boolean): void {
  if (active) owners.add(element);
  else owners.delete(element);
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
