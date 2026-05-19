import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverWorkflowLocators,
  resolveWorkflowTarget,
  type WorkflowResolveRequest,
} from "../workflow-scope/index.js";
import { describe, expect, it } from "vitest";

interface WorkflowScopeFixture {
  readonly projectRoot: string;
  readonly globalWorkflowDir: string;
  readonly projectWorkflowPath: string;
  readonly globalWorkflowPath: string;
  readonly globalShadowedWorkflowPath: string;
  readonly externalWorkflowPath: string;
}

const writeWorkflow = (path: string, name: string): Promise<void> =>
  writeFile(
    path,
    [`name: ${name}`, "version: '1.0'", "steps:", "  - name: start", "    agent: worker", ""].join(
      "\n"
    ),
    "utf-8"
  );

const withWorkflowScopeFixture = async (
  testFn: (fixture: WorkflowScopeFixture) => Promise<void>
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "obora-workflow-scope-"));
  const projectRoot = join(root, "project");
  const globalWorkflowDir = join(root, "home", ".obora", "workflows");
  const projectWorkflowDir = join(projectRoot, ".obora", "workflows");
  const secondaryProjectWorkflowDir = join(projectRoot, "workflows");
  const externalWorkflowDir = join(root, "external");
  const projectWorkflowPath = join(projectWorkflowDir, "release-readiness.yaml");
  const secondaryProjectWorkflowPath = join(secondaryProjectWorkflowDir, "intake-to-decision.yaml");
  const globalWorkflowPath = join(globalWorkflowDir, "code-review.yaml");
  const globalShadowedWorkflowPath = join(globalWorkflowDir, "release-readiness.yaml");
  const externalWorkflowPath = join(externalWorkflowDir, "ad-hoc.yaml");

  try {
    await Promise.all([
      mkdir(projectWorkflowDir, { recursive: true }),
      mkdir(secondaryProjectWorkflowDir, { recursive: true }),
      mkdir(globalWorkflowDir, { recursive: true }),
      mkdir(externalWorkflowDir, { recursive: true }),
    ]);
    await Promise.all([
      writeWorkflow(projectWorkflowPath, "release-readiness"),
      writeWorkflow(secondaryProjectWorkflowPath, "intake-to-decision"),
      writeWorkflow(globalWorkflowPath, "code-review"),
      writeWorkflow(globalShadowedWorkflowPath, "release-readiness"),
      writeWorkflow(externalWorkflowPath, "ad-hoc"),
    ]);
    await testFn({
      projectRoot,
      globalWorkflowDir,
      projectWorkflowPath,
      globalWorkflowPath,
      globalShadowedWorkflowPath,
      externalWorkflowPath,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const requestFor = (
  fixture: WorkflowScopeFixture,
  request: Partial<WorkflowResolveRequest> = {}
): WorkflowResolveRequest => ({
  cwd: fixture.projectRoot,
  projectRoot: fixture.projectRoot,
  globalWorkflowDir: fixture.globalWorkflowDir,
  ...request,
});

describe("workflow scope resolver", () => {
  it("discovers project and global workflows with shadowing metadata", async () => {
    await withWorkflowScopeFixture(async (fixture) => {
      const discovery = await discoverWorkflowLocators(requestFor(fixture));

      expect(discovery.project.map((locator) => locator.name)).toEqual([
        "release-readiness",
        "intake-to-decision",
      ]);
      expect(discovery.global.map((locator) => locator.name)).toEqual([
        "code-review",
        "release-readiness",
      ]);
      expect(
        discovery.global.find((locator) => locator.name === "release-readiness")
      ).toMatchObject({
        scope: "global",
        editable: true,
        shadowedBy: fixture.projectWorkflowPath,
      });
      expect(
        discovery.project.find((locator) => locator.name === "release-readiness")
      ).toMatchObject({
        scope: "project",
        editable: true,
        shadows: fixture.globalShadowedWorkflowPath,
      });
    });
  });

  it("resolves exact external workflow paths as read-only external locators", async () => {
    await withWorkflowScopeFixture(async (fixture) => {
      const result = await resolveWorkflowTarget(
        requestFor(fixture, { target: fixture.externalWorkflowPath, intent: "view" })
      );

      expect(result).toMatchObject({
        status: "resolved",
        locator: {
          name: "ad-hoc",
          scope: "external",
          path: fixture.externalWorkflowPath,
          editable: false,
        },
      });
    });
  });

  it("requires scope for ambiguous editable workflow targets", async () => {
    await withWorkflowScopeFixture(async (fixture) => {
      const viewResult = await resolveWorkflowTarget(
        requestFor(fixture, { target: "release-readiness", intent: "view" })
      );
      const buildResult = await resolveWorkflowTarget(
        requestFor(fixture, { target: "release-readiness", intent: "build" })
      );
      const globalResult = await resolveWorkflowTarget(
        requestFor(fixture, { target: "release-readiness", scope: "global", intent: "build" })
      );

      expect(viewResult).toMatchObject({
        status: "resolved",
        locator: {
          scope: "project",
          path: fixture.projectWorkflowPath,
        },
      });
      expect(viewResult.diagnostics.join("\n")).toContain("shadow");
      expect(buildResult).toMatchObject({
        status: "ambiguous",
      });
      expect(buildResult.locator).toBeUndefined();
      expect(buildResult.candidates.map((candidate) => candidate.scope)).toEqual([
        "project",
        "global",
      ]);
      expect(globalResult).toMatchObject({
        status: "resolved",
        locator: {
          scope: "global",
          path: fixture.globalShadowedWorkflowPath,
        },
      });
    });
  });

  it("reports not-found targets without inventing a locator", async () => {
    await withWorkflowScopeFixture(async (fixture) => {
      const result = await resolveWorkflowTarget(
        requestFor(fixture, { target: "missing-workflow", intent: "run" })
      );

      expect(result).toMatchObject({
        status: "not-found",
        candidates: [],
      });
      expect(result.locator).toBeUndefined();
      expect(result.diagnostics.join("\n")).toContain("missing-workflow");
    });
  });
});
