import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { stringify as stringifyYaml } from "yaml";

import { discoverWorkflowLocators, readWorkflow, resolveWorkflowTarget } from "@obora/sdk";
import type { WorkflowResolveIntent, WorkflowResolveRequest, WorkflowResolveScope } from "@obora/sdk";

import { renderWorkflowWebHtml } from "./html.js";
import type { WorkflowWebBridgeHandle, WorkflowWebBridgeOptions } from "./types.js";

const defaultHost = "127.0.0.1";

const readRequestBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.once("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    request.once("error", reject);
  });

const send = (
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string
): void => {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(body);
};

const sendJson = (response: ServerResponse, statusCode: number, body: unknown): void => {
  send(response, statusCode, "application/json; charset=utf-8", JSON.stringify(body));
};

const sendError = (response: ServerResponse, statusCode: number, message: string): void => {
  sendJson(response, statusCode, { error: message });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWorkflowResolveScope = (value: unknown): value is WorkflowResolveScope =>
  value === "project" || value === "global" || value === "all";

const isWorkflowResolveIntent = (value: unknown): value is WorkflowResolveIntent =>
  value === "view" || value === "build" || value === "run";

const parseBodyAsRecord = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const raw = await readRequestBody(request);
  const parsed = JSON.parse(raw.length > 0 ? raw : "{}") as unknown;
  return isRecord(parsed) ? parsed : {};
};

const responseForWorkflow = async ({
  mode,
  locator,
}: WorkflowWebBridgeOptions): Promise<Record<string, unknown>> => {
  const [workflow, yaml] = await Promise.all([
    readWorkflow(locator.path),
    readFile(locator.path, "utf-8"),
  ]);
  return {
    mode,
    locator,
    workflow,
    yaml,
  };
};

const yamlFromSaveBody = (body: Record<string, unknown>): string =>
  typeof body.yaml === "string"
    ? body.yaml
    : stringifyYaml(body.workflow ?? {}, {
        indent: 2,
        lineWidth: 0,
        sortMapEntries: false,
      });

const baseResolveRequest = (options: WorkflowWebBridgeOptions): WorkflowResolveRequest => ({
  ...(options.resolveRequest ?? {}),
  cwd: options.resolveRequest?.cwd ?? options.locator.projectRoot ?? process.cwd(),
  ...(options.resolveRequest?.projectRoot
    ? { projectRoot: options.resolveRequest.projectRoot }
    : options.locator.projectRoot
      ? { projectRoot: options.locator.projectRoot }
      : {}),
  ...(options.resolveRequest?.globalWorkflowDir
    ? { globalWorkflowDir: options.resolveRequest.globalWorkflowDir }
    : {}),
  ...(options.resolveRequest?.projectWorkflowDirs
    ? { projectWorkflowDirs: options.resolveRequest.projectWorkflowDirs }
    : {}),
});

const requestScope = (
  url: URL,
  fallback: WorkflowResolveRequest["scope"]
): WorkflowResolveRequest["scope"] => {
  const scope = url.searchParams.get("scope");
  return isWorkflowResolveScope(scope) ? scope : fallback;
};

const resolveRequestFromBody = async (
  request: IncomingMessage,
  options: WorkflowWebBridgeOptions
): Promise<WorkflowResolveRequest> => {
  const body = await parseBodyAsRecord(request);
  const target = typeof body.target === "string" ? body.target : undefined;
  const scope = isWorkflowResolveScope(body.scope) ? body.scope : baseResolveRequest(options).scope;
  const intent = isWorkflowResolveIntent(body.intent) ? body.intent : options.mode;
  return {
    ...baseResolveRequest(options),
    ...(target ? { target } : {}),
    ...(scope ? { scope } : {}),
    intent,
  };
};

const handleWorkflowListRequest = async (
  url: URL,
  response: ServerResponse,
  options: WorkflowWebBridgeOptions
): Promise<void> => {
  const request = baseResolveRequest(options);
  const discovery = await discoverWorkflowLocators({
    ...request,
    scope: requestScope(url, request.scope) ?? "all",
  });
  sendJson(response, 200, discovery);
};

const handleWorkflowResolveRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  options: WorkflowWebBridgeOptions
): Promise<void> => {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed.");
    return;
  }

  sendJson(response, 200, await resolveWorkflowTarget(await resolveRequestFromBody(request, options)));
};

const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  options: WorkflowWebBridgeOptions
): Promise<void> => {
  if (request.method === "GET") {
    sendJson(response, 200, await responseForWorkflow(options));
    return;
  }

  if (request.method === "PUT") {
    if (options.mode !== "build" || !options.locator.editable) {
      sendError(response, 403, "Workflow is read-only in this web session.");
      return;
    }

    const body = await parseBodyAsRecord(request);
    await writeFile(options.locator.path, yamlFromSaveBody(body), "utf-8");
    sendJson(response, 200, await responseForWorkflow(options));
    return;
  }

  sendError(response, 405, "Method not allowed.");
};

const createWorkflowRequestHandler =
  (options: WorkflowWebBridgeOptions, token: string, baseUrl: string) =>
  async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", baseUrl);
    const isApi =
      url.pathname === "/api/workflow" ||
      url.pathname === "/api/workflows" ||
      url.pathname === "/api/workflows/resolve";
    const authorized = url.searchParams.get("token") === token;

    try {
      if (isApi && !authorized) {
        sendError(response, 401, "Invalid workflow web token.");
        return;
      }

      if (url.pathname === "/api/workflow") {
        await handleApiRequest(request, response, options);
        return;
      }

      if (url.pathname === "/api/workflows") {
        await handleWorkflowListRequest(url, response, options);
        return;
      }

      if (url.pathname === "/api/workflows/resolve") {
        await handleWorkflowResolveRequest(request, response, options);
        return;
      }

      send(
        response,
        200,
        "text/html; charset=utf-8",
        renderWorkflowWebHtml({ locator: options.locator, mode: options.mode, token })
      );
    } catch (error) {
      sendError(response, 500, error instanceof Error ? error.message : String(error));
    }
  };

const listen = (
  server: ReturnType<typeof createServer>,
  host: string,
  port: number
): Promise<{ readonly port: number }> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve({ port: typeof address === "object" && address ? address.port : port });
    });
  });

const closeServer = (server: ReturnType<typeof createServer>): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const waitUntilClosed = (
  server: ReturnType<typeof createServer>,
  close: () => Promise<void>
): Promise<void> =>
  new Promise((resolve) => {
    const shutdown = (): void => {
      close().then(resolve, resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.once("close", resolve);
  });

export const startWorkflowWebBridge = async (
  options: WorkflowWebBridgeOptions
): Promise<WorkflowWebBridgeHandle> => {
  const host = options.host ?? defaultHost;
  const token = options.token ?? randomBytes(18).toString("base64url");
  const server = createServer();
  const requestedPort = options.port ?? 0;
  const { port } = await listen(server, host, requestedPort);
  const apiBaseUrl = `http://${host}:${port}`;
  const routeSegment = options.mode === "build" ? "builder" : "view";
  const url = `${apiBaseUrl}/?token=${encodeURIComponent(token)}#/workflows/${encodeURIComponent(
    options.locator.id
  )}/${routeSegment}`;
  const close = (): Promise<void> => closeServer(server);

  server.on("request", createWorkflowRequestHandler(options, token, apiBaseUrl));

  return {
    url,
    apiBaseUrl,
    token,
    close,
    waitUntilClosed: () => waitUntilClosed(server, close),
  };
};
