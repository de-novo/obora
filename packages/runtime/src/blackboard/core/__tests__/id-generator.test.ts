import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultIdGenerator, SequentialIdGenerator } from "../id-generator";

describe("id-generator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates deterministic independent sequences per id namespace", () => {
    const generator = new SequentialIdGenerator();

    expect(generator.generateAgentId()).toBe("agent-0000");
    expect(generator.generateAgentId()).toBe("agent-0001");
    expect(generator.generateTaskId()).toBe("task-0000");
    expect(generator.generateAgendaId()).toBe("agenda-0000");
    expect(generator.generateSessionId()).toBe("session-0000");
    expect(generator.generateGenericId("run")).toBe("run-0000");
    expect(generator.generateGenericId("run")).toBe("run-0001");
  });

  it("can reset either a single prefix or the full sequence state", () => {
    const generator = new SequentialIdGenerator();

    generator.generateAgentId();
    generator.generateGenericId("artifact");
    generator.generateGenericId("artifact");

    generator.resetPrefix("artifact");
    expect(generator.generateGenericId("artifact")).toBe("artifact-0000");
    expect(generator.generateAgentId()).toBe("agent-0001");

    generator.reset();
    expect(generator.generateAgentId()).toBe("agent-0000");
    expect(generator.generateGenericId()).toBe("id-0000");
  });

  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
    });

    const generator = new DefaultIdGenerator();

    expect(generator.generateAgentId()).toBe("agent-00000000-0000-4000-8000-000000000001");
    expect(generator.generateTaskId()).toBe("task-00000000-0000-4000-8000-000000000001");
    expect(generator.generateAgendaId()).toBe("agenda-00000000-0000-4000-8000-000000000001");
    expect(generator.generateSessionId()).toBe("session-00000000-0000-4000-8000-000000000001");
    expect(generator.generateGenericId("custom")).toBe("custom-00000000-0000-4000-8000-000000000001");
  });

  it("falls back to getRandomValues while preserving uuid v4 formatting", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((array: Uint8Array) => {
        array.fill(0);
        return array;
      }),
    });

    expect(new DefaultIdGenerator().generateGenericId("fallback")).toBe(
      "fallback-00000000-0000-4000-8000-000000000000",
    );
  });
});
