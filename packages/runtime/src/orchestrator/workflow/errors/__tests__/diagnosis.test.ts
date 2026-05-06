import { describe, expect, it } from "vitest";

import { formatDiagnosis, getAllDiagnoses, getDiagnosis } from "../diagnosis";

describe("workflow error diagnosis helpers", () => {
  it("returns registered templates by error code", () => {
    expect(getDiagnosis("E4001")).toMatchObject({
      code: "E4001",
      title: "Agent execution failed",
    });
    expect(getDiagnosis("missing")).toBeUndefined();
  });

  it("formats a diagnosis as a CLI-friendly block", () => {
    const diagnosis = getDiagnosis("E4003");

    if (!diagnosis) {
      throw new Error("E4003 diagnosis must be registered");
    }

    const formatted = formatDiagnosis(diagnosis);

    expect(formatted).toContain("Diagnosis for E4003");
    expect(formatted).toContain("Agent resolution failed");
    expect(formatted).toContain("$ obora validate");
    expect(formatted).toContain("Rollback");
  });

  it("lists every registered diagnosis template", () => {
    const diagnoses = getAllDiagnoses();

    expect(diagnoses.map((diagnosis) => diagnosis.code)).toEqual([
      "E4001",
      "E4002",
      "E4003",
      "E4004",
      "E4005",
      "E4006",
      "E4007",
      "E6003",
    ]);
  });
});
