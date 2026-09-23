import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addressConsumerArtifacts,
  verifyInstalledArtifacts,
  createPnpmRunner,
} from "../../../scripts/packedConsumer.mts";

interface Manifest {
  private: boolean;
  version: string;
  exports: Record<string, string | Record<string, string>>;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  sideEffects: string[] | boolean;
}
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
  for (const name of ["core", "render", "react"]) {
    await run(
      ["pack", "--pack-destination", join(consumer, "artifacts")],
      resolve(packageRoot, "..", name),
    );
    const tarball = join(consumer, "artifacts", `gamut-plane-${name}-0.1.0.tgz`);
    function tar(args: string[]) {
      const result = spawnSync("tar", args, { encoding: "utf8", windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    }
    const files = tar(["-tf", tarball]).trim().split(/\r?\n/);
    const manifest: Manifest = JSON.parse(tar(["-xOf", tarball, "package/package.json"]));
    assert.equal(manifest.private, true);
    assert.equal(manifest.version, "0.1.0");
    assert.ok(files.includes("package/LICENSE"));
    assert.ok(files.includes("package/README.md"));
    assert.ok(
      files.every((file) => /^package\/(?:dist\/|package\.json$|README\.md$|LICENSE$)/.test(file)),
    );
    for (const entry of Object.values(manifest.exports))
      for (const target of typeof entry === "string" ? [entry] : Object.values(entry))
        assert.ok(files.includes(`package/${target.replace(/^\.\//, "")}`));
    assert.ok(
      Object.values(manifest.dependencies).every((value) => !/^(workspace|file|link):/.test(value)),
    );
    assert.equal(manifest.dependencies.vue, undefined);
    if (name === "react") {
      assert.deepEqual(Object.keys(manifest.exports), [".", "./style.css"]);
      assert.deepEqual(manifest.sideEffects, ["**/*.css"]);
      assert.deepEqual(manifest.peerDependencies, { react: "~19.3.0", "react-dom": "~19.3.0" });
      assert.equal(manifest.dependencies.react, undefined);
      assert.equal(manifest.dependencies["react-dom"], undefined);
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
        "OklchColor",
        "CanvasColorSpaceStatus",
      ])
        assert.ok(types.includes(name));
      assert.doesNotMatch(types, /ColorPlane|NumericInput|ColorChannelControl|mountPlane/);
    }
    console.log(
      `@gamut-plane/${name}: ${(await stat(tarball)).size} packed bytes\n${files.join("\n")}`,
    );
  }
  if (process.argv.includes("--lock")) {
    await run(["install", "--lockfile-only", "--frozen-lockfile=false"]);
    const lock = (await readFile(join(consumer, "pnpm-lock.yaml"), "utf8")).replace(
      /resolution: \{integrity: [^,\r\n]+, tarball: (file:artifacts\/[^}\r\n]+)\}/g,
      "resolution: {tarball: $1}",
    );
    await writeFile(join(fixture, "pnpm-lock.yaml"), lock);
    await writeFile(join(consumer, "pnpm-lock.yaml"), lock);
  }
  await addressConsumerArtifacts(consumer, ["core", "render", "react"]);
  return { consumer, temporaryRoot, run };
}

export async function installReactConsumer(
  consumer: string,
  run: ReturnType<typeof createPnpmRunner>,
) {
  await run(["install", "--frozen-lockfile"]);
  await verifyInstalledArtifacts(consumer, ["core", "render", "react"]);
}
