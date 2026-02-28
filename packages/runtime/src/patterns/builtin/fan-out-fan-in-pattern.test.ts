import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { FanOutFanInPattern } from "./FanOutFanInPattern.js";

describe("FanOutFanInPattern", () => {
  it("runs fan-out and merges results with concatenate by default", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      input: {
        task: "summarize",
        responses: {
          a: "A-result",
          b: "B-result",
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      merged: ["A-result", "B-result"],
      merge_strategy: "concatenate",
      participant_results: {
        a: { success: true, output: "A-result" },
        b: { success: true, output: "B-result" },
      },
    });
    expect(result.metadata?.blackboard_domains).toEqual(["actor-pool", "knowledge"]);
  });

  it("supports rank merge strategy", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
        c: "agent-c",
      },
      config: {
        merge: "rank",
      },
      input: {
        responses: {
          a: { value: "mid", score: 0.6 },
          b: { value: "top", score: 0.9 },
          c: { value: "low", score: 0.2 },
        },
      },
    });

    const merged = (result.output as { merged: Array<{ value: string }> }).merged;
    expect(merged.map((item) => item.value)).toEqual(["top", "mid", "low"]);
  });

  it("supports vote merge strategy", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
        c: "agent-c",
      },
      config: {
        merge: "vote",
      },
      input: {
        responses: {
          a: "approve",
          b: "reject",
          c: "approve",
        },
      },
    });

    expect(result.success).toBe(true);
    expect((result.output as { merged: unknown }).merged).toBe("approve");
  });

  it("vote merge tie-breaker: first-seen value wins on equal count", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
        c: "agent-c",
        d: "agent-d",
      },
      config: { merge: "vote" },
      input: {
        responses: {
          a: "alpha",
          b: "beta",
          c: "beta",
          d: "alpha",
        },
      },
    });

    // alpha and beta both have count=2; alpha appeared first (index 0) so wins
    expect(result.success).toBe(true);
    expect((result.output as { merged: unknown }).merged).toBe("alpha");
  });

  it("uses custom merge function when strategy is custom", async () => {
    const pattern = new FanOutFanInPattern();
    const customMerge = vi.fn((outputs: unknown[]) => ({
      count: outputs.length,
      outputs,
    }));

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      config: {
        merge: "custom",
      },
      input: {
        responses: {
          a: "x",
          b: "y",
        },
      },
      fanOutFanInMergeFn: customMerge,
    } as never);

    expect(customMerge).toHaveBeenCalledTimes(1);
    expect((result.output as { merged: unknown }).merged).toEqual({
      count: 2,
      outputs: ["x", "y"],
    });
  });

  it("custom merge fallback: concatenates when no merge fn provided", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: { a: "agent-a", b: "agent-b" },
      config: { merge: "custom" },
      input: { responses: { a: 1, b: 2 } },
    });

    // Falls back to concatenate; merge_strategy in output still says "custom" via the overall output
    expect(result.success).toBe(true);
    expect((result.output as { merged: unknown }).merged).toEqual([1, 2]);
  });

  it("handles partial failure and still succeeds when at least one participant responds", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      input: {
        responses: {
          a: "ok",
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      merged: ["ok"],
      participant_results: {
        a: { success: true, output: "ok" },
        b: { success: false },
      },
    });
    expect(result.metadata).toMatchObject({
      responded_participants: 1,
      missing_participants: 1,
    });
  });

  it("returns business failure when all participants fail", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
        b: "agent-b",
      },
      input: {
        task: "no responses",
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "all_participants_failed",
      error_codes: [OboraErrorCode.ORCH_DEPENDENCY_FAILED],
      merge_strategy: "concatenate",
    });
  });

  it("validates config", () => {
    const pattern = new FanOutFanInPattern();

    expect(() => pattern.validateConfig({ merge: "concatenate" })).not.toThrow();
    expect(() => pattern.validateConfig({ merge: "invalid" as never })).toThrow(
      "fan-out-fan-in.merge must be one of: concatenate, rank, vote, custom"
    );
  });

  it("throws when participants are empty", async () => {
    const pattern = new FanOutFanInPattern();

    await expect(
      pattern.execute({
        pattern: "fan-out-fan-in",
        participants: {},
      })
    ).rejects.toThrow("fan-out-fan-in pattern requires at least one participant");
  });

  it("emits fan-out/fan-in events", async () => {
    const pattern = new FanOutFanInPattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        a: "agent-a",
      },
      input: {
        responses: {
          a: "done",
        },
      },
      emit,
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual(["fanout_start", "fanout_participant_result", "fanin_merge"]);
  });

  it("works with single participant", async () => {
    const pattern = new FanOutFanInPattern();

    const result = await pattern.execute({
      pattern: "fan-out-fan-in",
      participants: {
        solo: "agent-a",
      },
      input: {
        responses: {
          solo: { score: 1, text: "only" },
        },
      },
      config: {
        merge: "rank",
      },
    });

    expect(result.success).toBe(true);
    expect((result.output as { merged: Array<{ text: string }> }).merged).toEqual([{ score: 1, text: "only" }]);
  });

  // --- failure_policy tests ---

  describe("failure_policy: best_effort (default)", () => {
    it("succeeds with partial failures when no failure_policy specified (backward compat)", async () => {
      const pattern = new FanOutFanInPattern();

      const result = await pattern.execute({
        pattern: "fan-out-fan-in",
        participants: { a: "a", b: "b", c: "c" },
        input: { responses: { a: "ok" } },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.responded_participants).toBe(1);
      expect(result.metadata?.missing_participants).toBe(2);
    });

    it("succeeds with partial failures when failure_policy is explicitly best_effort", async () => {
      const pattern = new FanOutFanInPattern();

      const result = await pattern.execute({
        pattern: "fan-out-fan-in",
        participants: { a: "a", b: "b", c: "c" },
        config: { failure_policy: "best_effort" },
        input: { responses: { a: "ok" } },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("failure_policy: required", () => {
    it("succeeds when all participants succeed (required, no min_success)", async () => {
      const pattern = new FanOutFanInPattern();

      const result = await pattern.execute({
        pattern: "fan-out-fan-in",
        participants: { a: "a", b: "b" },
        config: { failure_policy: "required" },
        input: { responses: { a: "ok", b: "ok" } },
      });

      expect(result.success).toBe(true);
    });

    it("fails when not all participants succeed (required, no min_success)", async () => {
      const pattern = new FanOutFanInPattern();

      const result = await pattern.execute({
        pattern: "fan-out-fan-in",
        participants: { a: "a", b: "b", c: "c" },
        config: { failure_policy: "required" },
        input: { responses: { a: "ok", b: "ok" } },
      });

      expect(result.success).toBe(false);
      expect(result.output).toMatchObject({
        reason: "min_success_not_met",
        failure_policy: "required",
        min_success: 3,
        actual_success: 2,
      });
    });

    it("succeeds at exact min_success boundary", async () => {
      const pattern = new FanOutFanInPattern();

      const result = await pattern.execute({
        pattern: "fan-out-fan-in",
        participants: { a: "a", b: "b", c: "c" },
        config: { failure_policy: "required", min_success: 2 },
        input: { responses: { a: "ok", b: "ok" } },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.responded_participants).toBe(2);
    });

    it("fails just below min_success boundary", async () => {
      const pattern = new FanOutFanInPattern();

      const result = await pattern.execute({
        pattern: "fan-out-fan-in",
        participants: { a: "a", b: "b", c: "c" },
        config: { failure_policy: "required", min_success: 2 },
        input: { responses: { a: "ok" } },
      });

      expect(result.success).toBe(false);
      expect(result.output).toMatchObject({
        reason: "min_success_not_met",
        min_success: 2,
        actual_success: 1,
      });
    });

    it("throws when min_success exceeds participant count", async () => {
      const pattern = new FanOutFanInPattern();

      await expect(
        pattern.execute({
          pattern: "fan-out-fan-in",
          participants: { a: "a", b: "b" },
          config: { failure_policy: "required", min_success: 5 },
          input: { responses: { a: "ok", b: "ok" } },
        })
      ).rejects.toThrow("fan-out-fan-in.min_success (5) exceeds participant count (2)");
    });
  });

  describe("failure_policy config validation", () => {
    it("rejects invalid failure_policy", () => {
      const pattern = new FanOutFanInPattern();
      expect(() => pattern.validateConfig({ failure_policy: "invalid" as never })).toThrow(
        "fan-out-fan-in.failure_policy must be one of: best_effort, required"
      );
    });

    it("rejects min_success < 1", () => {
      const pattern = new FanOutFanInPattern();
      expect(() => pattern.validateConfig({ min_success: 0 })).toThrow(
        "fan-out-fan-in.min_success must be an integer >= 1"
      );
    });

    it("rejects non-integer min_success", () => {
      const pattern = new FanOutFanInPattern();
      expect(() => pattern.validateConfig({ min_success: 1.5 })).toThrow(
        "fan-out-fan-in.min_success must be an integer >= 1"
      );
    });

    it("accepts valid failure_policy + min_success", () => {
      const pattern = new FanOutFanInPattern();
      expect(() => pattern.validateConfig({ failure_policy: "required", min_success: 2 })).not.toThrow();
      expect(() => pattern.validateConfig({ failure_policy: "best_effort" })).not.toThrow();
      expect(() => pattern.validateConfig({})).not.toThrow();
    });
  });
});
