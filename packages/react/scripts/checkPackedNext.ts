import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { finishConsumer } from "../../../scripts/packedConsumer.mts";
import { prepareReactConsumer, installReactConsumer } from "./packedReact.ts";

const { consumer, temporaryRoot, run } = await prepareReactConsumer("next", "next-consumer");
let passed = false;
try {
  await installReactConsumer(consumer, run);
  await run(["test:ssr"]);
  await run(["typecheck"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "development" });
  await run(["build"]);
  assert.match(
    await readFile(join(consumer, ".next/server/app/prerendered.html"), "utf8"),
    /data-plane-instrument/,
  );
  await run(["test:browser"], consumer, { FIXTURE_MODE: "production" });
  await run(["test:browser"], consumer, { FIXTURE_MODE: "strict" });
  passed = true;
} finally {
  await finishConsumer(consumer, temporaryRoot, "next", passed);
}
