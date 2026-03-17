import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL(
    "../../../../sandbox/18-longrun-paper-verification-mini/workflows/00-longrun-paper-verification-mini.yaml",
    import.meta.url
  )
);

describe("canonical sandbox 18 longrun-paper-verification-mini", () => {
  it("preserves the paper verification workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-paper-verification-mini");
    expect(workflow.steps).toHaveLength(2);

    expect(workflow.steps[0]).toMatchObject({
      name: "verify-paper-claims",
      agent: "verifier",
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "archive-paper-verification",
      agent: "archivist",
      depends_on: ["verify-paper-claims"],
    });

    const verifyTask = String(workflow.steps[0]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[1]?.input?.task ?? "");

    expect(verifyTask).toContain("Use only the provided vendored fixture.");
    expect(verifyTask).toContain("Verify exactly the four listed claims.");
    expect(verifyTask).toContain("Paper Metadata");
    expect(verifyTask).toContain("Verification Summary");
    expect(verifyTask).toContain("Claim-by-Claim Assessment");
    expect(verifyTask).toContain("Evidence Notes");
    expect(verifyTask).toContain("Final Verdict");
    expect(verifyTask).toContain("SUPPORTED, PARTIAL, UNSUPPORTED");
    expect(verifyTask).toContain("Excerpt A");

    expect(archiveTask).toContain("Summary of Verification");
    expect(archiveTask).toContain("Paper Verification Result");
    expect(archiveTask).toContain("Reuse Notes");
    expect(archiveTask).toContain("not full result reproduction");
  });
});
