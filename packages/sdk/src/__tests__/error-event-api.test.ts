import { describe, expect, it, vi } from "vitest";

import { OboraError, OboraErrorCode, OboraRuntime } from "../runtime.js";

describe("M3-04 Error/Event API alignment", () => {
  it('supports expanded on("step_start") event type', async () => {
    const runtime = new OboraRuntime();
    const handler = vi.fn();

    runtime.on("step_start", handler);
    await (runtime as any).emitEvent("step_start", "exec-1", { stepName: "draft" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe("step_start");
  });

  it('supports policy catalog events like on("policy_deny")', async () => {
    const runtime = new OboraRuntime();
    const handler = vi.fn();

    runtime.on("policy_deny", handler);
    await (runtime as any).emitEvent("policy_deny", "exec-2", { reason: "blocked" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe("policy_deny");
  });

  it("supports events() async iterator with filtering", async () => {
    const runtime = new OboraRuntime();
    const stream = runtime.events({ executionId: "exec-3", type: ["policy_deny", "step_start"] });
    const iterator = stream[Symbol.asyncIterator]();

    await (runtime as any).emitEvent("step_start", "other", { ignore: true });
    await (runtime as any).emitEvent("execution_start", "exec-3", { ignore: true });
    await (runtime as any).emitEvent("step_start", "exec-3", { step: 1 });

    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value?.type).toBe("step_start");
    expect(first.value?.executionId).toBe("exec-3");

    await (runtime as any).emitEvent("policy_deny", "exec-3", { reason: "deny" });
    const second = await iterator.next();
    expect(second.done).toBe(false);
    expect(second.value?.type).toBe("policy_deny");

    const closed = await iterator.return?.();
    expect(closed?.done).toBe(true);
  });

  it("keeps OboraError code as string and supports runtime constants", () => {
    const runtimeCodeError = new OboraError("policy load failed", OboraErrorCode.POLICY_LOAD_FAILED);
    const sdkCodeError = new OboraError("sdk custom", "SDK_CUSTOM");

    expect(typeof runtimeCodeError.code).toBe("string");
    expect(runtimeCodeError.code).toBe(OboraErrorCode.POLICY_LOAD_FAILED);
    expect(sdkCodeError.code).toBe("SDK_CUSTOM");
  });

  it("preserves event metadata payload", async () => {
    const sink = vi.fn();
    const runtime = new OboraRuntime({ audit: { enabled: true, sink } });

    await (runtime as any).emitEvent(
      "llm_response",
      "exec-4",
      { text: "ok" },
      { model: "gpt-5", tokens: 123, durationMs: 45, costUsd: 0.001 },
    );

    expect(sink).toHaveBeenCalledTimes(1);
    const event = sink.mock.calls[0][0];
    expect(event.metadata).toEqual({
      model: "gpt-5",
      tokens: 123,
      durationMs: 45,
      costUsd: 0.001,
    });
  });
});
