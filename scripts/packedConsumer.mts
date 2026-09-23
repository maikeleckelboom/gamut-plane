import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

/** Local tarball cache identities must change when same-version private artifacts change. */
export async function addressConsumerArtifacts(
  consumer: string,
  names: readonly string[],
  frozen = true,
) {
  for (const name of names) {
    const original = `artifacts/gamut-plane-${name}-0.1.0.tgz`;
    const digest = createHash("sha256")
      .update(await readFile(join(consumer, original)))
      .digest("hex");
    const addressed = `artifacts/${digest}/gamut-plane-${name}-0.1.0.tgz`;
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

export async function verifyInstalledArtifacts(consumer: string, names: readonly string[]) {
  for (const name of names) {
    const tarball = join(consumer, "artifacts", `gamut-plane-${name}-0.1.0.tgz`);
    const listing = spawnSync("tar", ["-tf", tarball], { encoding: "utf8", windowsHide: true });
    assert.equal(listing.status, 0, listing.stderr);
    for (const file of listing.stdout.trim().split(/\r?\n/)) {
      if (file.endsWith("/")) continue;
      const packed = spawnSync("tar", ["-xOf", tarball, file], {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(packed.status, 0);
      const installed = await readFile(
        join(consumer, "node_modules", "@gamut-plane", name, file.replace(/^package\//, "")),
      );
      assert.ok(
        installed.equals(packed.stdout),
        `Installed ${name}/${file} differs from the tested artifact`,
      );
    }
  }
  console.log("Every installed private-package file matches its freshly packed artifact.");
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
