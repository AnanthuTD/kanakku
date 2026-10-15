import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

// Serve the actual Expo export, with SPA fallback for Router destinations.
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1:8095").pathname,
    );
    if (path === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    let file = resolve(root, `.${path}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const metadata = await stat(file).catch(() => null);
    if (!metadata?.isFile()) {
      if (extname(path)) {
        response.writeHead(404).end();
        return;
      }
      file = resolve(root, "index.html");
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(8095, "127.0.0.1", () =>
  process.stdout.write("Kanakku E2E export ready at http://127.0.0.1:8095\n"),
);
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
