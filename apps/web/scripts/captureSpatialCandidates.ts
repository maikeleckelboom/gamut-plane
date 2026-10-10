import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

// Appearance comparison for boundary tessellation candidates. Offline evidence, not a test.
//
//   node packages/render/scripts/exportSpatialCandidates.ts <geometry directory>
//   pnpm --filter @gamut-plane/web dev   (or any server serving the app root)
//   node apps/web/scripts/captureSpatialCandidates.ts <geometry directory> <output directory> [url]
//
// Every candidate is rendered through the application's own Shape and Color materials at identical
// camera poses in a 1000x700 drawing buffer and compared per pixel with a very fine analytic-normal
// reference. Pixel differences are measured only where either image shows the surface. Reported
// separately from geometric error: this is appearance, on one software-rendered Chromium.
const [geometryDirectory, outputDirectory, url = "http://127.0.0.1:4178"] = process.argv.slice(2);
if (!geometryDirectory || !outputDirectory)
  throw new Error("Usage: captureSpatialCandidates.ts <geometry dir> <output dir> [url]");
mkdirSync(outputDirectory, { recursive: true });
interface Entry {
  id: string;
  space: string;
  family: string;
  policy: string;
  role: "reference-a" | "reference-b" | "candidate";
  file: string;
  triangles: number;
  uploadVertices: number;
}
const manifest = JSON.parse(
  readFileSync(join(geometryDirectory, "manifest.json"), "utf8"),
) as Entry[];
const home: [number, number, number] = [1.35, 0.8, 1.65];
const views = [
  { name: "home", toViewer: home, target: [0, 0.5, 0], zoom: 1 },
  { name: "blue", toViewer: [-0.4, 0.1, -2], target: [0, 0.5, 0], zoom: 1 },
  { name: "side", toViewer: [2, 0.1, 0.1], target: [0, 0.5, 0], zoom: 1 },
  // Magnified windows: the apex region where the cube root is singular, and a high-curvature cusp.
  { name: "apex-zoom", toViewer: home, target: [0, 0.06, 0], zoom: 10 },
  { name: "cusp-zoom", toViewer: home, target: [0.2, 0.62, 0.12], zoom: 6 },
] as const;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1100, height: 800 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${url}/`);
await page.evaluate(async () => {
  const path = "/e2e/spatialCandidateHarness.ts";
  const harnessModule = (await import(/* @vite-ignore */ path)) as {
    mountCandidateHarness: () => unknown;
  };
  (globalThis as unknown as { harness: unknown }).harness = harnessModule.mountCandidateHarness();
});
type Harness = {
  add(id: string, base64: string): void;
  render(id: string, view: unknown, mode: string): { pixels: Uint8Array; png: string };
  compare(a: Uint8Array, b: Uint8Array): Record<string, unknown> & { diffPng: string };
  info: { width: number; height: number; samples: number };
};
const info = await page.evaluate(
  () => (globalThis as unknown as { harness: Harness }).harness.info,
);
for (const entry of manifest) {
  const base64 = readFileSync(join(geometryDirectory, entry.file)).toString("base64");
  await page.evaluate(
    ([id, data]) => (globalThis as unknown as { harness: Harness }).harness.add(id!, data!),
    [`${entry.space}:${entry.id}`, base64],
  );
}
const rows: unknown[] = [];
for (const space of ["srgb", "display-p3"]) {
  const reference = manifest.find((m) => m.space === space && m.role === "reference-a")!;
  for (const view of views)
    for (const mode of ["shape", "color"]) {
      // Render the reference once per view/mode, keep its pixels in the page, compare each candidate.
      const result = await page.evaluate(
        ([sp, v, m, refId, ids]) => {
          const harness = (globalThis as unknown as { harness: Harness }).harness;
          const ref = harness.render(`${sp}:${refId}`, v, m as string);
          const out: Record<string, unknown>[] = [];
          for (const id of ids as string[]) {
            const candidate = harness.render(`${sp}:${id}`, v, m as string);
            const stats = harness.compare(candidate.pixels, ref.pixels);
            out.push({ id, png: candidate.png, ...stats });
          }
          return { reference: ref.png, candidates: out };
        },
        [
          space,
          view,
          mode,
          reference.id,
          manifest.filter((m) => m.space === space && m.role !== "reference-a").map((m) => m.id),
        ] as const,
      );
      const stem = `${space}-${view.name}-${mode}`;
      writeFileSync(
        join(outputDirectory, `${stem}-reference.png`),
        Buffer.from(result.reference.split(",")[1]!, "base64"),
      );
      for (const candidate of result.candidates as { id: string; png: string; diffPng: string }[]) {
        const { png, diffPng, ...stats } = candidate;
        writeFileSync(
          join(outputDirectory, `${stem}-${candidate.id}.png`),
          Buffer.from(png.split(",")[1]!, "base64"),
        );
        writeFileSync(
          join(outputDirectory, `${stem}-${candidate.id}-diffx8.png`),
          Buffer.from(diffPng.split(",")[1]!, "base64"),
        );
        const entry = manifest.find((m) => m.space === space && m.id === candidate.id)!;
        rows.push({
          space,
          view: view.name,
          mode,
          triangles: entry.triangles,
          role: entry.role,
          policy: entry.policy,
          ...stats,
        });
      }
    }
}
writeFileSync(
  join(outputDirectory, "appearance.json"),
  JSON.stringify(
    {
      schema: 1,
      status: "appearance-experiment-single-software-renderer",
      canvas: info,
      reference: "radial hybrid, encoded upper knots, m=181, analytic vertex normals",
      views,
      pixelMetric:
        "Maximum 8-bit channel difference per pixel over the union of surface pixels. coverageMismatchPixels count pixels that are surface in only one image.",
      errors,
      rows,
    },
    null,
    2,
  ),
);
await browser.close();
console.log(`wrote ${rows.length} comparisons to ${outputDirectory}`);
