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
    readonly locator: WorkflowLocator;
  }) => Promise<void>
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "obora-web-"));
  const dir = join(root, ".obora", "workflows");
  const path = join(dir, "release-readiness.yaml");
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
    await writeWorkflow(path, "release-readiness");
    await testFn({ root, path, locator });
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
      });
      expect(saveResponse.status).toBe(200);
      expect(saved).toContain("name: saved");
    });
  });

  it("serves the bridge HTML and requires the capability token for API access", async () => {
    await withTempWorkflow(async ({ locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const htmlResponse = await fetch(bridge.url);
      const unauthorizedResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=wrong`);

      await bridge.close();

      expect(htmlResponse.status).toBe(200);
      expect(await htmlResponse.text()).toContain("release-readiness");
      expect(unauthorizedResponse.status).toBe(401);
    });
  });

  it("persists raw YAML saves and rejects unsupported API methods", async () => {
    await withTempWorkflow(async ({ path, locator }) => {
      const bridge = await startWorkflowWebBridge({ locator, mode: "build", open: false });
      const saveResponse = await fetch(`${bridge.apiBaseUrl}/api/workflow?token=${bridge.token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
});
