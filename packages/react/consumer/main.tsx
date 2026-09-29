import { createRoot } from "react-dom/client";
import { InstrumentHost } from "./InstrumentHost";
import { ParityHost } from "./ParityHost";
import { GeneralizedHost } from "./GeneralizedHost";
import "@gamut-plane/react/style.css";
import "./host.css";

const query = new URLSearchParams(location.search);
createRoot(document.getElementById("app")!).render(
  query.has("generalized") ? (
    <GeneralizedHost />
  ) : query.has("parity") ? (
    <ParityHost />
  ) : (
    <InstrumentHost />
  ),
);
