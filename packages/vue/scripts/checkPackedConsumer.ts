import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
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

interface PackageManifest {
  name: string;
  version: string;
  types: string;
  exports: Record<string, string | { types: string; import: string }>;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  sideEffects: boolean | string[];
}

let passed = false;
try {
  const tarballs: string[] = [];
  for (const name of ["core", "rendering", "vue"]) {
    const root = resolve(packageRoot, "..", name);
    const result = JSON.parse(runPnpm(["pack", "--pack-destination", packed, "--json"], root)) as {
      filename: string;
    };
    const tarball = resolve(packed, result.filename);
    const contents = run("tar", ["-tf", tarball], consumer).trim().split(/\r?\n/);
    const manifest = JSON.parse(
      run("tar", ["-xOf", tarball, "package/package.json"], consumer),
    ) as PackageManifest;
    assert.ok(contents.includes("package/LICENSE"));
    assert.ok(contents.includes("package/README.md"));
    assert.ok(
      contents.every((file) =>
        /^package\/(?:dist\/|package\.json$|README\.md$|LICENSE$)/.test(file),
      ),
    );
    assert.ok(contents.every((file) => !/\.(?:map|vue)$/.test(file)));
    assert.ok(
      Object.values(manifest.dependencies).every(
        (value) => !/^(?:workspace|file|link):/.test(value),
      ),
    );
    for (const entry of Object.values(manifest.exports)) {
      for (const target of typeof entry === "string" ? [entry] : Object.values(entry)) {
        assert.ok(
          contents.includes(`package/${target.replace(/^\.\//, "")}`),
          `Missing export ${target}`,
        );
        assert.match(target, /^\.\/dist\//);
      }
    }
    assert.equal(manifest.types, "./dist/index.d.ts");
    if (name === "vue") {
      assert.deepEqual(Object.keys(manifest.exports), [".", "./style.css"]);
      assert.deepEqual(manifest.sideEffects, ["**/*.css"]);
      assert.equal(manifest.peerDependencies?.vue, "^3.5.0");
      assert.equal(manifest.dependencies.vue, undefined);
      assert.equal(manifest.dependencies["@gamut-plane/core"], "0.1.0");
      const js = run("tar", ["-xOf", tarball, "package/dist/index.js"], consumer);
      for (const dependency of [
        "vue",
        "@vueuse/core",
        "@gamut-plane/core",
        "@gamut-plane/rendering",
      ]) {
        assert.ok(js.includes(`from "${dependency}"`), `${dependency} must remain external`);
      }
      assert.ok(!js.includes("@/"));
    }
    console.log(
      `${manifest.name}: ${(await stat(tarball)).size} packed bytes\n${contents.join("\n")}`,
    );
    tarballs.push(tarball);
  }

  await cp(join(packageRoot, "consumer"), consumer, { recursive: true });
  await cp(join(packageRoot, "e2e"), join(consumer, "e2e"), { recursive: true });
  const manifestPath = join(consumer, "package.json");
  const hostManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [index, name] of ["core", "rendering", "vue"].entries()) {
    hostManifest.dependencies[`@gamut-plane/${name}`] =
      `file:${relative(consumer, tarballs[index]!).split(sep).join("/")}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(hostManifest, null, 2)}\n`);
  const installPolicy = join(consumer, "pnpm-workspace.yaml");
  const coreTarball = relative(consumer, tarballs[0]!).split(sep).join("/");
  await writeFile(
    installPolicy,
    (await readFile(installPolicy, "utf8")).replace(
      "overrides:\n",
      `overrides:\n  '@gamut-plane/core': 'file:${coreTarball}'\n  '@gamut-plane/rendering': 'file:${relative(consumer, tarballs[1]!).split(sep).join("/")}'\n`,
    ),
  );
  console.log(`Isolated consumer: ${consumer}`);
  console.log(runPnpm(["install", "--frozen-lockfile=false"], consumer));
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
