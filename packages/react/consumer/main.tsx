import { createRoot } from "react-dom/client";
import { InstrumentHost } from "./InstrumentHost";
import { ParityHost } from "./ParityHost";
import "@gamut-plane/react/style.css";
import "./host.css";

createRoot(document.getElementById("app")!).render(
  new URLSearchParams(location.search).has("parity") ? <ParityHost /> : <InstrumentHost />,
);
