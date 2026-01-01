import type { AIResponse, OrchestratorAction, ParticipantVote } from "./types";

// JSON Schema 정의
const ORCHESTRATOR_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    action: { enum: ["select", "end", "request_vote"] },
    target: { type: "string", description: "선택된 AI 이름 (gemini, codex, claude)" },
    reason: { type: "string", description: "선택/결정 이유" },
    conclusion: { type: "string", description: "토론 결론 (end 시 필수)" }
  },
  required: ["action"]
});

const PARTICIPANT_VOTE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    action: { enum: ["request", "pass"] },
    urgency: { enum: ["high", "medium", "low"] },
    topic: { type: "string", description: "발언하고 싶은 주제" }
  },
  required: ["action"]
});

export async function runClaude(prompt: string): Promise<AIResponse> {
  const proc = Bun.spawn([
    "claude",
    "-p", prompt,
    "--output-format", "json",
    "--strict-mcp-config",
    "--setting-sources", "",
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Claude failed: ${stderr}`);
  }

  const json = JSON.parse(output);

  return {
    ai: "claude",
    content: json.result || "",
    raw: json,
  };
}

// Orchestrator용 (Haiku로 빠른 판단)
export async function runClaudeOrchestrator(prompt: string): Promise<OrchestratorAction> {
  const proc = Bun.spawn([
    "claude",
    "-p", prompt,
    "--model", "haiku",           // 빠른 판단을 위해 Haiku 사용
    "--output-format", "json",
    "--json-schema", ORCHESTRATOR_SCHEMA,
    "--strict-mcp-config",
    "--setting-sources", "",
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Claude Orchestrator failed: ${stderr}`);
  }

  const json = JSON.parse(output);
  return json.structured_output as OrchestratorAction;
}

// 발언권 투표용 (구조화된 응답)
export async function runClaudeVote(prompt: string): Promise<ParticipantVote> {
  const proc = Bun.spawn([
    "claude",
    "-p", prompt,
    "--output-format", "json",
    "--json-schema", PARTICIPANT_VOTE_SCHEMA,
    "--strict-mcp-config",
    "--setting-sources", "",
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Claude Vote failed: ${stderr}`);
  }

  const json = JSON.parse(output);
  return json.structured_output as ParticipantVote;
}
