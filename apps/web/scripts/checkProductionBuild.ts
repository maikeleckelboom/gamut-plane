import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = fileURLToPath(new URL("..", import.meta.url));
const distributionDirectory = join(webDirectory, "dist");

interface BuildFile {
  path: string;
  size: number;
}

async function listFiles(directory: string): Promise<BuildFile[]> {
  const files: BuildFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolutePath)));
    else if (entry.isFile()) {
      files.push({
        path: relative(distributionDirectory, absolutePath).replaceAll("\\", "/"),
        size: (await stat(absolutePath)).size,
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readPngDimensions(path: string): Promise<{ width: number; height: number }> {
  const contents = await readFile(path);
  requireCondition(
    contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${path} is not a PNG`,
  );
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

const files = await listFiles(distributionDirectory);
const paths = new Set(files.map((file) => file.path));
for (const requiredPath of ["_headers", "favicon.svg", "index.html", "og/gamut-plane.png"]) {
  requireCondition(paths.has(requiredPath), `Production build is missing ${requiredPath}`);
}

const javascriptFiles = files.filter((file) => /^assets\/.+-[A-Za-z0-9_-]{8}\.js$/.test(file.path));
const cssFiles = files.filter((file) => /^assets\/.+-[A-Za-z0-9_-]{8}\.css$/.test(file.path));
requireCondition(javascriptFiles.length === 1, "Expected one hashed application JavaScript asset");
requireCondition(cssFiles.length === 1, "Expected one hashed application CSS asset");

const forbiddenOutput = files.filter(
  (file) =>
    file.path.endsWith(".map") ||
    [".ts", ".tsx", ".vue"].includes(extname(file.path)) ||
    /(^|\/)(e2e|test|test-results|playwright-report)(\/|$)/.test(file.path),
);
requireCondition(
  forbiddenOutput.length === 0,
  `Production build contains source or test output: ${forbiddenOutput
    .map((file) => file.path)
    .join(", ")}`,
);

for (const file of files.filter((candidate) =>
  [".css", ".html", ".js", ".svg", ""].includes(extname(candidate.path)),
)) {
  const contents = await readFile(join(distributionDirectory, file.path), "utf8");
  requireCondition(
    !/Chromavert|@chromavert|C:[\\/]+dev[\\/]|C:[\\/]+Users[\\/]/i.test(contents),
    `${file.path} contains private or stale product material`,
  );
  if (file.path === "index.html") {
    requireCondition(
      !/<(?:script|link|img)\b[^>]+(?:src|href)=["']https?:\/\//i.test(contents),
      "index.html contains a remote script, stylesheet, or image",
    );
    requireCondition(
      contents.includes('href="/favicon.svg"'),
      "index.html does not link favicon.svg",
    );
    requireCondition(
      contents.includes('property="og:title"') && contents.includes('name="twitter:card"'),
      "index.html is missing Open Graph or Twitter metadata",
    );
  }
}

const headers = await readFile(join(distributionDirectory, "_headers"), "utf8");
for (const expectedHeader of [
  "Content-Security-Policy:",
  "Permissions-Policy:",
  "Referrer-Policy: no-referrer",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "Cache-Control: public, max-age=31556952, immutable",
]) {
  requireCondition(headers.includes(expectedHeader), `_headers is missing ${expectedHeader}`);
}

const socialImage = files.find((file) => file.path === "og/gamut-plane.png")!;
const socialDimensions = await readPngDimensions(
  join(distributionDirectory, "og", "gamut-plane.png"),
);
requireCondition(
  socialDimensions.width === 1200 && socialDimensions.height === 630,
  `Open Graph image must be 1200x630, received ${socialDimensions.width}x${socialDimensions.height}`,
);
requireCondition(socialImage.size <= 1_000_000, "Open Graph image exceeds 1 MB");

const javascriptContents = await readFile(join(distributionDirectory, javascriptFiles[0]!.path));
const cssContents = await readFile(join(distributionDirectory, cssFiles[0]!.path));
const totalSize = files.reduce((total, file) => total + file.size, 0);
const largestFile = files.reduce((largest, file) => (file.size > largest.size ? file : largest));

console.log(
  JSON.stringify(
    {
      fileCount: files.length,
      totalBytes: totalSize,
      mainJavaScript: {
        bytes: javascriptFiles[0]!.size,
        gzipBytes: gzipSync(javascriptContents).byteLength,
      },
      mainCss: {
        bytes: cssFiles[0]!.size,
        gzipBytes: gzipSync(cssContents).byteLength,
      },
      openGraphImageBytes: socialImage.size,
      largestFile,
      sourceMaps: 0,
    },
    null,
    2,
  ),
);
