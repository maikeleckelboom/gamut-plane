import { createApp } from "vue";
import InstrumentHost from "./InstrumentHost.vue";
import ParityHost from "./ParityHost.vue";
import GeneralizedHost from "./GeneralizedHost.vue";

const query = new URLSearchParams(location.search);
createApp(
  query.has("generalized") ? GeneralizedHost : query.has("parity") ? ParityHost : InstrumentHost,
).mount("#app");
