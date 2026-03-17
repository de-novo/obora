import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL(
    "../../../../sandbox/19-longrun-paper-verification-loop/workflows/00-longrun-paper-verification-loop.yaml",
    import.meta.url
  )
);

describe("canonical sandbox 19 longrun-paper-verification-loop", () => {
  it("preserves the paper verification remediation workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-paper-verification-loop");
    expect(workflow.steps).toHaveLength(5);

    expect(workflow.steps[0]).toMatchObject({
      name: "verify-paper-claims-initial",
      agent: "verifier",
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "validate-paper-verification",
      agent: "validator",
      depends_on: ["verify-paper-claims-initial"],
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "repair-paper-verification",
      agent: "repairer",
      depends_on: ["validate-paper-verification"],
    });
    expect(workflow.steps[3]).toMatchObject({
      name: "validate-repaired-paper-verification",
      agent: "validator",
      depends_on: ["repair-paper-verification"],
    });
    expect(workflow.steps[4]).toMatchObject({
      name: "archive-paper-verification",
      agent: "archivist",
      depends_on: ["validate-repaired-paper-verification"],
    });

    const initialTask = String(workflow.steps[0]?.input?.task ?? "");
    const validationTask = String(workflow.steps[1]?.input?.task ?? "");
    const repairTask = String(workflow.steps[2]?.input?.task ?? "");
    const finalValidationTask = String(workflow.steps[3]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[4]?.input?.task ?? "");

    expect(initialTask).toContain("Use only the provided vendored fixture.");
    expect(initialTask).toContain("Claim 3");
    expect(initialTask).toContain("intentionally leave the evidence mapping incomplete");
    expect(initialTask).toContain("Evidence Notes");
    expect(initialTask).toContain("not yet sufficient for acceptance");

    expect(validationTask).toContain("Verdict must clearly say FAIL.");
    expect(validationTask).toContain("Claim 3");
    expect(validationTask).toContain("same vendored fixture only");

    expect(repairTask).toContain("Every claim entry must include concrete excerpt IDs.");
    expect(repairTask).toContain("Claim 3 explicit evidence mapping");
    expect(repairTask).toContain("now sufficient for acceptance");

    expect(finalValidationTask).toContain("Verdict must clearly say PASS.");
    expect(finalValidationTask).toContain("verification loop is complete and can be archived");

    expect(archiveTask).toContain("Summary of Verification Loop");
    expect(archiveTask).toContain("Final Paper Verification Result");
    expect(archiveTask).toContain("Claim 3 evidence remediation");
  });
});
