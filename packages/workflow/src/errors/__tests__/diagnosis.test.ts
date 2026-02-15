import { describe, it, expect } from "vitest";

import { getDiagnosis, formatDiagnosis, getAllDiagnoses } from "../diagnosis.js";

describe("diagnosis templates", () => {
  describe("getDiagnosis", () => {
    it("should return template for E4004", () => {
      const diag = getDiagnosis("E4004");
      expect(diag).toBeDefined();
      expect(diag!.code).toBe("E4004");
      expect(diag!.hypothesis).toContain("lock");
    });

    it("should return template for E4005", () => {
      const diag = getDiagnosis("E4005");
      expect(diag).toBeDefined();
      expect(diag!.code).toBe("E4005");
      expect(diag!.commands.length).toBeGreaterThan(0);
    });

    it("should return template for E4006", () => {
      const diag = getDiagnosis("E4006");
      expect(diag).toBeDefined();
      expect(diag!.code).toBe("E4006");
      expect(diag!.hypothesis).toContain("spec");
    });

    it("should return template for E6003", () => {
      const diag = getDiagnosis("E6003");
      expect(diag).toBeDefined();
      expect(diag!.code).toBe("E6003");
      expect(diag!.hypothesis).toContain("OpenClaw");
    });

    it("should return undefined for unknown code", () => {
      expect(getDiagnosis("E9999")).toBeUndefined();
    });
  });

  describe("formatDiagnosis", () => {
    it("should format template with all 4 elements", () => {
      const diag = getDiagnosis("E4004")!;
      const output = formatDiagnosis(diag);

      expect(output).toContain("Hypothesis");
      expect(output).toContain("Evidence");
      expect(output).toContain("Fix");
      expect(output).toContain("Rollback");
      expect(output).toContain("E4004");
    });

    it("should include command lines with $ prefix", () => {
      const diag = getDiagnosis("E6003")!;
      const output = formatDiagnosis(diag);
      expect(output).toContain("$ openclaw gateway");
    });
  });

  describe("getAllDiagnoses", () => {
    it("should return all templates", () => {
      const all = getAllDiagnoses();
      expect(all.length).toBe(8);
      const codes = all.map((d) => d.code);
      expect(codes).toContain("E4001");
      expect(codes).toContain("E4002");
      expect(codes).toContain("E4003");
      expect(codes).toContain("E4004");
      expect(codes).toContain("E4005");
      expect(codes).toContain("E4006");
      expect(codes).toContain("E4007");
      expect(codes).toContain("E6003");
    });
  });
});
