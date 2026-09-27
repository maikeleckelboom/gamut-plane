import { createApp } from "vue";
import InstrumentHost from "./InstrumentHost.vue";
import ParityHost from "./ParityHost.vue";

createApp(new URLSearchParams(location.search).has("parity") ? ParityHost : InstrumentHost).mount(
  "#app",
);
