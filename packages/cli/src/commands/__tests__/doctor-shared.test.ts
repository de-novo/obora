import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/adapters", () => ({
  listPiAIModels: vi.fn(),
}));

import { listPiAIModels } from "@obora/adapters";

import {
  buildAuthDiagnostics,
  buildAuthExampleHint,
  buildConfiguredProviderHints,
  buildDoctorActions,
  buildDoctorRecommendations,
  buildDoctorStatus,
  buildGoogleModelRecommendationReason,
  buildModelRecommendationReason,
  buildProviderSetupExamples,
  buildProviderSpecificGuidance,
  buildRecommendedModelInfo,
  inferAuthEnvKey,
  inferLatestCatalogModel,
  inferModelEnvKey,
  parseAnthropicModel,
  pushDoctorAction,
  selectAnthropicLatestModel,
  selectGoogleLatestModel,
  selectOpenAILatestModel,
  selectOpenRouterLatestModel,
  selectZAILatestModel,
  summarizeConfigChain,
  type DoctorAction,
  type DoctorAuthDiagnostics,
  type DoctorChecks,
} from "../doctor-shared.js";

describe("doctor shared provider helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPiAIModels).mockReturnValue([]);
  });

  it("describes Google catalog recommendation families and stability", () => {
    expect(buildGoogleModelRecommendationReason("gemini-3-flash-lite-preview")).toBe(
      "pi-ai catalog latest preview Gemini Flash Lite model for google"
    );
    expect(buildGoogleModelRecommendationReason("gemini-3-flash-latest")).toBe(
      "pi-ai catalog latest preview Gemini Flash model for google"
    );
    expect(buildGoogleModelRecommendationReason("gemini-3-pro-live")).toBe(
      "pi-ai catalog latest preview Gemini Pro model for google"
    );
  });

  it("builds catalog and fallback model reasons for routed and unknown providers", () => {
    expect(buildModelRecommendationReason("openrouter", "catalog")).toBe(
      "pi-ai catalog latest OpenAI base model routed via openrouter"
    );
    expect(buildModelRecommendationReason("groq", "catalog")).toBe(
      "pi-ai catalog latest base model for groq"
    );
    expect(buildModelRecommendationReason("groq", "fallback")).toBe(
      "static fallback default model for groq"
    );
  });

  it("selects latest catalog models by provider-specific rules", () => {
    expect(selectOpenAILatestModel(["gpt-5", "not-gpt", "gpt-5.4", "gpt-4.9"])).toBe("gpt-5.4");
    expect(selectZAILatestModel(["glm-4.7", "glm-5", "other"])).toBe("glm-5");
    expect(
      selectGoogleLatestModel([
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-3-pro-preview",
        "other",
      ])
    ).toBe("gemini-2.5-flash");
    expect(selectOpenRouterLatestModel(["anthropic/claude", "openai/gpt-5", "openai/gpt-5.4"])).toBe(
      "openai/gpt-5.4"
    );
    expect(selectOpenRouterLatestModel(["anthropic/claude"])).toBeUndefined();
  });

  it("parses modern and historical Anthropic model names", () => {
    const familyPriority = { opus: 3, sonnet: 2, haiku: 1 };

    expect(parseAnthropicModel("claude-opus-4-20250514", familyPriority)).toEqual(
      expect.objectContaining({
        model: "claude-opus-4-20250514",
        family: 3,
        major: 4,
        minor: 0,
        stableAlias: false,
        snapshotDate: 20250514,
      })
    );
    expect(parseAnthropicModel("claude-haiku-4-6-20250514", familyPriority)).toEqual(
      expect.objectContaining({
        family: 1,
        major: 4,
        minor: 6,
        stableAlias: false,
        snapshotDate: 20250514,
      })
    );
    expect(parseAnthropicModel("claude-3-5-sonnet-latest", familyPriority)).toEqual(
      expect.objectContaining({
        family: 2,
        major: 3,
        minor: 5,
        stableAlias: true,
      })
    );
    expect(parseAnthropicModel("not-claude", familyPriority)).toBeNull();
  });

  it("selects Anthropic models by family, version, alias stability, and snapshot date", () => {
    expect(
      selectAnthropicLatestModel([
        "claude-3-7-sonnet-20250101",
        "claude-sonnet-4-6",
        "claude-haiku-4-7",
        "claude-opus-4-20250514",
      ])
    ).toBe("claude-opus-4-20250514");
  });

  it("infers catalog models and tolerates catalog failures", () => {
    vi.mocked(listPiAIModels).mockImplementation((provider: string) => {
      if (provider === "openrouter") {
        return ["openai/gpt-5", "openai/gpt-5.4"];
      }
      if (provider === "broken") {
        throw new Error("catalog down");
      }
      return ["provider-model"];
    });

    expect(inferLatestCatalogModel("openrouter")).toBe("openai/gpt-5.4");
    expect(inferLatestCatalogModel("unknown")).toBeUndefined();
    expect(inferLatestCatalogModel("broken")).toBeUndefined();
  });

  it("infers env keys for known and unknown providers", () => {
    expect(inferAuthEnvKey("openai-codex")).toBe("OPENAI_API_KEY");
    expect(inferModelEnvKey("openai-codex")).toBe("OPENAI_MODEL");
    expect(inferAuthEnvKey("acme-provider/v2")).toBe("ACME_PROVIDER_V2_API_KEY");
    expect(inferModelEnvKey("acme-provider/v2")).toBe("ACME_PROVIDER_V2_MODEL");
  });

  it("builds setup examples for missing, known, and custom providers", () => {
    expect(buildProviderSetupExamples(null)).toEqual({
      authExportExample: null,
      modelEnvExample: null,
      modelConfigExample: null,
      modelRecommendationReason: null,
    });

    vi.mocked(listPiAIModels).mockReturnValue(["openai/gpt-5.4"]);
    expect(buildProviderSetupExamples("openrouter")).toMatchObject({
      authExportExample: "export OPENROUTER_API_KEY=***",
      modelEnvExample: "export OPENROUTER_MODEL=openai/gpt-5.4",
    });

    vi.mocked(listPiAIModels).mockReturnValue([]);
    expect(buildRecommendedModelInfo("groq")).toEqual({
      model: "your-model-name",
      reason: "no catalog-backed default available; choose a provider-specific model for groq",
    });
  });

  it("builds auth and provider guidance branches", () => {
    expect(buildAuthExampleHint({ authSource: "env(OPENAI_API_KEY)" })).toBeNull();
    expect(buildAuthExampleHint({ authSource: "none" })).toContain("export OPENAI_API_KEY=***");
    expect(
      buildConfiguredProviderHints({
        configuredProvider: "anthropic",
        recommendedProvider: null,
        recommendedAuthEnvKey: null,
      })
    ).toEqual([]);
    expect(
      buildConfiguredProviderHints({
        configuredProvider: "anthropic",
        recommendedProvider: "anthropic",
        recommendedAuthEnvKey: "ANTHROPIC_API_KEY",
      })
    ).toEqual([
      "Configured default provider: anthropic",
      "Recommended auth: export ANTHROPIC_API_KEY=***",
      "Model basis: static fallback default model for anthropic",
    ]);
  });

  it("uses resolved provider examples when only env auth is resolved", () => {
    vi.mocked(listPiAIModels).mockReturnValue(["gpt-5.4"]);
    const authDiagnostics = buildAuthDiagnostics(
      {
        configuredProvider: null,
        recommendedProvider: null,
        recommendedAuthEnvKey: null,
      },
      { provider: "openai" }
    );

    expect(
      buildProviderSpecificGuidance(
        { authSource: "env(OPENAI_API_KEY)", provider: "openai", model: null },
        authDiagnostics
      )
    ).toEqual([
      "Resolved model config: providers:\n  openai:\n    defaultModel: gpt-5.4",
      "Resolved model env: export OPENAI_MODEL=gpt-5.4",
      "Resolved model basis: pi-ai catalog latest GPT base model for openai",
    ]);
  });

  it("uses configured provider examples when they match the resolved provider", () => {
    vi.mocked(listPiAIModels).mockReturnValue(["gpt-5.4"]);
    const authDiagnostics = buildAuthDiagnostics(
      {
        configuredProvider: "openai",
        recommendedProvider: null,
        recommendedAuthEnvKey: null,
      },
      { provider: "openai" }
    );

    expect(
      buildProviderSpecificGuidance(
        { authSource: "env(OPENAI_API_KEY)", provider: "openai", model: null },
        authDiagnostics
      )
    ).toEqual([
      "Model config: providers:\n  openai:\n    defaultModel: gpt-5.4",
      "Model env: export OPENAI_MODEL=gpt-5.4",
      "Model basis: pi-ai catalog latest GPT base model for openai",
    ]);
  });

  it("skips concrete model examples when recommendations are absent or placeholders", () => {
    const baseDiagnostics = buildAuthDiagnostics(
      {
        configuredProvider: "groq",
        recommendedProvider: null,
        recommendedAuthEnvKey: null,
      },
      { provider: "groq" }
    );
    const withoutModelEnv: DoctorAuthDiagnostics = {
      ...baseDiagnostics,
      modelEnvExample: null,
      modelConfigExample: null,
    };

    expect(
      buildProviderSpecificGuidance(
        { authSource: "env(GROQ_API_KEY)", provider: "groq", model: null },
        withoutModelEnv
      )
    ).toEqual([
      "Model basis: no catalog-backed default available; choose a provider-specific model for groq",
    ]);
    expect(
      buildProviderSpecificGuidance(
        { authSource: "env(GROQ_API_KEY)", provider: "groq", model: null },
        baseDiagnostics
      )
    ).toEqual([
      "Model basis: no catalog-backed default available; choose a provider-specific model for groq",
    ]);
  });

  it("summarizes mixed config source chains", () => {
    expect(
      summarizeConfigChain({
        configSource: "none",
        sourceChain: ["/home/user/.obora/config.yaml"],
        globalConfigPath: "/home/user/.obora/config.yaml",
        projectConfigPath: null,
        activeConfigPath: "/home/user/.obora/config.yaml",
        nextPlaceToEdit: "/work/.obora/config.yaml",
      })
    ).toBeNull();
    expect(
      summarizeConfigChain({
        configSource: "/global -> /shared/custom.yaml -> /work/.obora/config.yaml",
        sourceChain: ["/global", "/shared/custom.yaml", "/work/.obora/config.yaml"],
        globalConfigPath: "/global",
        projectConfigPath: "/work/.obora/config.yaml",
        activeConfigPath: "/work/.obora/config.yaml",
        nextPlaceToEdit: "/work/.obora/config.yaml",
      })
    ).toBe("global -> config -> project");
  });

  it("falls back from resolved to configured model examples in recommendations and actions", () => {
    const checks: DoctorChecks = {
      node: true,
      projectConfigPath: "/work/.obora/config.yaml",
      projectConfig: true,
      globalConfigPath: "/home/user/.obora/config.yaml",
      globalConfig: false,
    };
    const summary = {
      provider: "groq",
      model: null,
      authSource: "env(GROQ_API_KEY)",
      configSource: "/work/.obora/config.yaml",
      nextPlaceToEdit: "/work/.obora/config.yaml",
      fallbackStub: false,
      warnings: [],
    };
    const providerHint = {
      configuredProvider: "groq",
      recommendedProvider: null,
      recommendedAuthEnvKey: null,
    };
    const authDiagnostics: DoctorAuthDiagnostics = {
      ...buildAuthDiagnostics(providerHint, { provider: "groq" }),
      resolvedModelEnvExample: null,
      resolvedModelConfigExample: null,
    };
    const agentDiagnostics = {
      totalConfiguredAgents: 0,
      driftedAgents: [],
      warning: null,
    };

    expect(
      buildDoctorRecommendations(
        checks,
        summary,
        providerHint,
        authDiagnostics,
        undefined,
        agentDiagnostics
      )
    ).toContain("Set a default model in .obora/config.yaml or export GROQ_MODEL=***");
    expect(
      buildDoctorActions(
        checks,
        summary,
        providerHint,
        authDiagnostics,
        undefined,
        agentDiagnostics
      )
    ).toEqual([
      {
        kind: "env",
        envKey: "GROQ_MODEL",
        shellCommand: "export GROQ_MODEL=***",
      },
    ]);
  });

  it("covers non-ready doctor status fallbacks and action de-duplication", () => {
    expect(
      buildDoctorStatus(
        { provider: "openai", model: null, authSource: "env(OPENAI_API_KEY)", fallbackStub: false },
        { configuredProvider: null }
      )
    ).toEqual({
      status: "needs_config",
      message: "Needs model: provider auth detected but no model is resolved",
    });
    expect(
      buildDoctorStatus(
        { provider: null, model: null, authSource: "env(OPENAI_API_KEY)", fallbackStub: true },
        { configuredProvider: null }
      )
    ).toEqual({
      status: "stub_mode",
      message: "Stub mode: provider/model is not fully resolved yet",
    });

    const actions: DoctorAction[] = [];
    pushDoctorAction(actions, { kind: "run", command: "obora doctor" });
    pushDoctorAction(actions, { kind: "run", command: "obora doctor" });
    pushDoctorAction(actions, { kind: "doc", path: "docs/tutorials/06-llm-config-auth-quickstart.md" });

    expect(actions).toEqual([
      { kind: "run", command: "obora doctor" },
      { kind: "doc", path: "docs/tutorials/06-llm-config-auth-quickstart.md" },
    ]);
  });
});
