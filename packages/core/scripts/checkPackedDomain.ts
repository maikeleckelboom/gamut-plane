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
  assert.deepEqual(manifest.exports["./internal/capabilities"], {
    types: "./dist/capabilities/index.d.ts",
    import: "./dist/capabilities/index.js",
  });
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
import { analyzeGamut, authorPlaneEdit, createColorValue, definitionOf, projectColorToPlane, represent, serializeCss, serializeHex, snapshotColor, restoreColor, definingEquals } from "@gamut-plane/core";
import type { ColorValue, ColorRepresentation } from "@gamut-plane/core";
import * as root from "@gamut-plane/core";
import * as capabilities from "@gamut-plane/core/internal/capabilities";
import { analyzeRequestedGamuts, editorDefinitions, geometryDefinitions } from "@gamut-plane/core/internal/capabilities";
import type { EditorId, EditorDefinition, GeometryId, GeometryDefinition, ChannelDefinition, ChannelId, RepresentationDefinition, EditOperationDefinition, EditOperationId } from "@gamut-plane/core/internal/capabilities";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";

const checked: GamutCheckResult = { gamutId: "srgb-gamut", result: { ok: false, error: { code: "numerical-range", from: "oklch", to: "srgb" } } };
// @ts-expect-error the collection row uses core gamut IDs, not representation IDs
const wrongCheck: GamutCheckResult = { ...checked, gamutId: "srgb" };
// @ts-expect-error derived collection types are internal, not public root API
type RootCheck = import("@gamut-plane/core").GamutCheckResult;
void wrongCheck;

if (Object.keys(capabilities).sort().join() !== "MAX_RGB_BATCH_POINTS,RGB_NUMERIC_REVISION,analyzeRequestedGamuts,assertOklchSample,authorEditorPoint,convertLinearRgb,convertRgbReference,decodeRgbCoordinate,editOperationDefinitions,editorDefinitions,encodeRgbCoordinate,gamutRayCrossings,gamutRayIntervals,geometryDefinitions,keyboardGeometryPoint,linearRgbToOklabBatch,representationDefinitions") throw new Error("Internal capability surface changed");
if (Object.keys(capabilities).some((key) => key in root)) throw new Error("Internal capabilities leaked into root");
if (capabilities.gamutRayIntervals(0.44, 264.1, "srgb").length !== 2) throw new Error("Packed numerical notch intervals failed");
const linearRgb: readonly [number, number, number] = capabilities.convertLinearRgb([1, 0, 0], "srgb", "display-p3");
if (!linearRgb.every(Number.isFinite) || linearRgb[0] <= 0 || linearRgb[0] >= 1) throw new Error("Packed linear RGB conversion failed");
if (Math.abs(capabilities.encodeRgbCoordinate(capabilities.decodeRgbCoordinate(-0.2)) + 0.2) > 1e-12) throw new Error("Packed RGB transfer failed");
if (!capabilities.convertRgbReference({ l: 0.6, c: 0.1, h: 240, alpha: 1 }, "srgb")?.every(Number.isFinite)) throw new Error("Packed Reference conversion failed");
const batch = capabilities.linearRgbToOklabBatch(new Float64Array([8, 8, 8]), "display-p3");
if (!batch.ok || Math.abs(batch.value[0]! - 2) > 1e-12) throw new Error("Packed extended numeric batch conversion failed");
if (capabilities.linearRgbToOklabBatch(new Float64Array([NaN, 0, 0]), "srgb").ok) throw new Error("Packed nonfinite batch input was accepted");
// @ts-expect-error the bridge only accepts the two native RGB encodings
const invalidBridgeSpace: Parameters<typeof capabilities.convertLinearRgb>[2] = "oklab";
void invalidBridgeSpace;

const editorId: EditorId = "oklch-lc";
const editor: EditorDefinition = editorDefinitions[editorId];
const geometryId: GeometryId = editor.geometryId;
const geometry = geometryDefinitions[geometryId];
const typedGeometry: GeometryDefinition = geometry;
if (typedGeometry.representationId !== "oklch" || geometry.toPoint(0.6, 0.2).x !== 0.5) throw new Error("Packed capability geometry failed");
if (!Object.isFrozen(editorDefinitions) || !Object.isFrozen(geometry)) throw new Error("Packed capability immutability failed");
// @ts-expect-error only core-defined primary editor identities cross the internal boundary
const unsupportedEditor: EditorId = "srgb-channels";
// @ts-expect-error internal capabilities are deliberately absent from the root type surface
type RootEditor = import("@gamut-plane/core").EditorId;
void unsupportedEditor;

const channel: ChannelId = "oklch.h";
const operation: EditOperationId = "oklch-hue-edit";
const representation: RepresentationDefinition["id"] = "display-p3";
type HueOperation = Extract<EditOperationDefinition, { id: typeof operation }>;
const hueChannel: HueOperation["channelId"] = channel;
const labChannel: ChannelDefinition<"oklab">["id"] = "oklab.a";
// @ts-expect-error operation/channel correspondence crosses the packed type boundary
const wrongHueChannel: HueOperation["channelId"] = labChannel;
// @ts-expect-error representation identity is technical, not a display label
const displayLabel: RepresentationDefinition["id"] = "Display P3";
// @ts-expect-error UI's new identity types must not leak into core's public root
type RootChannel = import("@gamut-plane/core").ChannelId;
void [representation, hueChannel, wrongHueChannel, displayLabel];

const source = createColorValue({ space: "oklch", channels: [0.6, -0, null], alpha: 0.372913 });
if (!source.ok) throw new Error("Packed construction failed");
const value: ColorValue = source.value;
const requestedChecks: readonly GamutCheckResult[] = analyzeRequestedGamuts(value, ["display-p3-gamut", "srgb-gamut"]);
if (requestedChecks.length !== 2 || requestedChecks.some((row) => !row.result.ok)) throw new Error("Packed requested analysis failed");
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
const outputSource = createColorValue({ space: "srgb", channels: [0.2, 0.4, 0.6], alpha: 1 });
if (!outputSource.ok) throw new Error("Packed output construction failed");
const status = analyzeGamut(outputSource.value, "srgb-gamut");
if (!status.ok || status.value.status !== "inside") throw new Error("Packed gamut analysis failed");
const outputRepresentation = represent(outputSource.value, "srgb");
if (!outputRepresentation.ok) throw new Error("Packed output representation failed");
const css = serializeCss(outputRepresentation.value, { policy: "require-in-gamut", gamut: "srgb-gamut" });
const hex = serializeHex(outputRepresentation.value, { alpha: "omit" });
if (!css.ok || css.value.text !== "color(srgb 0.2 0.4 0.6 / 1)") throw new Error("Packed strict CSS output failed");
if (!hex.ok || hex.value.text !== "#336699") throw new Error("Packed Hex output failed");
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
