/**
 * Fastify Server Main Entry Point
 *
 * Provides HTTP/SSE server for agent activity dashboard
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { apiRoutes } from "./routes/api";
import { sseRoutes } from "./routes/sse";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let server: FastifyInstance | null = null;

/**
 * Resolves client dist path for both development and production builds
 */
function resolveClientDistPath(): string {
  const currentDir = __dirname;

  if (currentDir.includes("/dist")) {
    const packageRoot = currentDir.replace(/\/dist.*$/, "");
    return join(packageRoot, "src/dashboard/client/dist");
  }

  return join(currentDir, "../client/dist");
}

/**
 * Starts the Fastify server
 *
 * @param port - Server port (default: 3100)
 * @param host - Server host (default: "localhost")
 * @returns Server address string
 */
export async function startServer(
  port = 3100,
  host = "localhost"
): Promise<string> {
  if (server) {
    throw new Error("Server is already running");
  }

  server = Fastify({
    logger: false,
  });

  await server.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  server.get("/health", async (request, reply) => {
    return reply.send({ status: "ok" });
  });

  await server.register(apiRoutes);
  await server.register(sseRoutes);

  const clientDistPath = resolveClientDistPath();

  await server.register(fastifyStatic, {
    root: clientDistPath,
    prefix: "/",
    decorateReply: false,
  });

  server.setNotFoundHandler((request, reply) => {
    if (
      request.url.startsWith("/api/") ||
      request.url.startsWith("/sse/") ||
      request.url === "/health"
    ) {
      return reply.status(404).send({ ok: false, error: "Not found" });
    }

    const indexPath = join(clientDistPath, "index.html");

    if (!existsSync(indexPath)) {
      return reply
        .status(503)
        .send({ ok: false, error: "Client not built" });
    }

    const indexHtml = readFileSync(indexPath, "utf-8");
    return reply.type("text/html").send(indexHtml);
  });

  const address = await server.listen({
    port,
    host,
  });

  return address;
}

/**
 * Stops the Fastify server
 */
export async function stopServer(): Promise<void> {
  if (!server) {
    return;
  }

  await server.close();
  server = null;
}
