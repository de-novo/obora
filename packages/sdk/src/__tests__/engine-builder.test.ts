import { describe, expect, it, vi, beforeEach } from "vitest";
import { EngineBuilder } from "../execution/engine-builder.js";
import type { EventBus } from "../events/event-bus.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import type { OboraRuntimeConfig, LLMConfig, AgentFactory } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";
import type { LLMAdapterLike } from "../step-executor.js";

vi.mock("../config-loader.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    defaults: { provider: "openai", model: "gpt-4" },
    resources: { models: [{ model: "gpt-4", promptPer1kTokens: 0.01, completionPer1kTokens: 0.03 }] },
  }),
  resolveProviderConfig: vi.fn().mockReturnValue({
    provider: "openai",
    model: "gpt-4",
    apiKey: "test-key",
  }),
}));

vi.mock("../llm-config.js", () => ({
  resolveLLMConfig: vi.fn().mockReturnValue({
    provider: "openai",
    model: "gpt-4",
    apiKey: "test-key",
  }),
}));

vi.mock("../resolution-summary.js", () => ({
  buildResolutionSummary: vi.fn().mockReturnValue({}),
  buildBindingPreview: vi.fn().mockReturnValue({}),
  buildOutputPreview: vi.fn().mockReturnValue({}),
  formatResolutionSummary: vi.fn().mockReturnValue(""),
  formatBindingPreview: vi.fn().mockReturnValue(""),
  formatOutputPreview: vi.fn().mockReturnValue(""),
}));

vi.mock("../agents/source-loaders.js", () => ({
  loadAgentsFromYamlFile: vi.fn().mockResolvedValue(new Map()),
  loadWorkflowAgents: vi.fn().mockReturnValue(new Map()),
}));

