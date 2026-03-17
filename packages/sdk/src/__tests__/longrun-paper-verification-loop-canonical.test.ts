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
  it("preserves the runtime-native paper verification remediation workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-paper-verification-loop");
    expect(workflow.steps).toHaveLength(3);

    expect(workflow.steps[0]).toMatchObject({
      name: "verify_or_repair",
      agent: "verifier",
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "validate_paper_verification",
      agent: "validator",
      depends_on: ["verify_or_repair"],
      on_fail: { goto: "verify_or_repair", max_iterations: 1 },
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "archive-paper-verification",
      agent: "archivist",
      depends_on: ["validate_paper_verification"],
    });

    const initialTask = String(workflow.steps[0]?.input?.task ?? "");
    const validationTask = String(workflow.steps[1]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[2]?.input?.task ?? "");

    expect(initialTask).toContain("Use only the provided vendored fixture.");
    expect(initialTask).toContain("Claim 3");
    expect(initialTask).toContain("intentionally leave the evidence mapping incomplete");
    expect(initialTask).toContain("Use the injected repair context");

    expect(validationTask).toContain(
      "Failed Checks must explicitly identify the remaining claim gaps"
    );
    expect(validationTask).toContain('"signature": "stable-signature"');

    expect(archiveTask).toContain("Summary of Verification Loop");
    expect(archiveTask).toContain("Final Paper Verification Result");
    expect(archiveTask).toContain(
      "runtime-native verify_or_repair <-> validate_paper_verification loop"
    );
  });
});
