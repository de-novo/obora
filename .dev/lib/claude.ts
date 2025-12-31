import type { AIResponse } from "./types";

export async function runClaude(prompt: string): Promise<AIResponse> {
  const proc = Bun.spawn([
    "claude",
    "-p", prompt,
    "--output-format", "json",
    "--strict-mcp-config",      // MCP 설정 무시 (빈 상태로)
    "--setting-sources", "",    // 유저/프로젝트 설정 무시
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
