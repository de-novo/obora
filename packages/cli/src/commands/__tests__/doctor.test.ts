/* eslint-disable import/order */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  detectLLMConfigFromEnv: vi.fn(),
  resolveLLMConfig: vi.fn(),
  buildResolutionSummary: vi.fn(),
  formatResolutionSummary: vi.fn(),
}));

vi.mock("@obora/adapters", () => ({
  listPiAIModels: vi.fn((provider: string) => {
    if (provider === "openai") {
      return ["gpt-5.4", "gpt-5", "gpt-5.4", "gpt-5.4-mini"];
    }
    if (provider === "anthropic") {
      return ["claude-opus-4-20250514", "claude-opus-4-6", "claude-sonnet-4-6"];
    }
    if (provider === "zai") {
      return ["glm-4.7", "glm-5", "glm-5-turbo"];
    }
    if (provider === "google") {
      return ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-preview"];
    }
    if (provider === "openrouter") {
      return ["openai/gpt-5.4", "openai/gpt-5.4", "openai/gpt-5.4-mini"];
    }
    return [];
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("../../utils/formatter.js", () => ({
  formatter: {
    success: vi.fn(),
    json: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
}));

vi.mock("../../utils/error-handler.js", () => ({
  handleCommandAction: vi.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
}));

vi.mock("../../utils/global-opts.js", () => ({
  getGlobalOpts: vi.fn(() => ({})),
}));

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { listPiAIModels } from "@obora/adapters";
import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  formatResolutionSummary,
  loadConfig,
  resolveLLMConfig,
} from "@obora/sdk";

import { formatter } from "../../utils/formatter.js";
import { createDoctorCommand, runDoctor } from "../doctor.js";

describe("doctor command", () => {
  const originalEnv = { ...process.env };
  const mockedGlobalConfigPath = join(homedir(), ".obora", "config.yaml");
  const mockedProjectConfigPath = "/tmp/demo/.obora/config.yaml";
  const mockedConfigSource = `${mockedGlobalConfigPath} -> ${mockedProjectConfigPath}`;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ZAI_API_KEY;

    vi.mocked(loadConfig).mockResolvedValue(undefined);
    vi.mocked(detectLLMConfigFromEnv).mockReturnValue(undefined);
    vi.mocked(resolveLLMConfig).mockReturnValue(undefined);
    vi.mocked(buildResolutionSummary).mockReturnValue({
      provider: null,
      model: null,
      authSource: "none",
      configSource: "none",
      modelSource: "none",
      chosenByPrecedence: "none",
      nextPlaceToEdit: ".obora/config.yaml (or set env key for first-time setup)",
      fallbackStub: true,
      warnings: ["No LLM resolved; execution will run in stub mode"],
    });
    vi.mocked(formatResolutionSummary).mockReturnValue(
      [
        "Execution Resolution",
        "- provider: none",
        "- model: none",
        "- fallback/stub: enabled",
      ].join("\n")
    );
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("command creation", () => {
    it("should create doctor command with correct name", () => {
      const cmd = createDoctorCommand();
      expect(cmd.name()).toBe("doctor");
    });

    it("should have doctor description", () => {
      const cmd = createDoctorCommand();
      expect(cmd.description().toLowerCase()).toContain("diagnose");
    });
  });

  describe("doctor execution", () => {
    it("should load config and resolve llm state", async () => {
      await runDoctor({});

      expect(loadConfig).toHaveBeenCalled();
      expect(detectLLMConfigFromEnv).toHaveBeenCalled();
      expect(resolveLLMConfig).toHaveBeenCalled();
      expect(buildResolutionSummary).toHaveBeenCalled();
    });

    it("should print json when --json is enabled", async () => {
      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            projectConfig: false,
            globalConfig: false,
          }),
          status: expect.objectContaining({
            status: "needs_config",
          }),
          recommendations: expect.arrayContaining([
            expect.stringContaining("obora init --quickstart"),
            expect.stringContaining("obora doctor"),
          ]),
          actions: expect.arrayContaining([
            expect.objectContaining({
              kind: "run",
              command: expect.stringContaining("obora init --quickstart"),
            }),
            expect.objectContaining({
              kind: "run",
              command: "obora doctor",
            }),
          ]),
          resolution: expect.objectContaining({
            fallbackStub: true,
          }),
        })
      );
    });

    it("should include structured sections in json output", async () => {
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: "gpt-5.4",
        authSource: "env(OPENAI_API_KEY)",
        configSource: mockedConfigSource,
        modelSource: "config.defaults.model",
        chosenByPrecedence: "config > env",
        nextPlaceToEdit: mockedProjectConfigPath,
        fallbackStub: false,
        warnings: ["Example warning"],
      });
      vi.mocked(existsSync).mockReturnValue(true);

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sections: expect.objectContaining({
            status: expect.objectContaining({
              heading: "Status",
              status: "ready",
              message: "Ready: openai/gpt-5.4",
            }),
            configuration: expect.objectContaining({
              heading: "Configuration",
              configuredProvider: null,
              configuredModel: null,
              authSource: "env(OPENAI_API_KEY)",
              configSource: mockedConfigSource,
              mergedSources: "global -> project",
              activeConfigPath: mockedProjectConfigPath,
            }),
            resolution: expect.objectContaining({
              heading: "Resolution",
              resolvedProvider: "openai",
              provider: "openai",
              resolvedModel: "gpt-5.4",
              model: "gpt-5.4",
              modelSource: "config.defaults.model",
              chosenByPrecedence: "config > env",
              fallbackStub: false,
              nextPlaceToEdit: mockedProjectConfigPath,
            }),
            warnings: expect.objectContaining({
              heading: "Warnings",
              items: ["Example warning"],
            }),
            recommendedNextActions: expect.objectContaining({
              heading: "Recommended next actions",
              items: [],
            }),
          }),
        })
      );
    });

    it("should include provider-aware fields in json output", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendedProvider: "anthropic",
          recommendedAuthEnvKey: "ANTHROPIC_API_KEY",
        })
      );
    });

    it("should include configured and resolved model context in json sections", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
          model: "claude-opus-4-6",
        },
      });
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: "gpt-5.4",
        authSource: "env(OPENAI_API_KEY)",
        configSource: mockedConfigSource,
        modelSource: "env(OPENAI_MODEL)",
        chosenByPrecedence: "config > env",
        nextPlaceToEdit: mockedProjectConfigPath,
        fallbackStub: false,
        warnings: [],
      });
      vi.mocked(existsSync).mockReturnValue(true);

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sections: expect.objectContaining({
            configuration: expect.objectContaining({
              configuredProvider: "anthropic",
              configuredModel: "claude-opus-4-6",
            }),
            resolution: expect.objectContaining({
              resolvedProvider: "openai",
              resolvedModel: "gpt-5.4",
              modelSource: "env(OPENAI_MODEL)",
            }),
          }),
        })
      );
    });

    it("should include structured auth diagnostics and setup guide in json output", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            configuredProvider: "anthropic",
            recommendedProvider: "anthropic",
            recommendedAuthEnvKey: "ANTHROPIC_API_KEY",
            setupGuide: "docs/tutorials/06-llm-config-auth-quickstart.md",
            detectedProviders: ["openai"],
          }),
        })
      );
    });

    it("should keep recommendation reason fields as null when no provider is available", async () => {
      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            modelRecommendationReason: null,
            resolvedModelRecommendationReason: null,
          }),
        })
      );
    });

    it("should include provider-specific setup examples in json output", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            authExportExample: "export ANTHROPIC_API_KEY=***",
            modelConfigExample: "providers:\n  anthropic:\n    defaultModel: claude-opus-4-6",
            modelEnvExample: "export ANTHROPIC_MODEL=claude-opus-4-6",
            modelRecommendationReason:
              "pi-ai catalog latest stable base Claude model for anthropic",
          }),
        })
      );
    });

    it("should recommend the latest stable google pro model from the catalog", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "google",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            modelEnvExample: "export GOOGLE_MODEL=gemini-2.5-pro",
            modelRecommendationReason: "pi-ai catalog latest stable Gemini Pro model for google",
          }),
        })
      );
    });

    it("should fall back to static provider defaults when catalog models are unavailable", async () => {
      vi.mocked(listPiAIModels).mockImplementation((provider: string) => {
        if (provider === "openai") {
          return [];
        }
        if (provider === "anthropic") {
          return ["claude-opus-4-20250514", "claude-opus-4-6", "claude-sonnet-4-6"];
        }
        if (provider === "zai") {
          return ["glm-4.7", "glm-5", "glm-5-turbo"];
        }
        if (provider === "google") {
          return ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-preview"];
        }
        if (provider === "openrouter") {
          return ["openai/gpt-5.4", "openai/gpt-5.4-mini"];
        }
        return [];
      });
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "openai",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            modelEnvExample: "export OPENAI_MODEL=gpt-5.4",
            modelRecommendationReason: "static fallback default model for openai",
          }),
        })
      );
    });

    it("should explain when neither catalog nor static defaults exist for a provider", async () => {
      vi.mocked(listPiAIModels).mockImplementation(() => []);
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "google",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            modelEnvExample: "export GOOGLE_MODEL=your-model-name",
            modelRecommendationReason:
              "no catalog-backed default available; choose a provider-specific model for google",
          }),
        })
      );
    });

    it("should prefer stable google flash over flash-lite and explain the selected family", async () => {
      vi.mocked(listPiAIModels).mockImplementation((provider: string) => {
        if (provider === "google") {
          return ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3-pro-preview"];
        }
        if (provider === "openai") {
          return ["gpt-5.4", "gpt-5", "gpt-5.4-mini"];
        }
        if (provider === "anthropic") {
          return ["claude-opus-4-20250514", "claude-opus-4-6", "claude-sonnet-4-6"];
        }
        if (provider === "zai") {
          return ["glm-4.7", "glm-5", "glm-5-turbo"];
        }
        if (provider === "openrouter") {
          return ["openai/gpt-5.4", "openai/gpt-5.4-mini"];
        }
        return [];
      });
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "google",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            modelEnvExample: "export GOOGLE_MODEL=gemini-2.5-flash",
            modelRecommendationReason: "pi-ai catalog latest stable Gemini Flash model for google",
          }),
        })
      );
    });

    it("should infer latest provider model examples from pi-ai catalog", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "zai",
        },
      });

      await runDoctor({ json: true });

      expect(listPiAIModels).toHaveBeenCalledWith("zai");
      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            modelConfigExample: "providers:\n  zai:\n    defaultModel: glm-5",
            modelEnvExample: "export ZAI_MODEL=glm-5",
          }),
        })
      );
    });

    it("should warn when detected env provider does not match configured provider", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            providerMismatchWarning:
              "Configured provider 'anthropic' differs from detected env auth providers: openai",
            conflictSummary: "config anthropic · env openai · resolved none",
          }),
          recommendations: expect.arrayContaining([
            "Detected env auth does not match configured provider. Either export ANTHROPIC_API_KEY=*** or switch defaults.provider to one of: openai",
            "Shell fix: unset OPENAI_API_KEY OPENAI_MODEL",
            expect.stringContaining("Config fix: edit "),
            expect.stringContaining("packages/cli/.obora/config.yaml -> defaults.provider: openai"),
          ]),
        })
      );
    });

    it("should print mismatch warning in default mode", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({});

      expect(formatter.warn).toHaveBeenCalledWith(
        "Configured provider 'anthropic' differs from detected env auth providers: openai"
      );
      expect(formatter.warn).toHaveBeenCalledWith(
        "Conflict: config anthropic · env openai · resolved none"
      );
    });

    it("should recommend fixing mismatch when resolved provider differs from configured provider", async () => {
      process.env.OPENAI_API_KEY = "***";
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: null,
        authSource: "env(OPENAI_API_KEY)",
        configSource: ".obora/config.yaml",
        modelSource: "none",
        chosenByPrecedence: "config > env",
        nextPlaceToEdit: ".obora/config.yaml",
        fallbackStub: false,
        warnings: [],
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            resolvedProvider: "openai",
            resolvedAuthEnvKey: "OPENAI_API_KEY",
            resolvedModelEnvKey: "OPENAI_MODEL",
            resolvedAuthExportExample: "export OPENAI_API_KEY=***",
            resolvedModelEnvExample: "export OPENAI_MODEL=gpt-5.4",
            resolvedModelConfigExample: "providers:\n  openai:\n    defaultModel: gpt-5.4",
            resolvedModelRecommendationReason: "pi-ai catalog latest GPT base model for openai",
            conflictSummary: "config anthropic · env openai · resolved openai",
          }),
          recommendations: expect.arrayContaining([
            "Resolved provider does not match configured provider. Either export ANTHROPIC_API_KEY=*** or switch defaults.provider to openai",
            "Shell fix: unset OPENAI_API_KEY OPENAI_MODEL",
            "Config fix: edit .obora/config.yaml -> defaults.provider: openai",
            "Resolved model config: providers:\n  openai:\n    defaultModel: gpt-5.4",
            "Resolved model env: export OPENAI_MODEL=gpt-5.4",
            "Resolved model basis: pi-ai catalog latest GPT base model for openai",
          ]),
          actions: expect.arrayContaining([
            expect.objectContaining({
              kind: "env",
              envKey: "ANTHROPIC_API_KEY",
              shellCommand: "export ANTHROPIC_API_KEY=***",
            }),
            expect.objectContaining({
              kind: "shell",
              shellCommand: "unset OPENAI_API_KEY OPENAI_MODEL",
              envKeys: ["OPENAI_API_KEY", "OPENAI_MODEL"],
            }),
            expect.objectContaining({
              kind: "config",
              path: ".obora/config.yaml",
              key: "defaults.provider",
              value: "openai",
            }),
          ]),
        })
      );
    });

    it("should print config chain summary in default mode", async () => {
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: null,
        model: null,
        authSource: "none",
        configSource: mockedConfigSource,
        modelSource: "none",
        chosenByPrecedence: "none",
        nextPlaceToEdit: mockedProjectConfigPath,
        fallbackStub: true,
        warnings: ["No LLM resolved; execution will run in stub mode"],
      });

      await runDoctor({});

      expect(formatter.step).toHaveBeenCalledWith("Merged sources: global -> project");
      expect(formatter.step).toHaveBeenCalledWith(`Active config: ${mockedProjectConfigPath}`);
    });

    it("should include structured config source diagnostics in json output", async () => {
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: null,
        model: null,
        authSource: "none",
        configSource: mockedConfigSource,
        modelSource: "none",
        chosenByPrecedence: "none",
        nextPlaceToEdit: mockedProjectConfigPath,
        fallbackStub: true,
        warnings: ["No LLM resolved; execution will run in stub mode"],
      });

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            configSource: mockedConfigSource,
            sourceChain: [mockedGlobalConfigPath, mockedProjectConfigPath],
            globalConfigPath: mockedGlobalConfigPath,
            projectConfigPath: mockedProjectConfigPath,
            activeConfigPath: mockedProjectConfigPath,
            nextPlaceToEdit: mockedProjectConfigPath,
          }),
        })
      );
    });

    it("should print section headings in default mode", async () => {
      await runDoctor({});

      expect(formatter.info).toHaveBeenCalledWith("Status");
      expect(formatter.info).toHaveBeenCalledWith("Configuration");
      expect(formatter.info).toHaveBeenCalledWith("Resolution");
      expect(formatter.info).toHaveBeenCalledWith("Warnings");
      expect(formatter.info).toHaveBeenCalledWith("Recommended next actions");
    });

    it("should print actionable lines in default mode", async () => {
      await runDoctor({});

      expect(formatter.info).toHaveBeenCalledWith("Obora doctor");
      expect(formatter.step).toHaveBeenCalledWith("Needs auth: no provider credential detected");
      expect(formatter.step).toHaveBeenCalledWith("Node.js: available");
      expect(formatter.step).toHaveBeenCalledWith("Project config (.obora/config.yaml): missing");
      expect(formatter.step).toHaveBeenCalledWith("Global config (~/.obora/config.yaml): missing");
      expect(formatter.step).toHaveBeenCalledWith("Auth source: none");
      expect(formatter.step).toHaveBeenCalledWith("Config source: none");
      expect(formatter.step).toHaveBeenCalledWith("Fallback/stub: enabled");
      expect(formatter.warn).toHaveBeenCalledWith(
        "No LLM resolved; execution will run in stub mode"
      );
      expect(formatter.info).toHaveBeenCalledWith("Recommended next actions");
      expect(formatter.step).toHaveBeenCalledWith(
        expect.stringContaining("Run: obora init --quickstart")
      );
      expect(formatter.step).toHaveBeenCalledWith(
        "Set one provider API key, then rerun: obora doctor"
      );
      expect(formatter.step).toHaveBeenCalledWith(
        "Setup guide: docs/tutorials/06-llm-config-auth-quickstart.md"
      );
      expect(formatter.step).toHaveBeenCalledWith(
        "Examples: export OPENAI_API_KEY=***  |  export ANTHROPIC_API_KEY=***  |  export ZAI_API_KEY=***"
      );
      expect(formatter.info).toHaveBeenCalledWith(
        "Next step: .obora/config.yaml (or set env key for first-time setup)"
      );
    });

    it("should prioritize configured default provider in auth hints", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({});

      expect(formatter.step).toHaveBeenCalledWith("Configured provider: anthropic");
      expect(formatter.step).toHaveBeenCalledWith("Configured default provider: anthropic");
      expect(formatter.step).toHaveBeenCalledWith("Recommended auth: export ANTHROPIC_API_KEY=***");
      expect(formatter.step).toHaveBeenCalledWith(
        "Model basis: pi-ai catalog latest stable base Claude model for anthropic"
      );
    });

    it("should report ready status when provider and model are resolved", async () => {
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: "gpt-5.4",
        authSource: "env(OPENAI_API_KEY)",
        configSource: ".obora/config.yaml",
        modelSource: "config.defaults.model",
        chosenByPrecedence: "config > env",
        nextPlaceToEdit: ".obora/config.yaml",
        fallbackStub: false,
        warnings: [],
      });
      vi.mocked(existsSync).mockReturnValue(true);

      await runDoctor({});

      expect(formatter.step).toHaveBeenCalledWith("Ready: openai/gpt-5.4");
      expect(formatter.step).toHaveBeenCalledWith("Resolved provider: openai");
      expect(formatter.step).toHaveBeenCalledWith("Resolved model: gpt-5.4");
      expect(formatter.step).toHaveBeenCalledWith("Fallback/stub: disabled");
      expect(formatter.step).toHaveBeenCalledWith("Run your workflow: obora run judge.yaml");
    });

    it("should show resolved model recommendation basis in env-only missing-model text output", async () => {
      process.env.OPENAI_API_KEY = "***";
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: null,
        authSource: "env(OPENAI_API_KEY)",
        configSource: "none",
        modelSource: "none",
        chosenByPrecedence: "env > config",
        nextPlaceToEdit: ".obora/config.yaml (or set env key for first-time setup)",
        fallbackStub: false,
        warnings: [],
      });

      await runDoctor({});

      expect(formatter.step).toHaveBeenCalledWith(
        "Resolved model env: export OPENAI_MODEL=gpt-5.4"
      );
      expect(formatter.step).toHaveBeenCalledWith(
        "Resolved model basis: pi-ai catalog latest GPT base model for openai"
      );
    });

    it("should diagnose missing model when auth exists but model is unresolved", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: null,
        authSource: "env(OPENAI_API_KEY)",
        configSource: ".obora/config.yaml",
        modelSource: "none",
        chosenByPrecedence: "config > env",
        nextPlaceToEdit: ".obora/config.yaml",
        fallbackStub: false,
        warnings: [],
      });
      vi.mocked(existsSync).mockReturnValue(true);

      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({
            status: "needs_config",
            message: "Needs model: provider auth detected but no model is resolved",
          }),
          recommendations: expect.arrayContaining([
            "Set a default model in .obora/config.yaml or export OPENAI_MODEL=***",
          ]),
        })
      );
    });
  });
});
