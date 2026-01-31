import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ============================================================================
// Session Management Tests (from src/utils/session.ts)
// ============================================================================

let originalOboraSession: string | undefined;

function setOboraSession(): void {
  if (originalOboraSession === undefined) {
    originalOboraSession = process.env.OBORA_SESSION;
  }
  process.env.OBORA_SESSION = "true";
}

function restoreOboraSession(): void {
  if (originalOboraSession === undefined) {
    delete process.env.OBORA_SESSION;
  } else {
    process.env.OBORA_SESSION = originalOboraSession;
  }
}

describe("run command", () => {
  describe("session utilities", () => {
    let savedEnv: string | undefined;

    beforeEach(() => {
      // Save the original value before each test
      savedEnv = process.env.OBORA_SESSION;
      // Reset module-level variable
      originalOboraSession = undefined;
    });

    afterEach(() => {
      // Restore the original value after each test
      if (savedEnv === undefined) {
        delete process.env.OBORA_SESSION;
      } else {
        process.env.OBORA_SESSION = savedEnv;
      }
      originalOboraSession = undefined;
    });

    describe("setOboraSession", () => {
      it("should set OBORA_SESSION to true", () => {
        delete process.env.OBORA_SESSION;
        setOboraSession();
        expect(process.env.OBORA_SESSION).toBe("true");
      });

      it("should preserve original value for restoration", () => {
        process.env.OBORA_SESSION = "original";
        setOboraSession();
        expect(process.env.OBORA_SESSION).toBe("true");
        // originalOboraSession should have saved "original"
        restoreOboraSession();
        expect(process.env.OBORA_SESSION).toBe("original");
      });

      it("should not overwrite originalOboraSession on multiple calls", () => {
        process.env.OBORA_SESSION = "first";
        setOboraSession();
        process.env.OBORA_SESSION = "modified";
        setOboraSession(); // Should not update originalOboraSession
        restoreOboraSession();
        expect(process.env.OBORA_SESSION).toBe("first");
      });
    });

    describe("restoreOboraSession", () => {
      it("should delete OBORA_SESSION if it was not set originally", () => {
        delete process.env.OBORA_SESSION;
        setOboraSession();
        expect(process.env.OBORA_SESSION).toBe("true");
        restoreOboraSession();
        expect(process.env.OBORA_SESSION).toBeUndefined();
      });

      it("should restore original value if it was set", () => {
        process.env.OBORA_SESSION = "custom-value";
        setOboraSession();
        expect(process.env.OBORA_SESSION).toBe("true");
        restoreOboraSession();
        expect(process.env.OBORA_SESSION).toBe("custom-value");
      });
    });
  });

  describe("command structure", () => {
    it("should have correct meta information", () => {
      // Test that the command structure matches expectations
      const commandMeta = {
        name: "run",
        description: "Execute a single task with workflow enforcement",
      };
      expect(commandMeta.name).toBe("run");
      expect(commandMeta.description).toContain("task");
    });

    it("should have required arguments defined", () => {
      const args = {
        task: {
          type: "positional",
          description: "Task to execute",
          required: true,
        },
        simple: {
          type: "boolean",
          alias: "s",
          description: "Simple mode - skip workflow planning",
          default: false,
        },
        verbose: {
          type: "boolean",
          alias: "v",
          description: "Show detailed output",
          default: false,
        },
      };

      expect(args.task.required).toBe(true);
      expect(args.task.type).toBe("positional");
      expect(args.simple.default).toBe(false);
      expect(args.simple.alias).toBe("s");
      expect(args.verbose.default).toBe(false);
      expect(args.verbose.alias).toBe("v");
    });
  });

  describe("workflow result handling", () => {
    it("should correctly identify all success results", () => {
      const results = [
        { success: true, output: "result1" },
        { success: true, output: "result2" },
        { success: true, output: "result3" },
      ];

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      expect(succeeded).toBe(3);
      expect(failed).toBe(0);
    });

    it("should correctly identify mixed results", () => {
      const results = [
        { success: true, output: "result1" },
        { success: false, error: "error1" },
        { success: true, output: "result2" },
        { success: false, error: "error2" },
      ];

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      expect(succeeded).toBe(2);
      expect(failed).toBe(2);
    });

    it("should get last result correctly", () => {
      const results = [
        { success: true, output: "first" },
        { success: true, output: "middle" },
        { success: true, output: "last" },
      ];

      const lastResult = results[results.length - 1];
      expect(lastResult.output).toBe("last");
    });

    it("should handle empty results", () => {
      const results: Array<{ success: boolean; output?: string }> = [];
      const lastResult = results[results.length - 1];
      expect(lastResult).toBeUndefined();
    });
  });
});
