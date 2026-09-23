import { createRoot } from "react-dom/client";
import { InstrumentHost } from "./InstrumentHost";
import "@gamut-plane/react/style.css";
import "./host.css";

createRoot(document.getElementById("app")!).render(<InstrumentHost />);
