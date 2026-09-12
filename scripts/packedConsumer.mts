import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

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
  kind: "nuxt" | "next",
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
