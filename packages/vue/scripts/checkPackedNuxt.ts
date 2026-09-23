import assert from "node:assert/strict";
import {
  addressConsumerArtifacts,
  verifyInstalledArtifacts,
  createPnpmRunner,
  finishConsumer,
} from "../../../scripts/packedConsumer.mts";
import { cp, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(packageRoot, "nuxt-consumer");
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, "Run through pnpm test:nuxt");
const temporaryRoot = await realpath(tmpdir());
const consumer = await mkdtemp(join(temporaryRoot, "gamut-plane-nuxt-"));
console.log(`Isolated Nuxt consumer: ${consumer}`);

const run = createPnpmRunner(pnpm, consumer, { NUXT_TELEMETRY_DISABLED: "1" });

let passed = false;
try {
  await cp(fixture, consumer, { recursive: true });
  await cp(join(packageRoot, "consumer/ssrSmoke.ts"), join(consumer, "ssrSmoke.ts"));
  for (const name of ["core", "render", "vue"])
    await run(
      ["pack", "--pack-destination", join(consumer, "artifacts")],
      resolve(packageRoot, "..", name),
    );
  if (process.argv.includes("--lock")) {
    await run(["install", "--lockfile-only", "--frozen-lockfile=false"]);
    // Artifact bytes change with the tested tree. Registry resolutions remain frozen.
    const lock = (await readFile(join(consumer, "pnpm-lock.yaml"), "utf8")).replace(
      /resolution: \{integrity: [^,\r\n]+, tarball: (file:artifacts\/[^}\r\n]+)\}/g,
      "resolution: {tarball: $1}",
    );
    await writeFile(join(fixture, "pnpm-lock.yaml"), lock);
    await writeFile(join(consumer, "pnpm-lock.yaml"), lock);
  }
  await addressConsumerArtifacts(consumer, ["core", "render", "vue"]);
  await run(["install", "--frozen-lockfile"]);
  await verifyInstalledArtifacts(consumer, ["core", "render", "vue"]);
  await run(["test:ssr"]);
  await run(["typecheck"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "development" });
  await run(["build"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "production" });
  await run(["generate"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "generated" });
  passed = true;
} finally {
  await finishConsumer(consumer, temporaryRoot, "nuxt", passed);
}
