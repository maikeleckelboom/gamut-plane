import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addressConsumerArtifacts,
  packPrivateArtifact,
  verifyPackedDependencyGraph,
  verifyInstalledArtifacts,
  createPnpmRunner,
  type PackedArtifact,
} from "../../../scripts/packedConsumer.mts";

export async function prepareReactConsumer(kind: "next" | "react-vite", directory: string) {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const fixture = join(packageRoot, directory);
  const pnpm = process.env.npm_execpath;
  assert.ok(pnpm, "Run through pnpm");
  const temporaryRoot = await realpath(tmpdir());
  const consumer = await mkdtemp(join(temporaryRoot, `gamut-plane-${kind}-`));
  console.log(`Isolated ${kind} consumer: ${consumer}`);
  const run = createPnpmRunner(pnpm, consumer, { NEXT_TELEMETRY_DISABLED: "1" });
  await cp(fixture, consumer, { recursive: true });
  if (kind === "react-vite")
    await cp(join(packageRoot, "e2e"), join(consumer, "e2e"), { recursive: true });
  const artifacts: PackedArtifact[] = [];
  for (const name of ["core", "render", "ui", "react"]) {
    const artifact = await packPrivateArtifact(
      pnpm,
      resolve(packageRoot, "..", name),
      join(consumer, "artifacts"),
    );
    const { tarball, files, manifest } = artifact;
    function tar(args: string[]) {
      const result = spawnSync("tar", args, { encoding: "utf8", windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    }
    assert.equal(manifest.types, "./dist/index.d.ts");
    assert.equal(manifest.dependencies?.vue, undefined);
    if (name === "react") {
      assert.deepEqual(Object.keys(manifest.exports), [".", "./style.css"]);
      assert.deepEqual((manifest as { sideEffects?: string[] }).sideEffects, ["**/*.css"]);
      assert.deepEqual(manifest.peerDependencies, { react: "~19.3.0", "react-dom": "~19.3.0" });
      assert.equal(manifest.dependencies?.react, undefined);
      assert.equal(manifest.dependencies?.["react-dom"], undefined);
      for (const file of ["index.js", "GamutPlane.js"])
        assert.match(tar(["-xOf", tarball, `package/dist/${file}`]), /^"use client";/);
      const component = tar(["-xOf", tarball, "package/dist/GamutPlane.js"]);
      assert.match(component, /from "react"/);
      assert.match(component, /from "react\/jsx-runtime"/);
      assert.doesNotMatch(component, /from ["'][^"']*vue/);
      const types = tar(["-xOf", tarball, "package/dist/index.d.ts"]);
      for (const name of [
        "GamutPlane",
        "GamutPlaneProps",
        "GamutPlaneView",
        "ColorValue",
        "DisplayGamut",
        "CanvasColorSpaceStatus",
      ])
        assert.ok(types.includes(name));
      assert.doesNotMatch(
        types,
        /ColorPlane|NumericInput|ColorChannelControl|OklchSample|PickerPlaneFieldSampler|PickerGuide|mountPlane/,
      );
    }
    console.log(
      `${artifact.name}: ${artifact.bytes} packed bytes, sha256 ${artifact.sha256}\n${files.join("\n")}`,
    );
    artifacts.push(artifact);
  }
  verifyPackedDependencyGraph(artifacts);
  const ui = artifacts.find((artifact) => artifact.name === "@gamut-plane/ui")!;
  const react = artifacts.find((artifact) => artifact.name === "@gamut-plane/react")!;
  const packedCss = (tarball: string) => {
    const result = spawnSync("tar", ["-xOf", tarball, "package/dist/style.css"], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  assert.equal(packedCss(react.tarball), packedCss(ui.tarball));
  assert.equal(
    packedCss(ui.tarball),
    await readFile(resolve(packageRoot, "../ui/src/style.css"), "utf8"),
  );
  if (process.argv.includes("--lock")) {
    await run(["install", "--lockfile-only", "--frozen-lockfile=false"]);
    const lock = (await readFile(join(consumer, "pnpm-lock.yaml"), "utf8")).replace(
      /resolution: \{integrity: [^,\r\n]+, tarball: (file:artifacts\/[^}\r\n]+)\}/g,
      "resolution: {tarball: $1}",
    );
    await writeFile(join(fixture, "pnpm-lock.yaml"), lock);
    await writeFile(join(consumer, "pnpm-lock.yaml"), lock);
  }
  await addressConsumerArtifacts(consumer, artifacts);
  return { consumer, temporaryRoot, run, artifacts };
}

export async function installReactConsumer(
  consumer: string,
  run: ReturnType<typeof createPnpmRunner>,
  artifacts: readonly PackedArtifact[],
) {
  await run(["install", "--frozen-lockfile"]);
  await verifyInstalledArtifacts(consumer, artifacts);
}
