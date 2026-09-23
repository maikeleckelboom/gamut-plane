"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";
import type { OklchColor } from "@gamut-plane/react";

interface Events {
  changes: number;
  commits: number;
  cancels: number;
  final: OklchColor | null;
}
const Context = createContext<
  (type: "changes" | "commits" | "cancels", value?: OklchColor) => void
>(() => {});
export const useEvents = () => useContext(Context);
export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Events>({ changes: 0, commits: 0, cancels: 0, final: null });
  return (
    <Context.Provider
      value={(type, value) =>
        setEvents((previous) => ({
          ...previous,
          [type]: previous[type] + 1,
          final: type === "commits" ? (value ?? null) : previous.final,
        }))
      }
    >
      <output data-events>{JSON.stringify(events)}</output>
      {children}
    </Context.Provider>
  );
}
