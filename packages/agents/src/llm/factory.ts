import { LLMAdapter } from "./adapter";
import { MockLLMAdapter } from "./mock-adapter";
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

/**
 * Create an LLM adapter based on environment variables.
 *
 * Behaviour by environment:
 * - `OBORA_LLM_PROVIDER=mock` → MockLLMAdapter (explicit opt-in for tests/CI).
 * - `OBORA_LLM_PROVIDER=pi-mono` (or unset, default) + `PIMONO_API_KEY` set → PiMonoAdapter.
 * - `PIMONO_API_KEY` missing in **production** (`NODE_ENV=production`) → throws.
 * - `PIMONO_API_KEY` missing in **development** → MockLLMAdapter with console warning.
 *
 * @throws {Error} When API key is missing in production.
 */
export function createAdapterFromEnv(): LLMAdapter {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const provider = env?.OBORA_LLM_PROVIDER ?? "pi-mono";

  switch (provider) {
    case "mock":
      // Explicit mock provider — useful for testing / CI
      return new MockLLMAdapter();

    case "pi-mono": {
      const apiKey = env?.PIMONO_API_KEY;
      if (!apiKey) {
        const nodeEnv = env?.NODE_ENV ?? "development";
        if (nodeEnv === "production") {
          throw new Error(
            "PIMONO_API_KEY environment variable is required in production. " +
              "Set OBORA_LLM_PROVIDER=mock to use the mock adapter explicitly."
          );
        }
        // Development / test fallback — warn loudly so it's never silent
        console.warn(
          "[obora-agents] WARNING: PIMONO_API_KEY not set. " +
            "Falling back to MockLLMAdapter. Set the key or use OBORA_LLM_PROVIDER=mock to silence this warning."
        );
        return new MockLLMAdapter();
      }
      return createLLMAdapter("pi-mono", { apiKey });
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
