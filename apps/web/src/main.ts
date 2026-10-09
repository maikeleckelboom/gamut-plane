import { createApp } from "vue";

import App from "./App.vue";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/geist-mono";
import "./app.css";

// The compact route never requests the standalone renderer chunk.
if (["/spatial", "/spatial/"].includes(window.location.pathname)) {
  import("./spatial/spatialApp.vue")
    .then(({ default: SpatialApp }) => createApp(SpatialApp).mount("#app"))
    .catch(() => {
      const root = document.getElementById("app");
      if (root)
        root.textContent =
          "The spatial study could not load. Reload this page, or open / for the compact instrument.";
    });
} else {
  createApp(App).mount("#app");
}
