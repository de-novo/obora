import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const resolveRequestPath = (url) => {
  const pathname = new URL(url ?? "/", `http://localhost:${port}`).pathname;
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(root, normalize(decodeURIComponent(requested)));
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : undefined;
};

const send = (response, statusCode, body, contentType = "text/plain; charset=utf-8") => {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(body);
};

const server = createServer(async (request, response) => {
  try {
    const filePath = resolveRequestPath(request.url);
    if (!filePath) {
      send(response, 403, "Forbidden");
      return;
    }

    const body = await readFile(filePath);
    const contentType = contentTypes[extname(filePath)] ?? "application/octet-stream";
    send(response, 200, body, contentType);
  } catch {
    send(response, 404, "Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Chat Todo App running at http://127.0.0.1:${port}`);
});
