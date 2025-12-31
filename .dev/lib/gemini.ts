import type { AIResponse } from "./types";

export async function runGemini(prompt: string): Promise<AIResponse> {
  const proc = Bun.spawn([
    "gemini",
    prompt,
    "-y",                // 자동 승인
    "-o", "json",        // JSON 출력
    "-e", "",            // 확장 비활성화
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Gemini failed: ${stderr}`);
  }

  const json = JSON.parse(output);

  return {
    ai: "gemini",
    content: json.response || "",
    raw: json,
  };
}
