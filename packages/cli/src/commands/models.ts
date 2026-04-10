import { listPiAIModels, listPiAIProviders } from "@obora/adapters";
import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

interface ModelsOptions {
  json?: boolean;
}

function filterModels(models: string[], query?: string): string[] {
  if (!query) {
    return models;
  }

  const normalizedQuery = query.toLowerCase();
  return models.filter((model) => model.toLowerCase().includes(normalizedQuery));
}

export async function runModels(
  provider: string | undefined,
  query: string | undefined,
  options: ModelsOptions = {}
): Promise<void> {
  const providers = listPiAIProviders();

  if (provider) {
    if (!providers.includes(provider)) {
      throw new Error(
        `Unsupported provider '${provider}'. Supported providers: ${providers.join(", ")}`
      );
    }

    const models = filterModels(listPiAIModels(provider), query);

    if (options.json) {
      formatter.json({
        source: "pi-ai",
        provider,
        ...(query ? { query } : {}),
        count: models.length,
        models,
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
  formatter.info("Next step: obora models <provider> [query]");
}

export function createModelsCommand(): Command {
  return new Command("models")
    .description("List supported model refs from the installed pi-ai catalog")
    .argument("[provider]", "Provider name to inspect")
    .argument("[query]", "Optional substring filter for model refs")
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
