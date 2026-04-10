import { listPiAIModels, listPiAIProviders } from "@obora/adapters";
import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

interface ModelsOptions {
  json?: boolean;
}

interface GlobalModelMatch {
  provider: string;
  model: string;
}

function buildGlobalNoMatchHint(): string {
  return `No models matched. Check the spelling or try \`obora models <provider> [query]\`.`;
}

function shellQuoteArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildProviderNoMatchHint(query: string, providers: string[]): string {
  const normalizedQuery = query.toLowerCase();
  if (providers.some((provider) => provider.toLowerCase() == normalizedQuery)) {
    return "No models matched this provider filter. Check the query spelling or search across all providers instead.";
  }

  const suggestedQuery = shellQuoteArg(query);
  return `No models matched this provider filter. Check the query spelling or run \`obora models ${suggestedQuery}\`.`;
}

function filterModels(models: string[], query?: string): string[] {
  if (!query) {
    return models;
  }

  const normalizedQuery = query.toLowerCase();
  return models.filter((model) => model.toLowerCase().includes(normalizedQuery));
}

function buildGlobalMatches(providers: string[], query: string): GlobalModelMatch[] {
  return providers.flatMap((provider) =>
    filterModels(listPiAIModels(provider), query).map((model) => ({
      provider,
      model,
    }))
  );
}

function printGlobalMatches(
  matches: GlobalModelMatch[],
  query: string,
  options: ModelsOptions
): void {
  if (options.json) {
    formatter.json({
      source: "pi-ai",
      query,
      count: matches.length,
      matches,
      ...(matches.length === 0 ? { hint: buildGlobalNoMatchHint() } : {}),
    });
    return;
  }

  formatter.info("Obora models");
  formatter.step("Source: pi-ai");
  formatter.step(`Global filter: ${query}`);
  formatter.step(`Match count: ${matches.length}`);
  if (matches.length === 0) {
    formatter.warn(buildGlobalNoMatchHint());
    return;
  }

  for (const match of matches) {
    formatter.step(`${match.provider}: ${match.model}`);
  }
}

export async function runModels(
  provider: string | undefined,
  query: string | undefined,
  options: ModelsOptions = {}
): Promise<void> {
  const providers = listPiAIProviders();

  if (provider && !providers.includes(provider)) {
    if (query !== undefined) {
      throw new Error(
        `Unsupported provider '${provider}'. Supported providers: ${providers.join(", ")}`
      );
    }

    printGlobalMatches(buildGlobalMatches(providers, provider), provider, options);
    return;
  }

  if (provider) {
    const models = filterModels(listPiAIModels(provider), query);

    if (options.json) {
      formatter.json({
        source: "pi-ai",
        provider,
        ...(query ? { query } : {}),
        count: models.length,
        models,
        ...(models.length === 0 && query
          ? { hint: buildProviderNoMatchHint(query, providers) }
          : {}),
      });
      return;
    }

    formatter.info("Obora models");
    formatter.step("Source: pi-ai");
    formatter.step(`Provider: ${provider}`);
    if (query) {
      formatter.step(`Filter: ${query}`);
    }
    formatter.step(`Model count: ${models.length}`);
    if (models.length === 0 && query) {
      formatter.warn(buildProviderNoMatchHint(query, providers));
      return;
    }

    for (const model of models) {
      formatter.step(model);
    }
    return;
  }

  const providerRows = providers.map((name) => ({
    provider: name,
    count: listPiAIModels(name).length,
  }));

  if (options.json) {
    formatter.json({
      source: "pi-ai",
      providers: providerRows,
    });
    return;
  }

  formatter.info("Obora models");
  formatter.step("Source: pi-ai");
  formatter.info("Providers");
  for (const row of providerRows) {
    formatter.step(`${row.provider} (${row.count})`);
  }
  formatter.info("Next step: obora models <provider> [query] or obora models <query>");
}

export function createModelsCommand(): Command {
  return new Command("models")
    .description("List supported model refs from the installed pi-ai catalog")
    .argument("[provider]", "Provider name to inspect or global query")
    .argument("[query]", "Optional substring filter for provider-specific model refs")
    .action(async function (this: Command, provider?: string, query?: string) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runModels(provider, query, globalOpts);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
