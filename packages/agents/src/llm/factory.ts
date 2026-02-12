import { LLMAdapter } from "./adapter";
import { PiMonoAdapter, type PiMonoConfig } from "./pi-mono-adapter";
import { withRetry } from "./retry-handler";

type LLMAdapterConfigMap = {
  "pi-mono": PiMonoConfig;
};

export function createLLMAdapter<P extends keyof LLMAdapterConfigMap>(
  provider: P,
  config: LLMAdapterConfigMap[P]
): LLMAdapter {
  switch (provider) {
    case "pi-mono": {
      const adapter = new PiMonoAdapter(config as PiMonoConfig);
      return withRetry(adapter);
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

export function createAdapterFromEnv(): LLMAdapter {
  const provider =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.OBORA_LLM_PROVIDER ?? "pi-mono";

  switch (provider) {
    case "pi-mono": {
      const apiKey = (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.PIMONO_API_KEY;
      if (!apiKey) {
        throw new Error("PIMONO_API_KEY environment variable is required");
      }
      return createLLMAdapter("pi-mono", { apiKey });
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
