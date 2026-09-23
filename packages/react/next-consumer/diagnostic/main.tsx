import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InstrumentHost } from "../instrumentHost";
import { EventsProvider } from "../eventsProvider";
import "@gamut-plane/react/style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EventsProvider>
      <InstrumentHost initial={{ l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 }} />
    </EventsProvider>
  </StrictMode>,
);
