import {
  addressConsumerArtifacts,
  packPrivateArtifact,
  verifyPackedDependencyGraph,
  verifyInstalledArtifacts,
} from "../../../scripts/packedConsumer.mts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, "Run this check through pnpm test:package");
const temporaryRoot = await realpath(tmpdir());
const consumer = await mkdtemp(join(temporaryRoot, "gamut-plane-consumer-"));
const packed = join(consumer, "artifacts");

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

function runPnpm(args: string[], cwd: string): string {
  return run(process.execPath, [pnpm!, ...args], cwd);
}

let passed = false;
try {
  const artifacts = [];
  for (const name of ["core", "render", "ui", "vue"]) {
    const root = resolve(packageRoot, "..", name);
    const artifact = await packPrivateArtifact(pnpm, root, packed);
    const { manifest, tarball, files } = artifact;
    assert.equal(manifest.types, "./dist/index.d.ts");
    if (name === "vue") {
      assert.deepEqual(Object.keys(manifest.exports), [".", "./style.css"]);
      assert.deepEqual((manifest as { sideEffects?: string[] }).sideEffects, ["**/*.css"]);
      assert.equal(manifest.peerDependencies?.vue, "^3.5.0");
      assert.equal(manifest.dependencies?.vue, undefined);
      const js = run("tar", ["-xOf", tarball, "package/dist/index.js"], consumer);
      for (const dependency of [
        "vue",
        "@vueuse/core",
        "@gamut-plane/core",
        "@gamut-plane/render",
        "@gamut-plane/ui",
      ]) {
        assert.ok(js.includes(`from "${dependency}"`), `${dependency} must remain external`);
      }
      assert.ok(!js.includes("@/"));
      const types = run("tar", ["-xOf", tarball, "package/dist/index.d.ts"], consumer);
      for (const publicName of [
        "GamutPlane",
        "ColorValue",
        "GamutPlaneSelection",
        "GamutPlaneGamutId",
        "GamutPlaneGuideId",
        "GamutPlaneState",
        "CanvasColorSpaceStatus",
      ])
        assert.ok(types.includes(publicName), `Missing public declaration ${publicName}`);
      assert.doesNotMatch(
        types,
        /ColorPlane|NumericInput|ColorChannelControl|OklchSample|PickerPlaneFieldSampler|PickerGuide/,
      );
    }
    console.log(
      `${manifest.name}: ${artifact.bytes} packed bytes, sha256 ${artifact.sha256}\n${files.join("\n")}`,
    );
    artifacts.push(artifact);
  }
  verifyPackedDependencyGraph(artifacts);
  const ui = artifacts.find((artifact) => artifact.name === "@gamut-plane/ui")!;
  const vue = artifacts.find((artifact) => artifact.name === "@gamut-plane/vue")!;
  const uiCss = run("tar", ["-xOf", ui.tarball, "package/dist/style.css"], consumer);
  const vueCss = run("tar", ["-xOf", vue.tarball, "package/dist/style.css"], consumer);
  assert.equal(uiCss, vueCss, "Vue adapter CSS must equal the canonical packed UI sheet");
  assert.equal(uiCss, await readFile(resolve(packageRoot, "../ui/src/style.css"), "utf8"));
  assert.match(uiCss, /\[data-gp-root\]/);

  await cp(join(packageRoot, "consumer"), consumer, {
    recursive: true,
    filter: (source) =>
      !["node_modules", "dist", "artifacts", "playwright-report", "test-results"].includes(
        basename(source),
      ),
  });
  await cp(join(packageRoot, "e2e"), join(consumer, "e2e"), { recursive: true });
  const manifestPath = join(consumer, "package.json");
  const hostManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const artifact of artifacts) {
    hostManifest.dependencies[artifact.name] =
      `file:${relative(consumer, artifact.tarball).split(sep).join("/")}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(hostManifest, null, 2)}\n`);
  const installPolicy = join(consumer, "pnpm-workspace.yaml");
  const coreTarball = relative(consumer, artifacts[0]!.tarball).split(sep).join("/");
  await writeFile(
    installPolicy,
    (await readFile(installPolicy, "utf8")).replace(
      "overrides:\n",
      `overrides:\n  '@gamut-plane/core': 'file:${coreTarball}'\n  '@gamut-plane/render': 'file:${relative(consumer, artifacts[1]!.tarball).split(sep).join("/")}'\n  '@gamut-plane/ui': 'file:${relative(consumer, artifacts[2]!.tarball).split(sep).join("/")}'\n`,
    ),
  );
  console.log(`Isolated consumer: ${consumer}`);
  await addressConsumerArtifacts(consumer, artifacts, false);
  console.log(runPnpm(["install", "--frozen-lockfile=false"], consumer));
  await verifyInstalledArtifacts(consumer, artifacts);
  // One physical Vue runtime must serve both host and dependency imports.
  console.log(runPnpm(["list", "--prod", "--depth", "2"], consumer));
  for (const command of ["typecheck", "test:ssr", "build", "test:browser"]) {
    console.log(`Consumer ${command}`);
    console.log(runPnpm([command], consumer));
  }
  passed = true;
} finally {
  if (passed && !process.argv.includes("--keep")) {
    const target = await realpath(consumer);
    assert.equal(dirname(target), temporaryRoot);
    assert.ok(target.startsWith(join(temporaryRoot, "gamut-plane-consumer-")));
    await rm(target, { recursive: true });
  } else {
    console.log(`Consumer and evidence retained at ${consumer}`);
  }
}
