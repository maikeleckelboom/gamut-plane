import assert from "node:assert/strict";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(packageRoot, "dist");
assert.equal(dirname(output), resolve(packageRoot));
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(resolve(packageRoot, "src/style.css"), resolve(output, "style.css"));
