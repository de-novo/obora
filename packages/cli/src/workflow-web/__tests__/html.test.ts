import type { WorkflowLocator } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import { renderWorkflowWebHtml } from "../html.js";

const locator: WorkflowLocator = {
  id: "project:html",
  scope: "project",
  name: "release <readiness>",
  path: "/repo/.obora/workflows/release.yaml",
  displayPath: ".obora/workflows/release.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 1,
  projectRoot: "/repo",
};

describe("workflow web html", () => {
  it("escapes locator text and enables builder saves", () => {
    const html = renderWorkflowWebHtml({ locator, mode: "build", token: "token-1" });

    expect(html).toContain("release &lt;readiness&gt;");
    expect(html).toContain("project workflow");
    expect(html).toContain('button id="save" type="button" class="primary"');
    expect(html).toContain('const workflowId = "project%3Ahtml";');
    expect(html).toContain('"/api/workflows/" + workflowId');
    expect(html).not.toContain("readonly");
  });

  it("renders view mode as read-only", () => {
    const html = renderWorkflowWebHtml({ locator, mode: "view", token: "token-1" });

    expect(html).toContain("readonly");
    expect(html).toContain("disabled");
  });
});
