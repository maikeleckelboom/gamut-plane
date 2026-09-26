import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, "Run through pnpm test:packed-domain");
const temporaryRoot = await realpath(tmpdir());
const consumer = await mkdtemp(join(temporaryRoot, "gamut-plane-core-domain-"));

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: "" },
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw result.error ?? new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
  return result.stdout;
}

let passed = false;
try {
  const packed = JSON.parse(
    run(process.execPath, [pnpm, "pack", "--pack-destination", consumer, "--json"], packageRoot),
  ) as { filename: string };
  const tarball = resolve(consumer, packed.filename);
  const manifest = JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"], consumer)) as {
    exports: Record<string, unknown>;
  };
  assert.ok(manifest.exports["."], "Packed core must retain its public export map");
  const artifact = join(consumer, "core.tgz");
  await copyFile(tarball, artifact);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@gamut-plane/core": "file:./core.tgz" },
    }),
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2023"],
        types: [],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
      },
      include: ["consumer.mts"],
    }),
  );
  await writeFile(
    join(consumer, "consumer.mts"),
    `
import { authorPlaneEdit, createColorValue, definitionOf, projectColorToPlane, represent, snapshotColor, restoreColor, definingEquals } from "@gamut-plane/core";
import type { ColorValue, ColorRepresentation } from "@gamut-plane/core";

const source = createColorValue({ space: "oklch", channels: [0.6, -0, null], alpha: 0.372913 });
if (!source.ok) throw new Error("Packed construction failed");
const value: ColorValue = source.value;
const definition: ColorRepresentation = definitionOf(value);
if (definition.space !== "oklch" || !Object.is(definition.channels[1], -0)) throw new Error("Packed defining coordinates changed");
const observed = represent(value, "srgb");
if (!observed.ok) throw new Error("Packed conversion failed");
const projection = projectColorToPlane(value, "oklab");
if (!projection.ok) throw new Error("Packed plane projection failed");
const reauthored = authorPlaneEdit(value, { plane: "oklab", kind: "channels", channels: { a: projection.value.representation.channels[1] + 0.01 } });
if (!reauthored.ok || definitionOf(reauthored.value).space !== "oklab" || definitionOf(reauthored.value).channels[1] !== projection.value.representation.channels[1] + 0.01 || !Object.is(definitionOf(reauthored.value).alpha, 0.372913)) throw new Error("Packed plane authorship failed");
if (definitionOf(value).space !== "oklch") throw new Error("Packed observation changed authority");
const restored = restoreColor(JSON.parse(JSON.stringify(snapshotColor(value))));
if (!restored.ok || !definingEquals(value, restored.value)) throw new Error("Packed transport failed");
`,
  );
  run(process.execPath, [pnpm, "install", "--ignore-scripts"], consumer);
  const typescript = resolve(packageRoot, "../../node_modules/typescript/bin/tsc");
  run(process.execPath, [typescript, "-p", "tsconfig.json"], consumer);
  run(process.execPath, ["consumer.mts"], consumer);
  passed = true;
  process.stdout.write("Packed core no-DOM declarations and runtime transport passed.\n");
} finally {
  const resolved = await realpath(consumer);
  assert.ok(
    resolved.startsWith(temporaryRoot + sep),
    "Refusing to clean outside the temporary root",
  );
  if (passed) await rm(resolved, { recursive: true });
  else process.stdout.write(`Packed consumer retained at ${consumer}\n`);
}
