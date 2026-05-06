import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { SupervisorPattern } from "./SupervisorPattern.js";

describe("SupervisorPattern", () => {
  it("succeeds when all workers complete successfully", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
        workerB: "agent-b",
      },
      input: {
        results: {
          workerA: { success: true, output: "A ok" },
          workerB: { success: true, output: "B ok" },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      strategy: "one_for_one",
      total_restarts: 0,
      workers: {
        workerA: { status: "completed", restarts: 0, output: "A ok" },
        workerB: { status: "completed", restarts: 0, output: "B ok" },
      },
    });
  });

  it("restarts only failed worker with one_for_one and succeeds", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
        workerB: "agent-b",
      },
      config: {
        strategy: "one_for_one",
        max_restarts: 2,
      },
      input: {
        results: {
          workerA: { success: false, error: "boom" },
          workerB: { success: true, output: "stable" },
        },
        tasks: {
          workerA: {
            attempts: [{ success: true, output: "recovered" }],
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      strategy: "one_for_one",
      total_restarts: 1,
      workers: {
        workerA: { status: "completed", restarts: 1, output: "recovered" },
        workerB: { status: "completed", restarts: 0, output: "stable" },
      },
    });
  });

  it("restarts all workers with one_for_all when one worker fails", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
        workerB: "agent-b",
      },
      config: {
        strategy: "one_for_all",
        max_restarts: 2,
      },
      input: {
        results: {
          workerA: { success: false, error: "fail A" },
          workerB: { success: true, output: "old B" },
        },
        tasks: {
          workerA: {
            attempts: [{ success: true, output: "new A" }],
          },
          workerB: {
            attempts: [{ success: true, output: "new B" }],
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      strategy: "one_for_all",
      total_restarts: 1,
      workers: {
        workerA: { status: "completed", restarts: 1, output: "new A" },
        workerB: { status: "completed", restarts: 1, output: "new B" },
      },
    });
  });

  it("returns business failure when max_restarts is exceeded", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
      },
      config: {
        max_restarts: 1,
      },
      input: {
        results: {
          workerA: { success: false, error: "initial fail" },
        },
        tasks: {
          workerA: {
            attempts: [{ success: false, error: "retry fail" }],
          },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "max_restarts_exceeded",
      error_codes: [OboraErrorCode.RECOVERY_RETRY_EXHAUSTED],
      strategy: "one_for_one",
      total_restarts: 1,
      workers: {
        workerA: { status: "failed", restarts: 1 },
      },
    });
  });

  it("tracks linear and exponential backoff metadata", async () => {
    const pattern = new SupervisorPattern();

    const linear = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
      },
      config: {
        max_restarts: 3,
        backoff: "linear",
      },
      input: {
        results: {
          workerA: { success: false },
        },
        tasks: {
          workerA: {
            attempts: [{ success: false }, { success: false }, { success: true }],
          },
        },
      },
    });

    const exponential = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
      },
      config: {
        max_restarts: 3,
        backoff: "exponential",
      },
      input: {
        results: {
          workerA: { success: false },
        },
        tasks: {
          workerA: {
            attempts: [{ success: false }, { success: false }, { success: true }],
          },
        },
      },
    });

    expect(linear.metadata).toMatchObject({
      backoff: "linear",
      backoff_schedule: {
        workerA: [1, 2, 3],
      },
    });

    expect(exponential.metadata).toMatchObject({
      backoff: "exponential",
      backoff_schedule: {
        workerA: [1, 2, 4],
      },
    });
  });

  it("validates config", () => {
    const pattern = new SupervisorPattern();

    expect(() => pattern.validateConfig({ strategy: "one_for_one", max_restarts: 0 })).not.toThrow();
    expect(() => pattern.validateConfig({ strategy: "invalid" as never })).toThrow(
      "supervisor.strategy must be one of: one_for_one | one_for_all"
    );
    expect(() => pattern.validateConfig({ max_restarts: -1 })).toThrow(
      "supervisor.max_restarts must be an integer >= 0"
    );
    expect(() => pattern.validateConfig({ backoff: "invalid" as never })).toThrow(
      "supervisor.backoff must be one of: linear | exponential"
    );
  });

  it("throws when participants are empty", async () => {
    const pattern = new SupervisorPattern();

    await expect(
      pattern.execute({
        pattern: "supervisor",
        participants: {},
      })
    ).rejects.toThrow("supervisor pattern requires at least one participant");
  });

  it("emits supervisor and worker events", async () => {
    const pattern = new SupervisorPattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
      },
      input: {
        results: {
          workerA: { success: false },
        },
        tasks: {
          workerA: {
            attempts: [{ success: true, output: "ok" }],
          },
        },
      },
      emit,
    });

    const eventTypes = emit.mock.calls.map((call) => call[0].type);
    expect(eventTypes).toContain("supervisor_start");
    expect(eventTypes).toContain("worker_result");
    expect(eventTypes).toContain("worker_restart");
  });

  it("defaults config and input when no structured payload is provided", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
        workerB: "agent-b",
      },
      input: "not-an-object",
    } as never);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      strategy: "one_for_one",
      total_restarts: 0,
      workers: {
        workerA: { status: "completed", restarts: 0 },
        workerB: { status: "completed", restarts: 0 },
      },
    });
  });

  it("filters invalid attempts and normalizes non-string errors", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a" },
      config: { max_restarts: 2 },
      input: {
        results: {
          workerA: { success: false, error: 404 },
        },
        tasks: {
          workerA: {
            attempts: [null, "bad", { success: true, output: "recovered", error: 500 }],
          },
        },
      },
    } as never);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      total_restarts: 1,
      workers: {
        workerA: { status: "completed", restarts: 1, output: "recovered" },
      },
    });
  });

  it("falls back from malformed result entries to queued attempts", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a" },
      input: {
        results: {
          workerA: "not-a-result",
        },
        tasks: {
          workerA: {
            attempts: [{ success: false, error: "first queued" }, { success: true, output: "queued ok" }],
          },
        },
      },
    } as never);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      total_restarts: 1,
      workers: {
        workerA: { status: "completed", restarts: 1, output: "queued ok" },
      },
    });
  });

  it("handles multiple failures across different workers", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: {
        workerA: "agent-a",
        workerB: "agent-b",
      },
      config: {
        strategy: "one_for_one",
        max_restarts: 3,
      },
      input: {
        results: {
          workerA: { success: false },
          workerB: { success: false },
        },
        tasks: {
          workerA: {
            attempts: [{ success: false }, { success: true, output: "A done" }],
          },
          workerB: {
            attempts: [{ success: true, output: "B done" }],
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      total_restarts: 3,
      workers: {
        workerA: { status: "completed", restarts: 2, output: "A done" },
        workerB: { status: "completed", restarts: 1, output: "B done" },
      },
    });
  });

  // --- Regression tests for P2 observations ---

  it("maxRestarts=0 immediately fails without any restart (one_for_one)", async () => {
    const pattern = new SupervisorPattern();
    const emit = vi.fn();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a" },
      config: { strategy: "one_for_one", max_restarts: 0 },
      input: {
        results: { workerA: { success: false, error: "boom" } },
        tasks: { workerA: { attempts: [{ success: true, output: "never reached" }] } },
      },
      emit,
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "max_restarts_exceeded",
      total_restarts: 0,
      workers: { workerA: { status: "failed", restarts: 0 } },
    });
    // No worker_restart events should have been emitted
    const restartEvents = emit.mock.calls.filter((c) => c[0].type === "worker_restart");
    expect(restartEvents).toHaveLength(0);
  });

  it("maxRestarts=0 immediately fails without any restart (one_for_all)", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a", workerB: "agent-b" },
      config: { strategy: "one_for_all", max_restarts: 0 },
      input: {
        results: {
          workerA: { success: false, error: "fail" },
          workerB: { success: true, output: "ok" },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "max_restarts_exceeded",
      total_restarts: 0,
      strategy: "one_for_all",
    });
  });

  it("maxRestarts=1 boundary: allows exactly 1 restart then fails on next failure (one_for_one)", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a" },
      config: { strategy: "one_for_one", max_restarts: 1 },
      input: {
        results: { workerA: { success: false } },
        tasks: { workerA: { attempts: [{ success: false, error: "still bad" }] } },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      total_restarts: 1,
      workers: { workerA: { restarts: 1, status: "failed" } },
    });
  });


  it("maxRestarts=1 boundary: allows exactly 1 restart then fails on next failure (one_for_all)", async () => {
    const pattern = new SupervisorPattern();

    const result = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a", workerB: "agent-b" },
      config: { strategy: "one_for_all", max_restarts: 1 },
      input: {
        results: {
          workerA: { success: false, error: "boom" },
          workerB: { success: true, output: "old" },
        },
        tasks: {
          workerA: { attempts: [{ success: false, error: "still bad" }] },
          workerB: { attempts: [{ success: true, output: "new" }] },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      reason: "max_restarts_exceeded",
      strategy: "one_for_all",
      total_restarts: 1,
      workers: {
        workerA: { restarts: 1, status: "failed" },
        workerB: { restarts: 1, status: "completed" },
      },
    });
  });

  it("metadata includes audit_emit_only flag", async () => {
    const pattern = new SupervisorPattern();

    const success = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a" },
      input: { results: { workerA: { success: true, output: "ok" } } },
    });
    expect(success.metadata).toHaveProperty("audit_emit_only", true);

    const failure = await pattern.execute({
      pattern: "supervisor",
      participants: { workerA: "agent-a" },
      config: { max_restarts: 0 },
      input: { results: { workerA: { success: false } } },
    });
    expect(failure.metadata).toHaveProperty("audit_emit_only", true);
  });

  it("all workers succeed on first try returns total_restarts=0 with no restart events", async () => {
    const pattern = new SupervisorPattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "supervisor",
      participants: { a: "a1", b: "b1" },
      config: { strategy: "one_for_all" },
      input: {
        results: { a: { success: true }, b: { success: true } },
      },
      emit,
    });

    const restartEvents = emit.mock.calls.filter((c) => c[0].type === "worker_restart");
    expect(restartEvents).toHaveLength(0);
  });

});
