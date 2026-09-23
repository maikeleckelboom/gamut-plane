import { useLayoutEffect, useRef } from "react";

/** Native listeners read only committed props. Rendering never writes this cell. */
export function useCommitted<T>(value: T) {
  const committed = useRef<T | null>(null);
  useLayoutEffect(() => {
    committed.current = value;
  });
  return committed;
}
