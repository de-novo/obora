import type { AIResponse } from "./types";

export async function runCodex(prompt: string): Promise<AIResponse> {
  const proc = Bun.spawn(["codex", "exec", prompt, "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Codex failed: ${stderr}`);
  }

  // Codex outputs JSONL, find agent_message
  const lines = output.trim().split("\n");
  let content = "";

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.type === "item.completed" && json.item?.type === "agent_message") {
        content = json.item.text || "";
      }
    } catch {
      // skip non-JSON lines
    }
  }

  return {
    ai: "codex",
    content,
    raw: output,
  };
}
