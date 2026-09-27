import { prepareReactConsumer, installReactConsumer } from "./packedReact.ts";
import { finishConsumer } from "../../../scripts/packedConsumer.mts";

const { consumer, temporaryRoot, run, artifacts } = await prepareReactConsumer(
  "react-vite",
  "consumer",
);
let passed = false;
try {
  await installReactConsumer(consumer, run, artifacts);
  for (const command of ["typecheck", "test:ssr", "build", "test:browser"]) await run([command]);
  passed = true;
} finally {
  await finishConsumer(consumer, temporaryRoot, "react-vite", passed);
}
