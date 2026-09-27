"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";
import type { ColorValue } from "@gamut-plane/react";
import { snapshotColor, type ColorSnapshotV1 } from "@gamut-plane/core";

interface Events {
  changes: number;
  commits: number;
  cancels: number;
  final: ColorSnapshotV1 | null;
}
const Context = createContext<
  (type: "changes" | "commits" | "cancels", value?: ColorValue) => void
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
          final: type === "commits" ? (value ? snapshotColor(value) : null) : previous.final,
        }))
      }
    >
      <output data-events>{JSON.stringify(events)}</output>
      {children}
    </Context.Provider>
  );
}
