import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InstrumentHost } from "../instrumentHost";
import { EventsProvider } from "../eventsProvider";
import "@gamut-plane/react/style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EventsProvider>
      <InstrumentHost
        initial={{
          type: "gamut-plane/color",
          version: 1,
          space: "oklch",
          channels: [0.68, 0.52345678, 612.123456],
          alpha: 0.37,
        }}
      />
    </EventsProvider>
  </StrictMode>,
);
