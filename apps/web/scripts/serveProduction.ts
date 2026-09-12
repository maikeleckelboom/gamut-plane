import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = fileURLToPath(new URL("..", import.meta.url));
const distributionDirectory = resolve(webDirectory, "dist");
const host = "127.0.0.1";
const port = Number(process.env.GAMUT_PLANE_PREVIEW_PORT ?? 4178);

interface HeaderRule {
  pattern: string;
  headers: ReadonlyMap<string, string>;
}

function parseHeaderRules(contents: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let pattern: string | null = null;
  let headers = new Map<string, string>();

  const finishRule = (): void => {
    if (pattern) rules.push({ pattern, headers });
    pattern = null;
    headers = new Map();
  };

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) {
      if (!line.trim()) finishRule();
      continue;
    }
    if (!/^\s/.test(rawLine)) {
      finishRule();
      pattern = line;
      continue;
    }

    const separator = line.indexOf(":");
    if (pattern && separator > 0) {
      headers.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  finishRule();
  return rules;
}

function matchesPattern(pattern: string, pathname: string): boolean {
  const regularExpression = `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("*", ".*")}$`;
  return new RegExp(regularExpression).test(pathname);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

const headerRules = parseHeaderRules(
  await readFile(resolve(distributionDirectory, "_headers"), "utf8"),
);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendError(response, 405, "Method not allowed");
      return;
    }

    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(distributionDirectory, relativePath);
    if (
      filePath !== distributionDirectory &&
      !filePath.startsWith(`${distributionDirectory}${sep}`)
    ) {
      sendError(response, 403, "Forbidden");
      return;
    }
    if (relativePath === "_headers") {
      sendError(response, 404, "Not found");
      return;
    }

    const fileStatus = await stat(filePath).catch(() => null);
    if (!fileStatus?.isFile()) {
      sendError(response, 404, "Not found");
      return;
    }

    for (const rule of headerRules) {
      if (!matchesPattern(rule.pattern, pathname)) continue;
      for (const [name, value] of rule.headers) response.setHeader(name, value);
    }
    response.setHeader(
      "Content-Type",
      contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
    );
    response.setHeader("Content-Length", fileStatus.size);
    response.writeHead(200);
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`Gamut Plane production preview: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
