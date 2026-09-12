import assert from "node:assert/strict";
import { createPnpmRunner, finishConsumer } from "../../../scripts/packedConsumer.mts";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(packageRoot, "next-consumer");
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, "Run through pnpm test:next");
const temporaryRoot = await realpath(tmpdir());
const consumer = await mkdtemp(join(temporaryRoot, "gamut-plane-next-"));
console.log(`Isolated Next consumer: ${consumer}`);

const run = createPnpmRunner(pnpm, consumer, { NEXT_TELEMETRY_DISABLED: "1" });

let passed = false;
try {
  await cp(fixture, consumer, { recursive: true });
  await cp(join(fixture, "ssrSmoke.ts"), join(consumer, "ssrSmoke.ts"));
  for (const name of ["core", "render", "react"])
    await run(
      ["pack", "--pack-destination", join(consumer, "artifacts")],
      resolve(packageRoot, "..", name),
    );
  for (const name of ["core", "render", "react"]) {
    const tarball = join(consumer, "artifacts", `gamut-plane-${name}-0.1.0.tgz`);
    function tar(args: string[]) {
      const result = spawnSync("tar", args, { encoding: "utf8", windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    }
    const files = tar(["-tf", tarball]).trim().split(/\r?\n/);
    const manifest = JSON.parse(tar(["-xOf", tarball, "package/package.json"]));
    assert.ok(files.includes("package/LICENSE"));
    assert.ok(files.includes("package/README.md"));
    assert.ok(
      files.every((file) => /^package\/(?:dist\/|package\.json$|README\.md$|LICENSE$)/.test(file)),
    );
    for (const entry of Object.values(manifest.exports)) {
      for (const target of typeof entry === "string"
        ? [entry]
        : Object.values(entry as Record<string, string>))
        assert.ok(files.includes(`package/${target.replace(/^\.\//, "")}`));
    }
    assert.ok(
      Object.values(manifest.dependencies).every(
        (value) => !/^(workspace|file|link):/.test(String(value)),
      ),
    );
    assert.equal(manifest.dependencies.vue, undefined);
    if (name === "react") {
      assert.deepEqual(manifest.sideEffects, ["**/*.css"]);
      assert.deepEqual(manifest.peerDependencies, { react: "~19.3.0", "react-dom": "~19.3.0" });
      assert.equal(manifest.dependencies.react, undefined);
      assert.equal(manifest.dependencies["react-dom"], undefined);
      for (const file of ["index.js", "gamutPlane.js"])
        assert.match(tar(["-xOf", tarball, `package/dist/${file}`]), /^"use client";/);
      const component = tar(["-xOf", tarball, "package/dist/gamutPlane.js"]);
      assert.match(component, /from "react"/);
      assert.match(component, /from "react\/jsx-runtime"/);
      assert.doesNotMatch(component, /from ["'][^"']*vue/);
    }
  }
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
  await run(["install", "--frozen-lockfile"]);
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
