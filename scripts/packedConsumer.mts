import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageManifest = {
  name: string;
  version: string;
  private: boolean;
  types?: string;
  exports: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type PackedArtifact = {
  name: string;
  version: string;
  filename: string;
  tarball: string;
  sha256: string;
  bytes: number;
  files: string[];
  manifest: PackageManifest;
  source: PackageManifest;
};

function tar(args: string[]): string {
  const result = spawnSync("tar", args, { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

export async function packPrivateArtifact(
  pnpm: string,
  packageRoot: string,
  destination: string,
): Promise<PackedArtifact> {
  await mkdir(destination, { recursive: true });
  const source = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as PackageManifest;
  const result = spawnSync(
    process.execPath,
    [pnpm, "pack", "--pack-destination", destination, "--json"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const { filename: producedPath } = JSON.parse(result.stdout) as { filename: string };
  const filename = basename(producedPath);
  const tarball = resolve(destination, producedPath);
  const files = tar(["-tf", tarball]).trim().split(/\r?\n/);
  const manifest = JSON.parse(tar(["-xOf", tarball, "package/package.json"])) as PackageManifest;
  assert.equal(manifest.name, source.name);
  assert.equal(manifest.version, source.version);
  assert.equal(manifest.private, true);
  assert.ok(files.includes("package/LICENSE"));
  assert.ok(files.includes("package/README.md"));
  assert.ok(
    files.every((file) => /^package\/(?:dist\/|package\.json$|README\.md$|LICENSE$)/.test(file)),
  );
  assert.ok(
    files.every((file) => !/\.(?:map|vue|tsx?)$/.test(file) || /\.d\.(?:mts|cts|ts)$/.test(file)),
  );
  for (const dependencies of [
    manifest.dependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
    manifest.devDependencies,
  ]) {
    assert.ok(
      Object.values(dependencies ?? {}).every((value) => !/^(?:workspace|file|link):/.test(value)),
    );
  }
  for (const entry of Object.values(manifest.exports)) {
    for (const target of typeof entry === "string" ? [entry] : Object.values(entry)) {
      assert.match(target, /^\.\/dist\//);
      assert.ok(files.includes(`package/${target.slice(2)}`), `Missing export ${target}`);
    }
  }
  if (manifest.types) assert.ok(files.includes(`package/${manifest.types.slice(2)}`));
  if (manifest.exports["./style.css"]) assert.ok(files.includes("package/dist/style.css"));
  if (manifest.name === "@gamut-plane/core" || manifest.name === "@gamut-plane/render") {
    assert.deepEqual(Object.keys(manifest.exports).sort(), [
      ".",
      "./internal/capabilities",
      ...(manifest.name === "@gamut-plane/render" ? ["./internal/current"] : []),
      ...(manifest.name === "@gamut-plane/render" ? ["./internal/viewport"] : []),
    ]);
    assert.deepEqual(manifest.exports["./internal/capabilities"], {
      types: "./dist/capabilities/index.d.ts",
      import: "./dist/capabilities/index.js",
    });
    if (manifest.name === "@gamut-plane/render") {
      assert.deepEqual(manifest.exports["./internal/current"], {
        types: "./dist/current/index.d.ts",
        import: "./dist/current/index.js",
      });
      assert.deepEqual(manifest.exports["./internal/viewport"], {
        types: "./dist/viewport/index.d.ts",
        import: "./dist/viewport/index.js",
      });
      for (const old of ["boundaryPresentation", "pickerPresentation", "current/legacyTarget"])
        for (const ext of [".js", ".d.ts"])
          assert.equal(
            files.includes(`package/dist/${old}${ext}`),
            false,
            `Retired ${old}${ext} is packed`,
          );
    }
  }
  if (manifest.name === "@gamut-plane/ui") {
    assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["@gamut-plane/core"]);
    for (const file of files.filter((file) => file.endsWith(".js"))) {
      assert.doesNotMatch(
        tar(["-xOf", tarball, file]),
        /@gamut-plane\/(?:core|render)|@texel\/color/,
        `UI runtime must remain independent of scientific/render code: ${file}`,
      );
    }
    assert.match(
      tar(["-xOf", tarball, "package/dist/instrumentMetadata.d.ts"]),
      /import type .* from "@gamut-plane\/core\/internal\/capabilities"/,
    );
  }
  const data = await readFile(tarball);
  return {
    name: manifest.name,
    version: manifest.version,
    filename,
    tarball,
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: (await stat(tarball)).size,
    files,
    manifest,
    source,
  };
}

export function verifyPackedDependencyGraph(artifacts: readonly PackedArtifact[]) {
  const versions = new Map(artifacts.map(({ name, version }) => [name, version]));
  for (const { name, source, manifest } of artifacts) {
    const sourceInternal = Object.keys(source.dependencies ?? {}).filter((dependency) =>
      dependency.startsWith("@gamut-plane/"),
    );
    const packedInternal = Object.keys(manifest.dependencies ?? {}).filter((dependency) =>
      dependency.startsWith("@gamut-plane/"),
    );
    assert.deepEqual(
      packedInternal.sort(),
      sourceInternal.sort(),
      `${name} internal dependency set changed`,
    );
    for (const dependency of sourceInternal) {
      assert.equal(
        manifest.dependencies?.[dependency],
        versions.get(dependency),
        `${name} -> ${dependency}`,
      );
    }
  }
}

/** Local tarball cache identities must change when same-version private artifacts change. */
export async function addressConsumerArtifacts(
  consumer: string,
  artifacts: readonly PackedArtifact[],
  frozen = true,
) {
  for (const { filename } of artifacts) {
    const original = `artifacts/${filename}`;
    const digest = createHash("sha256")
      .update(await readFile(join(consumer, original)))
      .digest("hex");
    const addressed = `artifacts/${digest}/${filename}`;
    await mkdir(dirname(join(consumer, addressed)), { recursive: true });
    await cp(join(consumer, original), join(consumer, addressed));
    for (const file of [
      "package.json",
      "pnpm-workspace.yaml",
      ...(frozen ? ["pnpm-lock.yaml"] : []),
    ]) {
      const path = join(consumer, file);
      await writeFile(path, (await readFile(path, "utf8")).replaceAll(original, addressed));
    }
  }
}

export async function verifyInstalledArtifacts(
  consumer: string,
  artifacts: readonly PackedArtifact[],
) {
  for (const { name, tarball, files } of artifacts) {
    const packageName = name.replace("@gamut-plane/", "");
    for (const file of files) {
      if (file.endsWith("/")) continue;
      const packed = spawnSync("tar", ["-xOf", tarball, file], {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(packed.status, 0);
      const installed = await readFile(
        join(consumer, "node_modules", "@gamut-plane", packageName, file.replace(/^package\//, "")),
      );
      assert.ok(
        installed.equals(packed.stdout),
        `Installed ${name}/${file} differs from the tested artifact`,
      );
    }
  }
  console.log("Every installed private-package file matches its freshly packed artifact.");
  await verifyInstalledUiMetadata(consumer);
  await verifyInstalledCapabilities(consumer);
}

/** Resolve and execute the same unsupported sibling contracts from each actual packed graph. */
async function verifyInstalledCapabilities(consumer: string) {
  await writeFile(
    join(consumer, "capabilitiesContract.mts"),
    `
import { createColorValue, represent } from "@gamut-plane/core";
import { analyzeRequestedGamuts, linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import { guideDefinitions, resolveEditorVisualSupport, resolveField, resolveRequestedGuides } from "@gamut-plane/render/internal/capabilities";
import type { EditorVisualSupport, FieldResolution, GuideId, GuideResolution } from "@gamut-plane/render/internal/capabilities";
import { currentField, currentOklchObservation, currentEditableDetail, generalizedGuideDisplay, generalizedEditableDetail, referenceBoundaryFit, nativeSelfBoundary } from "@gamut-plane/render/internal/current";
import type { CurrentField, GeneralizedGuideDisplay, ReferenceBoundaryFit } from "@gamut-plane/render/internal/current";
import { FIT_VIEWPORT, sampleWindow, zoomViewportAt, viewportToField, fitBoundaryContour } from "@gamut-plane/render/internal/viewport";
import type { FieldViewport, BoundaryFit } from "@gamut-plane/render/internal/viewport";
const source = createColorValue({ space: "srgb", channels: [0.5, 0.5, 0.5], alpha: 0.37 });
const numericBatch = linearRgbToOklabBatch(new Float64Array([8, 8, 8]), "display-p3");
if (!numericBatch.ok || Math.abs(numericBatch.value[0]! - 2) > 1e-12) throw new Error("Packed extended spatial conversion failed");
if (!source.ok) throw new Error("Invalid packed capability source");
const ids: readonly GuideId[] = Object.values(guideDefinitions).map((guide) => guide.id);
const observation = represent(source.value, "oklch");
const checks = analyzeRequestedGamuts(source.value, ["display-p3-gamut", "srgb-gamut"]);
const editor: EditorVisualSupport = resolveEditorVisualSupport("oklch-lc");
const field: FieldResolution = resolveField(source.value, editor);
const guides: readonly GuideResolution[] = resolveRequestedGuides(source.value, editor, ids);
if (!observation.ok || field.kind !== "available" || checks.length !== 2) throw new Error("Packed resolution failed");
if (checks.some((row) => !row.result.ok || row.result.value.status !== "inside")) throw new Error("Packed exact analysis changed");
if (guides.some((row) => row.kind !== "resolved" || row.forms.contour.kind !== "available")) throw new Error("Packed guide resolution failed");
const current: CurrentField = currentField(editor, field);
const oklch = currentOklchObservation(source.value, observation);
const detail = currentEditableDetail(current, oklch);
const display: GeneralizedGuideDisplay = generalizedGuideDisplay(guides);
const generalized = generalizedEditableDetail(source.value, observation, editor, field);
if (current.projection !== field.projection || oklch !== observation.value || detail.view !== "oklch" || !display.srgbPath) throw new Error("Packed current presentation lost accepted facts");
if (generalized.kind !== "available" || generalized.field.projection !== field.projection) throw new Error("Packed generalized field lost accepted facts");
const nativeGuides = resolveRequestedGuides(source.value, resolveEditorVisualSupport("srgb-rg"), ids);
for (const row of nativeGuides) {
  if (row.kind !== "resolved" || row.forms.kind !== "rgb") throw new Error("Packed native guide forms missing");
  if (row.forms.contour.kind !== "available" || row.forms.contour.value.coverage !== "full") throw new Error("Packed native full coverage missing");
  if (row.forms.channels.r.channelId !== "srgb.r" || row.forms.channels.g.channelId !== "srgb.g" || row.forms.channels.b.channelId !== "srgb.b") throw new Error("Packed native channels lost identity");
  // @ts-expect-error Red cannot use the Green channel identity
  const invalidChannel: typeof row.forms.channels.r.channelId = "srgb.g";
  void invalidChannel;
}
if (generalizedGuideDisplay(nativeGuides).rgbIntervals.r.length !== 2) throw new Error("Packed native channel presentation missing");
const nativeEditor = resolveEditorVisualSupport("srgb-rg");
const nativeVisual = generalizedEditableDetail(source.value, represent(source.value, "srgb"), nativeEditor, resolveField(source.value, nativeEditor));
if (nativeVisual.kind !== "available") throw new Error("Packed native field missing");
const nativeDisplay = generalizedGuideDisplay(nativeGuides, nativeVisual);
if (nativeDisplay.srgbPath !== null || nativeDisplay.rgbIntervals.r.length !== 2) throw new Error("Packed self-boundary suppression changed interval requests");
if (nativeSelfBoundary(nativeVisual.field) !== "srgb-boundary") throw new Error("Packed native domain identity changed");
const selfFit: ReferenceBoundaryFit = referenceBoundaryFit("srgb-gamut", nativeGuides, nativeVisual.field);
if (selfFit.kind !== "unavailable" || selfFit.reason !== "native-self-boundary") throw new Error("Packed self-boundary fit must be unavailable");
const referenceFit: ReferenceBoundaryFit = referenceBoundaryFit("srgb-gamut", guides, current);
if (referenceFit.kind !== "available") throw new Error("Packed perceptual Reference must fit without exact status input");
const clippedFit: BoundaryFit = fitBoundaryContour({ points: new Float64Array([-2, 0.3, 2, 0.3]), closed: false }, "rectangle");
if (clippedFit.kind !== "available" || clippedFit.bounds.left !== 0 || clippedFit.bounds.right !== 1 || clippedFit.viewport.zoom !== 1) throw new Error("Packed nominal-domain clipping changed");
const zoomed: FieldViewport = zoomViewportAt(FIT_VIEWPORT, { x: 0.2, y: 0.8 }, 2);
const window2x = sampleWindow(zoomed);
if (Math.abs(zoomed.center.x - 0.35) > 1e-12 || Math.abs(zoomed.center.y - 0.65) > 1e-12 || window2x.width !== 0.5) throw new Error("Packed viewport math changed");
const roundTrip = viewportToField(zoomed, { x: 0.2, y: 0.8 });
if (Math.abs(roundTrip.x - 0.2) > 1e-12 || Math.abs(roundTrip.y - 0.8) > 1e-12) throw new Error("Packed viewport inverse changed");
// @ts-expect-error render guide identities remain distinct from gamut identities
const wrongGuide: GuideId = "srgb-gamut";
// @ts-expect-error core's new runtime contract is not public root API
type RootAnalysis = typeof import("@gamut-plane/core").analyzeRequestedGamuts;
void wrongGuide;
`,
  );
  await writeFile(
    join(consumer, "capabilitiesRuntime.mjs"),
    `
import assert from "node:assert/strict";
import * as core from "@gamut-plane/core";
import * as coreInternal from "@gamut-plane/core/internal/capabilities";
import * as render from "@gamut-plane/render";
import * as renderInternal from "@gamut-plane/render/internal/capabilities";
import * as current from "@gamut-plane/render/internal/current";
import * as viewport from "@gamut-plane/render/internal/viewport";
assert.deepEqual(Object.keys(coreInternal).sort(), ["MAX_RGB_BATCH_POINTS", "RGB_NUMERIC_REVISION", "analyzeRequestedGamuts", "assertOklchSample", "authorEditorPoint", "convertLinearRgb", "convertRgbReference", "decodeRgbCoordinate", "editOperationDefinitions", "editorDefinitions", "encodeRgbCoordinate", "gamutRayCrossings", "gamutRayIntervals", "geometryDefinitions", "keyboardGeometryPoint", "linearRgbToOklabBatch", "representationDefinitions"]);
const batch = coreInternal.linearRgbToOklabBatch(new Float64Array([8, 8, 8]), "display-p3");
assert.ok(batch.ok && Math.abs(batch.value[0] - 2) < 1e-12);
assert.equal(coreInternal.linearRgbToOklabBatch(new Float64Array([NaN, 0, 0]), "srgb").ok, false);
for (const key of ["GUIDE_FIDELITY_BOUND", "getTracedPickerGuide", "traceLightnessChromaGuide", "traceOklabGuide"]) assert.equal(key in core, false);
assert.deepEqual(Object.values(coreInternal.representationDefinitions).map((definition) => definition.associatedGamutId), [null, null, "srgb-gamut", "display-p3-gamut"]);
assert.deepEqual(Object.keys(renderInternal).sort(), ["guideDefinitions", "referenceGuidePolicy", "resolveEditorVisualSupport", "resolveField", "resolveRequestedGuides"]);
assert.deepEqual(Object.keys(current).sort(), ["currentEditableDetail", "currentField", "currentOklchObservation", "generalizedEditableDetail", "generalizedGuideDisplay", "nativeSelfBoundary", "planeWarningOffset", "referenceBoundaryFit", "referenceDisplay"]);
assert.deepEqual(Object.keys(render).sort(), ["PICKER_ACTIVE_MARKER_RADIUS", "PICKER_GAMUT_TABLES", "PICKER_SLIDER_FIELD_INSET", "PICKER_SLIDER_THUMB_TOP", "PICKER_SLIDER_THUMB_WIDTH", "PICKER_SLIDER_TRACK_HEIGHT", "VIEWBOX_SIZE", "channelSections", "colorGradient", "createFieldRenderer", "geometryToSvgPath", "pointStyle"]);
assert.deepEqual(Object.keys(viewport).sort(), ["FIT_SAMPLE_WINDOW", "FIT_VIEWPORT", "MAX_VIEWPORT_ZOOM", "MIN_VIEWPORT_ZOOM", "assertViewport", "constrainViewport", "createViewportCamera", "fieldToViewport", "fitBoundaryContour", "isFitViewport", "panViewport", "sampleWindow", "viewportDomainStyle", "viewportPointStyle", "viewportSvgViewBox", "viewportToField", "viewportsEqual", "zoomViewportAt"]);
assert.equal(viewport.zoomViewportAt(viewport.FIT_VIEWPORT, { x: 0.2, y: 0.8 }, 2).zoom, 2);
for (const key of Object.keys(viewport)) assert.equal(key in render, false);
for (const key of Object.keys(coreInternal)) assert.equal(key in core, false);
for (const key of Object.keys(renderInternal)) assert.equal(key in render, false);
for (const key of Object.keys(current)) assert.equal(key in render, false);
assert.equal(typeof globalThis.window, "undefined");
assert.equal(typeof globalThis.document, "undefined");
`,
  );
  await writeFile(
    join(consumer, "tsconfig.capabilities.json"),
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
      include: ["capabilitiesContract.mts"],
    }),
  );
  const tsc = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../node_modules/typescript/bin/tsc",
  );
  for (const args of [
    [tsc, "-p", "tsconfig.capabilities.json"],
    ["capabilitiesContract.mts"],
    ["capabilitiesRuntime.mjs"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: consumer,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  console.log(
    "Packed core/render internal inventories, root exclusion, no-DOM declarations and Node resolution passed.",
  );
}

/** Check the actual installed declaration graph, even when a host enables skipLibCheck. */
async function verifyInstalledUiMetadata(consumer: string) {
  await writeFile(
    join(consumer, "metadataContract.mts"),
    `
import { currentPrimaryEditors, currentSelectionFacts, currentAdmittedEditorsForRepresentation, defaultSelection, editorUi, representationUi, generalizedCopy, orderedExactChecks, gamutSummary, gamutSummaryCopy } from "@gamut-plane/ui";
import type { ChannelId, EditOperationId, EditorId, RepresentationDefinition } from "@gamut-plane/core/internal/capabilities";
// The existing render root includes the browser Canvas contract; check type exclusion here,
// separately from the ES-only internal-entry graph above.
// @ts-expect-error current sibling presentation is not public root API
type RootCurrent = typeof import("@gamut-plane/render").currentField;
// @ts-expect-error retired production legacy factory is absent from render root
type RetiredPicker = typeof import("@gamut-plane/render").createPickerPresentation;
// @ts-expect-error retired legacy type is absent from render root
type RetiredBoundary = import("@gamut-plane/render").BoundaryPresentation;
for (const representation of Object.values(representationUi)) representation.id satisfies RepresentationDefinition["id"];
for (const editor of currentPrimaryEditors) {
  editor.id satisfies EditorId;
  for (const control of editor.companions) {
    control.channelId satisfies ChannelId;
    control.operationId satisfies EditOperationId;
  }
}
const admitted: import("@gamut-plane/ui").InstrumentSelection = { representationId: "oklch", editorId: "oklch-lc" };
const inspection: import("@gamut-plane/ui").InstrumentSelection = { representationId: "srgb", editorId: null };
const nativeRgb: import("@gamut-plane/ui").InstrumentSelection = { representationId: "srgb", editorId: "srgb-rb" };
// @ts-expect-error public RGB selection preserves encoding/editor correlation
const mismatchedRgb: import("@gamut-plane/ui").InstrumentSelection = { representationId: "srgb", editorId: "display-p3-rb" };
void admitted;
void inspection;
void nativeRgb;
void mismatchedRgb;
// @ts-expect-error public selection rejects an unadmitted technical editor
const unadmitted: import("@gamut-plane/ui").InstrumentSelection = { representationId: "oklch", editorId: "test-oklch-hc" };
void unadmitted;
if (currentPrimaryEditors.map((editor) => editor.id).join() !== "oklch-lc,oklab-ab,srgb-rg,srgb-rb,srgb-gb,display-p3-rg,display-p3-rb,display-p3-gb") throw new Error("Packed primary exposure changed");
if (!Object.isFrozen(editorUi["oklch-lc"].companions[2].numericBounds)) throw new Error("Packed metadata is mutable");
if ("max" in editorUi["oklch-lc"].companions[2].numericBounds) throw new Error("Packed Chroma bound changed");
if (currentSelectionFacts.admittedEditors.length !== 8 || currentAdmittedEditorsForRepresentation("srgb").length !== 3 || currentAdmittedEditorsForRepresentation("display-p3").length !== 3) throw new Error("Packed admission policy changed");
if (defaultSelection("oklch").editorId !== "oklch-lc" || defaultSelection("srgb").editorId !== "srgb-rg" || defaultSelection("display-p3").editorId !== "display-p3-rg") throw new Error("Packed preferred editor changed");
if (new Set(currentSelectionFacts.knownEditors.map((editor) => editor.id)).size !== currentSelectionFacts.knownEditors.length) throw new Error("Packed known editors duplicated");
if (generalizedCopy.representation !== "Coordinates" || generalizedCopy.comparison !== "Gamut references") throw new Error("Packed shared copy changed");
if (gamutSummaryCopy(gamutSummary({ checkedGamuts: [], referenceGamutId: "srgb-gamut" }, [])).description !== "Reference sRGB, Status off") throw new Error("Packed Gamuts summary policy changed");
if (orderedExactChecks([{ gamutId: "display-p3-gamut" }, { gamutId: "srgb-gamut" }])[0]?.gamutId !== "srgb-gamut") throw new Error("Packed exact display order changed");
`,
  );
  await writeFile(
    join(consumer, "tsconfig.metadata.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2023", "DOM"],
        types: [],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
      },
      include: ["metadataContract.mts"],
    }),
  );
  const tsc = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../node_modules/typescript/bin/tsc",
  );
  for (const args of [[tsc, "-p", "tsconfig.metadata.json"], ["metadataContract.mts"]]) {
    const result = spawnSync(process.execPath, args, {
      cwd: consumer,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  console.log("Packed UI metadata declarations and browser-free Node import passed.");
}

export function createPnpmRunner(
  pnpm: string,
  consumer: string,
  environment: Record<string, string> = {},
  timeout = 600_000,
) {
  return async function run(args: string[], cwd = consumer, env: Record<string, string> = {}) {
    console.log(`pnpm ${args.join(" ")}`);
    await new Promise<void>((resolveRun, reject) => {
      const child = spawn(process.execPath, [pnpm!, ...args], {
        cwd,
        stdio: "inherit",
        windowsHide: true,
        detached: process.platform !== "win32",
        env: { ...process.env, NODE_PATH: "", ...environment, ...env },
      });
      let stopped = false;
      const stop = () => {
        stopped = true;
        if (!child.pid) return;
        if (process.platform === "win32")
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        else {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            /* Already exited. */
          }
        }
      };
      const timer = setTimeout(stop, timeout);
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        if (code === 0 && !stopped) resolveRun();
        else
          reject(
            new Error(
              `pnpm ${args.join(" ")} ${stopped ? "timed out or was interrupted" : `exited ${code}`}`,
            ),
          );
      });
    });
  };
}

export async function finishConsumer(
  consumer: string,
  temporaryRoot: string,
  kind: "nuxt" | "next" | "react-vite",
  passed: boolean,
) {
  const evidence = process.env.GAMUT_PLANE_EVIDENCE;
  if (evidence) {
    for (const name of ["playwright-report", "test-results"]) {
      try {
        await cp(join(consumer, name), join(evidence, kind, name), { recursive: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  if (passed && !process.argv.includes("--keep")) {
    const target = await realpath(consumer);
    assert.equal(dirname(target), temporaryRoot);
    assert.ok(target.startsWith(join(temporaryRoot, "gamut-plane-" + kind + "-")));
    await rm(target, { recursive: true });
  } else console.log("Consumer and evidence retained at " + consumer);
}
