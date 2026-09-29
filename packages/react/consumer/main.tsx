import { createRoot } from "react-dom/client";
import { GeneralizedHost } from "./GeneralizedHost";
import "@gamut-plane/react/style.css";
import "./host.css";

createRoot(document.getElementById("app")!).render(<GeneralizedHost />);
