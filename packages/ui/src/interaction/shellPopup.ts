const openPopups = new WeakMap<Element, () => void>();

/** At most one instrument-owned shell popup per root. Replacement only closes; it never requests state. */
export function claimShellPopup(root: Element, close: () => void): void {
  const previous = openPopups.get(root);
  if (previous && previous !== close) previous();
  openPopups.set(root, close);
}

/** Whether an instrument-owned popup currently holds this root's keyboard and wheel input. */
export function hasShellPopup(root: Element): boolean {
  return openPopups.has(root);
}

export function releaseShellPopup(root: Element, close: () => void): void {
  if (openPopups.get(root) === close) openPopups.delete(root);
}