describe("EngineBuilder", () => {
  beforeEach(async () => {
    const { resolveProviderConfig } = await import("../config-loader.js");
    (resolveProviderConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      provider: "openai",
      model: "gpt-4",
      apiKey: "test-key",
    });
  });

  const createMockEventBus = (): EventBus =>
    ({
      emit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnValue(() => {}),
    }) as unknown as EventBus;

  const createMockPersistenceManager = (): PersistenceManager =>
    ({
      getCostTrackingAdapter: vi.fn().mockResolvedValue({
        recordCost: vi.fn().mockResolvedValue(undefined),
      }),
      getStorageAdapter: vi.fn().mockResolvedValue({
        saveRun: vi.fn().mockResolvedValue(undefined),
      }),
    }) as unknown as PersistenceManager;

  const createMockAdapterFactory = () =>
    vi.fn().mockResolvedValue({
      chatCompletion: vi.fn().mockResolvedValue({ message: { role: "assistant", content: "hi" } }),
    } as unknown as LLMAdapterLike);

  const createBaseConfig = (): OboraRuntimeConfig => ({
    configPath: "./obora.yaml",
    verbose: false,
  });

  it("builds engine with step executor when LLM config is resolved", async () => {
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents: new Map(),
    });

    const engine = await builder.build("exec-1", false, undefined);

    expect(engine.stepExecutor).toBeDefined();
    expect(engine.costTracker).toBeDefined();
    expect(engine.llmConfig).toBeDefined();
    expect(engine.llmConfig?.provider).toBe("openai");
    expect(engine.llmConfig?.model).toBe("gpt-4");
  });

  it("builds engine without step executor when LLM config is missing", async () => {
    const { resolveLLMConfig } = await import("../llm-config.js");
    (resolveLLMConfig as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);

    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents: new Map(),
    });

    const engine = await builder.build("exec-2", false, undefined);

    expect(engine.stepExecutor).toBeUndefined();
    expect(engine.llmConfig).toBeUndefined();
    expect(eventBus.emit).toHaveBeenCalledWith(
      "warning",
      "exec-2",
      expect.objectContaining({ code: expect.any(String) })
    );
  });

  it("does not create cost tracker when resources config is absent", async () => {
    const { loadConfig } = await import("../config-loader.js");
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      defaults: { provider: "openai", model: "gpt-4" },
      // no resources section
    });

    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents: new Map(),
    });

    const engine = await builder.build("exec-3", false, undefined);

    expect(engine.stepExecutor).toBeDefined();
    expect(engine.costTracker).toBeUndefined();
  });

  it("emits startup info to logger when available", async () => {
    const info = vi.fn();
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();

    const builder = new EngineBuilder({
      config: { ...createBaseConfig(), logger: { info } },
      eventBus,
      adapterFactory,
      persistenceManager,
      agents: new Map(),
    });

    await builder.build("exec-5", false, undefined);

    expect(info).toHaveBeenCalled();
  });

  it("resolves agent LLM from agent info when factory returns object with api_key", async () => {
    const { resolveProviderConfig } = await import("../config-loader.js");
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();
    const agents = new Map<string, AgentFactory>([
      [
        "custom-agent",
        () =>
          ({
            provider: "openai",
            model: "gpt-4o",
            temperature: 0.5,
            api_key: "agent-key",
          }) as unknown as ReturnType<AgentFactory>,
      ],
    ]);

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents,
    });

    const engine = await builder.build("exec-6", false, undefined);
    expect(engine.stepExecutor).toBeDefined();

    const resolveAgent = (engine.stepExecutor as unknown as { config?: { resolveAgentLLM?: (name: string) => Promise<unknown> } })?.config?.resolveAgentLLM;
    expect(resolveAgent).toBeDefined();
    if (resolveAgent) {
      await resolveAgent("custom-agent");
    }
    expect(resolveProviderConfig).toHaveBeenCalled();
  });

  it("resolves agent LLM from config agent when factory returns undefined", async () => {
    const { resolveProviderConfig } = await import("../config-loader.js");
    (resolveProviderConfig as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();
    const agents = new Map<string, AgentFactory>([
      ["missing-agent", () => undefined as unknown as ReturnType<AgentFactory>],
    ]);

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents,
    });

    const engine = await builder.build("exec-7", false, undefined);
    const resolveAgent = (engine.stepExecutor as unknown as { config?: { resolveAgentLLM?: (name: string) => Promise<unknown> } })?.config?.resolveAgentLLM;
    expect(resolveAgent).toBeDefined();
    if (resolveAgent) {
      const result = await resolveAgent("missing-agent");
      expect(result).toBeUndefined();
    }
  });

  it("resolves agent LLM from config agent when factory returns non-object", async () => {
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();
    const agents = new Map<string, AgentFactory>([
      ["string-agent", () => "not-an-object" as unknown as ReturnType<AgentFactory>],
    ]);

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents,
    });

    const engine = await builder.build("exec-8", false, undefined);
    const resolveAgent = (engine.stepExecutor as unknown as { config?: { resolveAgentLLM?: (name: string) => Promise<unknown> } })?.config?.resolveAgentLLM;
    expect(resolveAgent).toBeDefined();
    if (resolveAgent) {
      const result = await resolveAgent("string-agent");
      expect(result).toBeDefined();
    }
  });

  it("warns and returns undefined when provider config missing for agent", async () => {
    const { resolveProviderConfig } = await import("../config-loader.js");
    (resolveProviderConfig as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();
    const agents = new Map<string, AgentFactory>([
      [
        "no-provider-agent",
        () => ({ provider: "unknown" }) as unknown as ReturnType<AgentFactory>,
      ],
    ]);

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents,
    });

    const engine = await builder.build("exec-9", false, undefined);
    const resolveAgent = (engine.stepExecutor as unknown as { config?: { resolveAgentLLM?: (name: string) => Promise<unknown> } })?.config?.resolveAgentLLM;
    expect(resolveAgent).toBeDefined();
    if (resolveAgent) {
      const result = await resolveAgent("no-provider-agent");
      expect(result).toBeUndefined();
    }
    expect(eventBus.emit).toHaveBeenCalledWith("warning", "exec-9", expect.any(Object));
  });

  it("uses config.agents entry when preferAgentInfo is false", async () => {
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();
    const agents = new Map<string, AgentFactory>([
      [
        "config-agent",
        () => undefined as unknown as ReturnType<AgentFactory>,
      ],
    ]);

    const { loadConfig } = await import("../config-loader.js");
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      defaults: { provider: "openai", model: "gpt-4" },
      agents: {
        "config-agent": {
          provider: "openai",
          model: "gpt-3.5-turbo",
          temperature: 0.2,
        },
      },
    });

    const builder = new EngineBuilder({
      config: createBaseConfig(),
      eventBus,
      adapterFactory,
      persistenceManager,
      agents,
    });

    const engine = await builder.build("exec-10", false, undefined);
    const resolveAgent = (engine.stepExecutor as unknown as { config?: { resolveAgentLLM?: (name: string) => Promise<unknown> } })?.config?.resolveAgentLLM;
    expect(resolveAgent).toBeDefined();
    if (resolveAgent) {
      const result = (await resolveAgent("config-agent")) as { model: string; temperature: number } | undefined;
      expect(result).toBeDefined();
      expect(result?.model).toBe("gpt-3.5-turbo");
      expect(result?.temperature).toBe(0.2);
    }
  });
});
