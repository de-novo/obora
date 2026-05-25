import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { WorkflowLocator } from "@obora/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startWorkflowWebBridge } from "../server.js";

const writeWorkflow = (path: string, name: string): Promise<void> =>
  writeFile(
    path,
    [`name: ${name}`, "version: '1.0'", "steps:", "  - name: start", "    agent: worker", ""].join(
      "\n"
    ),
    "utf-8"
  );

const withTempWorkflow = async (
  testFn: (input: {
    readonly root: string;
    readonly path: string;
    readonly globalDir: string;
    readonly locator: WorkflowLocator;
  }) => Promise<void>
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "obora-web-"));
  const dir = join(root, ".obora", "workflows");
  const globalDir = join(root, "global-workflows");
  const path = join(dir, "release-readiness.yaml");
  const globalPath = join(globalDir, "code-review.yaml");
  const locator: WorkflowLocator = {
    id: "project:test",
    scope: "project",
    name: "release-readiness",
    path,
    displayPath: ".obora/workflows/release-readiness.yaml",
    editable: true,
    sourceDir: dir,
    stepCount: 1,
    projectRoot: root,
  };

  try {
    await mkdir(dir, { recursive: true });
    await mkdir(globalDir, { recursive: true });
    await writeWorkflow(path, "release-readiness");
    await writeWorkflow(globalPath, "code-review");
    await testFn({ root, path, globalDir, locator });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflow web bridge", () => {
  it("serves workflow JSON and persists builder saves", async () => {
    await withTempWorkflow(async ({ path, locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const response = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`);
      const payload = await response.json();
      const saveResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: payload.revision,
          workflow: {
            name: "release-readiness",
            version: "1.0",
            steps: [{ name: "saved", agent: "worker" }],
          },
        }),
      });
      const saved = await readFile(path, "utf-8");

      await bridge.close();

      expect(payload).toMatchObject({
        mode: "build",
        locator: { name: "release-readiness", scope: "project" },
        workflow: { name: "release-readiness" },
        revision: expect.any(String),
      });
      expect(saveResponse.status).toBe(200);
      expect(saved).toContain("name: saved");
    });
  });

  it("serves the bridge HTML and requires the capability token for API access", async () => {
    await withTempWorkflow(async ({ locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const htmlResponse = await fetch(bridge.url);
      const currentLocatorResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows/${encodeURIComponent(locator.id)}?token=${bridge.token}`
      );
      const unauthorizedResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=wrong`);

      await bridge.close();

      expect(htmlResponse.status).toBe(200);
      expect(await htmlResponse.text()).toContain("release-readiness");
      expect(currentLocatorResponse.status).toBe(200);
      expect(unauthorizedResponse.status).toBe(401);
    });
  });

  it("serves scoped workflow discovery and resolver APIs through the same bridge roots", async () => {
    await withTempWorkflow(async ({ root, globalDir, locator }) => {
      const bridge = await startWorkflowWebBridge({
        locator,
        mode: "build",
        open: false,
        resolveRequest: {
          cwd: root,
          projectRoot: root,
          globalWorkflowDir: globalDir,
          scope: "all",
        },
      });
      const listResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows?scope=all&token=${bridge.token}`
      );
      const resolveResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows/resolve?token=${bridge.token}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target: "code-review", scope: "global", intent: "view" }),
        }
      );
      const unauthorizedResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows?token=wrong`
      );
      const listPayload = await listResponse.json();
      const resolvePayload = await resolveResponse.json();

      await bridge.close();

      expect(listResponse.status).toBe(200);
      expect(listPayload).toMatchObject({
        project: [expect.objectContaining({ name: "release-readiness", scope: "project" })],
        global: [expect.objectContaining({ name: "code-review", scope: "global" })],
      });
      expect(resolvePayload).toMatchObject({
        status: "resolved",
        locator: { name: "code-review", scope: "global" },
      });
      expect(unauthorizedResponse.status).toBe(401);
    });
  });

  it("serves and persists discovered workflows by locator id", async () => {
    await withTempWorkflow(async ({ root, globalDir, locator }) => {
      const bridge = await startWorkflowWebBridge({
        locator,
        mode: "build",
        open: false,
        resolveRequest: {
          cwd: root,
          projectRoot: root,
          globalWorkflowDir: globalDir,
          scope: "all",
        },
      });
      const listPayload = await fetch(
        `${bridge.apiBaseUrl}/api/workflows?scope=all&token=${bridge.token}`
      ).then((response) => response.json());
      const globalLocator = listPayload.global.find(
        (entry: WorkflowLocator) => entry.name === "code-review"
      ) as WorkflowLocator | undefined;
      const detailResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows/${encodeURIComponent(globalLocator?.id ?? "")}?token=${bridge.token}`
      );
      const detailPayload = await detailResponse.json();
      const saveResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows/${encodeURIComponent(globalLocator?.id ?? "")}?token=${bridge.token}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision: detailPayload.revision,
            yaml: "name: code-review\nversion: '1.0'\nsteps:\n  - name: saved-global\n    agent: reviewer\n",
          }),
        }
      );
      const notFoundResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflows/${encodeURIComponent("global:missing")}?token=${bridge.token}`
      );

      await bridge.close();

      expect(detailResponse.status).toBe(200);
      expect(detailPayload).toMatchObject({
        locator: { name: "code-review", scope: "global" },
        workflow: { name: "code-review" },
        revision: expect.any(String),
      });
      expect(saveResponse.status).toBe(200);
      expect(notFoundResponse.status).toBe(404);
    });
  });

  it("persists raw YAML saves and rejects unsupported API methods", async () => {
    await withTempWorkflow(async ({ path, locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const payload = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`).then(
        (response) => response.json()
      );
      const saveResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: payload.revision,
          yaml: "name: release-readiness\nversion: '1.0'\nsteps:\n  - name: raw-yaml\n    agent: worker\n",
        }),
      });
      const methodResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`,
        {
          method: "POST",
        }
      );
      const saved = await readFile(path, "utf-8");

      await bridge.close();

      expect(saveResponse.status).toBe(200);
      expect(methodResponse.status).toBe(405);
      expect(saved).toContain("name: raw-yaml");
    });
  });

  it("rejects saves without the current workflow revision", async () => {
    await withTempWorkflow(async ({ path, locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const payload = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`).then(
        (response) => response.json()
      );
      await writeFile(
        path,
        "name: release-readiness\nversion: '1.0'\nsteps:\n  - name: external-edit\n    agent: worker\n",
        "utf-8"
      );
      const missingRevisionResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ yaml: "name: missing\nsteps: []\n" }),
        }
      );
      const staleRevisionResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ yaml: "name: stale\nsteps: []\n", revision: payload.revision }),
        }
      );
      const saved = await readFile(path, "utf-8");

      await bridge.close();

      expect(missingRevisionResponse.status).toBe(409);
      expect(staleRevisionResponse.status).toBe(409);
      expect(saved).toContain("name: external-edit");
    });
  });

  it("rejects saves that are not parseable workflow YAML mappings", async () => {
    await withTempWorkflow(async ({ path, locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const payload = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`).then(
        (response) => response.json()
      );
      const malformedResponse = await fetch(
        `${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ yaml: "name: [broken\n", revision: payload.revision }),
        }
      );
      const scalarResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ yaml: "just-a-string\n", revision: payload.revision }),
      });
      const saved = await readFile(path, "utf-8");

      await bridge.close();

      expect(malformedResponse.status).toBe(422);
      expect(scalarResponse.status).toBe(422);
      expect(saved).toContain("name: release-readiness");
    });
  });

  it("resolves waitUntilClosed when the bridge is closed", async () => {
    await withTempWorkflow(async ({ locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const closed = bridge.waitUntilClosed();

      await bridge.close();

      await expect(closed).resolves.toBeUndefined();
    });
  });

  it("reports malformed save payloads as server errors", async () => {
    await withTempWorkflow(async ({ locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const response = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      });

      await bridge.close();

      expect(response.status).toBe(500);
    });
  });

  it("rejects saves in view mode", async () => {
    await withTempWorkflow(async ({ locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "view", open: false });
      const saveResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflow: { name: "release-readiness", steps: [] } }),
      });

      await bridge.close();

      expect(saveResponse.status).toBe(403);
    });
  });

  it("rejects saves when the locator path is outside its writable source root", async () => {
    await withTempWorkflow(async ({ root, locator }) => {
      const outsideDir = join(root, "outside");
      const outsidePath = join(outsideDir, "external.yaml");
      await mkdir(outsideDir, { recursive: true });
      await writeWorkflow(outsidePath, "external");
      const unsafeLocator: WorkflowLocator = {
        ...locator,
        id: "project:unsafe",
        path: outsidePath,
        displayPath: "outside/external.yaml",
      };
      const bridge = await startWorkflowWebBridge({
        locator: unsafeLocator,
        mode: "build",
        open: false,
      });
      const payload = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`).then(
        (response) => response.json()
      );
      const saveResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ yaml: "name: overwritten\nsteps: []\n", revision: payload.revision }),
      });
      const saved = await readFile(outsidePath, "utf-8");

      await bridge.close();

      expect(saveResponse.status).toBe(403);
      expect(saved).toContain("name: external");
    });
  });
});
