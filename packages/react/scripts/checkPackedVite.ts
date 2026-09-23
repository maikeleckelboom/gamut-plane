import { prepareReactConsumer, installReactConsumer } from "./packedReact.ts";
import { finishConsumer } from "../../../scripts/packedConsumer.mts";

const { consumer, temporaryRoot, run } = await prepareReactConsumer("react-vite", "consumer");
let passed = false;
try {
  await installReactConsumer(consumer, run);
  for (const command of ["typecheck", "test:ssr", "build", "test:browser"]) await run([command]);
  passed = true;
} finally {
  await finishConsumer(consumer, temporaryRoot, "react-vite", passed);
}
