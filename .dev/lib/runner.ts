import { parse } from "yaml";
import type { AIName, AIResponse, Config } from "./types";
import { runClaude } from "./claude";
import { runGemini } from "./gemini";
import { runCodex } from "./codex";

const AI_RUNNERS: Record<AIName, (prompt: string) => Promise<AIResponse>> = {
  claude: runClaude,
  gemini: runGemini,
  codex: runCodex,
};

export async function runAI(ai: AIName, prompt: string): Promise<AIResponse> {
  const runner = AI_RUNNERS[ai];
  if (!runner) {
    throw new Error(`Unknown AI: ${ai}`);
  }
  return runner(prompt);
}

export async function runAllParallel(
  ais: AIName[],
  prompt: string
): Promise<AIResponse[]> {
  const promises = ais.map((ai) => runAI(ai, prompt));
  return Promise.all(promises);
}

export async function loadConfig(path: string): Promise<Config> {
  const file = Bun.file(path);
  const content = await file.text();
  return parse(content) as Config;
}

export function getDefaultConfig(): Config {
  return {
    orchestrator: { ai: "claude" },
    participants: ["claude", "gemini", "codex"],
    settings: {
      max_rounds: 10,
      timeout: 300,
    },
  };
}
