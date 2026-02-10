import { LLMAdapter } from "./adapter";
import { PiMonoAdapter } from "./pi-mono-adapter";
import { withRetry } from "./retry-handler";

export function createLLMAdapter(provider: "pi-mono", config: unknown): LLMAdapter {
  switch (provider) {
    case "pi-mono": {
      const adapter = new PiMonoAdapter(config as { apiKey: string });
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
