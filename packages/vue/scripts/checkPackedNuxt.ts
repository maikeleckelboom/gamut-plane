import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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

async function run(args: string[], cwd = consumer, env: Record<string, string> = {}) {
  console.log(`pnpm ${args.join(" ")}`);
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(process.execPath, [pnpm!, ...args], {
      cwd,
      stdio: "inherit",
      windowsHide: true,
      detached: process.platform !== "win32",
      env: { ...process.env, NODE_PATH: "", NUXT_TELEMETRY_DISABLED: "1", ...env },
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
    const timer = setTimeout(stop, 600_000);
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
}

let passed = false;
try {
  await cp(fixture, consumer, { recursive: true });
  await cp(join(packageRoot, "consumer/ssrSmoke.ts"), join(consumer, "ssrSmoke.ts"));
  for (const name of ["core", "vue"])
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
  await run(["install", "--frozen-lockfile"]);
  await run(["test:ssr"]);
  await run(["typecheck"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "development" });
  await run(["build"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "production" });
  await run(["generate"]);
  await run(["test:browser"], consumer, { FIXTURE_MODE: "generated" });
  passed = true;
} finally {
  const evidence = process.env.GAMUT_PLANE_EVIDENCE;
  if (evidence) {
    for (const name of ["playwright-report", "test-results"]) {
      await cp(join(consumer, name), join(evidence, "nuxt", name), { recursive: true }).catch(
        () => {},
      );
    }
  }
  if (passed && !process.argv.includes("--keep")) {
    const target = await realpath(consumer);
    assert.equal(dirname(target), temporaryRoot);
    assert.ok(target.startsWith(join(temporaryRoot, "gamut-plane-nuxt-")));
    await rm(target, { recursive: true });
  } else console.log(`Consumer and evidence retained at ${consumer}`);
}
