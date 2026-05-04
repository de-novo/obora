import type { WorkflowDef } from "../workflow.js";
import type { LLMConfig, AgentFactory, OboraConfig } from "../runtime-types.js";
import type { EventBus } from "../events/event-bus.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import { loadConfig, resolveProviderConfig } from "../config-loader.js";
import { resolveLLMConfig } from "../llm-config.js";
import {
  buildBindingPreview,
  buildOutputPreview,
  buildResolutionSummary,
  formatBindingPreview,
  formatOutputPreview,
  formatResolutionSummary,
} from "../resolution-summary.js";
import { formatDiagnostic } from "../diagnostics.js";
import { AdapterResolver } from "./adapter-resolver.js";
import { CostTracker } from "../cost-tracker.js";
import { StepExecutor } from "../step-executor.js";
import type { LLMAdapterLike } from "../step-executor.js";
import { loadAgentsFromYamlFile, loadWorkflowAgents } from "../agents/source-loaders.js";
import { OboraErrorCode } from "../runtime-types.js";
import type { OboraRuntimeConfig } from "../runtime-types.js";

export interface ExecutionEngine {
  stepExecutor: StepExecutor | undefined;
  costTracker: CostTracker | undefined;
  loadedConfig: OboraConfig | undefined;
  llmConfig: LLMConfig | undefined;
  runtimeAgents: Map<string, AgentFactory>;
  resolver: AdapterResolver;
}

export interface EngineBuilderDeps {
  config: OboraRuntimeConfig;
  eventBus: EventBus;
  adapterFactory: (cfg: LLMConfig) => Promise<LLMAdapterLike>;
  persistenceManager: PersistenceManager;
  agents: Map<string, AgentFactory>;
}

export class EngineBuilder {
  constructor(private readonly deps: EngineBuilderDeps) {}

  async build(
    executionId: string,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined,
    workflow?: WorkflowDef
  ): Promise<ExecutionEngine> {
    const { config, eventBus, adapterFactory, persistenceManager, agents } = this.deps;

    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);

    const llmConfig = resolveLLMConfig(config.llm, loadedConfig);
    const resolutionSummary = buildResolutionSummary(config, llmConfig, loadedConfig);
    const resolutionText = formatResolutionSummary(resolutionSummary);
    const bindingPreviewText = formatBindingPreview(buildBindingPreview(workflow));
    const outputPreviewText = formatOutputPreview(buildOutputPreview(workflow));
    const startupSections = [resolutionText, bindingPreviewText, outputPreviewText].filter(Boolean);
    const startupText = startupSections.join("\n");
    if (config.logger?.info) {
      config.logger.info(startupText);
    } else {
      console.info(startupText);
    }
    const runtimeAgents = await loadAgentsFromYamlFile(config.agentsPath);
    const workflowAgents = loadWorkflowAgents(workflow);

    const allAgents = new Map<string, AgentFactory>([
      ...runtimeAgents,
      ...workflowAgents,
      ...agents,
    ]);
    const resolver = new AdapterResolver(adapterFactory);

    const resourcesConfig = loadedConfig?.resources;
    const shouldTrackCost = Boolean(resourcesConfig);
    const costTracker = shouldTrackCost
      ? new CostTracker(
          await persistenceManager.getCostTrackingAdapter(),
          executionId,
          loadedConfig
        )
      : undefined;

    if (!llmConfig) {
      const selectedProvider =
        config.llm?.provider ?? loadedConfig?.defaults?.provider ?? "unknown";
      await eventBus.emit("warning", executionId, {
        message: formatDiagnostic({
          code: "AUTH_1001",
          summary: `Missing auth for provider ${selectedProvider}`,
          reason:
            "no provider auth could be resolved from explicit config, project config, or environment",
          fix: "configure provider auth before execution or switch explicitly to mock mode",
          context: { provider: selectedProvider, fallback: true },
        }),
        code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
      });
      await eventBus.emit("warning", executionId, {
        message: formatDiagnostic({
          code: "FALLBACK_1001",
          summary: "Execution will run in stub mode",
          reason: "no LLM configuration was resolved for the current execution",
          fix: "set provider/model/auth explicitly or disable stub fallback for this run",
          context: { provider: selectedProvider },
        }),
        code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
      });
    }

    const stepExecutor = llmConfig
      ? new StepExecutor(await resolver.get(llmConfig), allAgents, {
          model: llmConfig.model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
          verbose: config.verbose,
          tools: config.stepTools,
          resolveAgentLLM: this.buildResolveAgentLLM(
            executionId,
            loadedConfig,
            allAgents,
            resolver
          ),
          onEvent: async (eventType, data) => {
            if (eventType === "llm_response" && costTracker) {
              const payload = data as {
                stepName?: string;
                model?: string;
                usage?: {
                  promptTokens?: number;
                  completionTokens?: number;
                  totalTokens?: number;
                };
                latencyMs?: number;
              };
              if (payload.stepName) {
                await costTracker.recordCall({
                  stepName: payload.stepName,
                  model: payload.model,
                  promptTokens: payload.usage?.promptTokens,
                  completionTokens: payload.usage?.completionTokens,
                  totalTokens: payload.usage?.totalTokens,
                  latencyMs: payload.latencyMs,
                });
              }
            }
            await eventBus.emit(eventType, executionId, data);
          },
        })
      : undefined;

    return {
      stepExecutor,
      costTracker,
      loadedConfig,
      llmConfig,
      runtimeAgents,
      resolver,
    };
  }

  private buildResolveAgentLLM(
    executionId: string,
    loadedConfig: OboraConfig | undefined,
    allAgents: Map<string, AgentFactory>,
    resolver: AdapterResolver
  ) {
    return async (agentName?: string) => {
      if (!loadedConfig || !agentName) return undefined;

      const agentRaw = allAgents.get(agentName)?.();
      const agentInfo =
        agentRaw && typeof agentRaw === "object"
          ? (agentRaw as {
              provider?: string;
              model?: string;
              temperature?: number;
              api_key?: string;
            })
          : undefined;
      const configAgent = loadedConfig.agents?.[agentName];
      const preferAgentInfo = Boolean(agentInfo);

      const resolvedProviderName = preferAgentInfo
        ? (agentInfo?.provider ?? loadedConfig.defaults?.provider)
        : (configAgent?.provider ?? loadedConfig.defaults?.provider);

      let providerConfig = resolveProviderConfig(loadedConfig, resolvedProviderName, {
        verbose: this.deps.config.verbose,
      });

      if (preferAgentInfo && agentInfo?.api_key && providerConfig) {
        providerConfig = {
          ...providerConfig,
          apiKey: agentInfo.api_key,
        };
      }

      if (!providerConfig) {
        if (resolvedProviderName) {
          await this.deps.eventBus.emit("warning", executionId, {
            message: `Agent '${agentName}' configured with provider '${resolvedProviderName}' but API key not resolved. Falling back to default.`,
            code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
          });
        }
        return undefined;
      }

      return {
        adapter: await resolver.get(providerConfig),
        model: preferAgentInfo
          ? (agentInfo?.model ?? providerConfig.model)
          : (configAgent?.model ?? providerConfig.model),
        temperature: preferAgentInfo
          ? (agentInfo?.temperature ?? providerConfig.temperature)
          : (configAgent?.temperature ?? providerConfig.temperature),
        maxTokens: providerConfig.maxTokens,
      };
    };
  }
}
