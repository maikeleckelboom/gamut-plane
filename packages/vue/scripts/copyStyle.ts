import assert from "node:assert/strict";
import { cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(packageRoot, "dist/style.css");
assert.equal(dirname(dirname(output)), resolve(packageRoot));
await cp(fileURLToPath(import.meta.resolve("@gamut-plane/ui/style.css")), output);
