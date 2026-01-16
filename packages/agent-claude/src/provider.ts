/**
 * Claude Agent Provider
 *
 * Claude SDK를 사용하여 AgentProvider 인터페이스 구현
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentProvider,
  AgentDefinition,
  AgentMessage,
  AgentRunOptions,
  TokenUsage,
} from "@obora/workflow-core";

export interface ClaudeProviderOptions {
  /** 최대 턴 수 (기본: 10) */
  maxTurns?: number;
  /** 설정 소스 (기본: ["project"]) */
  settingSources?: string[];
}

export class ClaudeAgentProvider implements AgentProvider {
  readonly name = "claude";
  private options: ClaudeProviderOptions;

  constructor(options: ClaudeProviderOptions = {}) {
    this.options = {
      maxTurns: options.maxTurns ?? 10,
      settingSources: options.settingSources ?? ["project"],
    };
  }

  async *runAgent(
    agent: AgentDefinition,
    task: string,
    cwd: string,
    options?: AgentRunOptions
  ): AsyncIterable<AgentMessage> {
    const fullPrompt = `${agent.systemPrompt}\n\n## 작업\n${task}`;

    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const message of query({
        prompt: fullPrompt,
        options: {
          cwd,
          allowedTools: agent.allowedTools,
          maxTurns: this.options.maxTurns ?? 10,
          settingSources: this.options.settingSources as ["project"],
        },
      })) {
        const msg = message as Record<string, unknown>;

        if (msg.type === "assistant") {
          const assistantMsg = msg.message as Record<string, unknown>;
          const content = assistantMsg?.content as Array<Record<string, unknown>>;

          // 토큰 사용량 추출
          const usage = assistantMsg?.usage as Record<string, number> | undefined;
          if (usage) {
            inputTokens += usage.input_tokens || 0;
            outputTokens += usage.output_tokens || 0;
            inputTokens += usage.cache_creation_input_tokens || 0;
            inputTokens += usage.cache_read_input_tokens || 0;
          }

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && typeof block.text === "string") {
                yield {
                  type: "text",
                  content: block.text,
                };
              } else if (block.type === "tool_use") {
                yield {
                  type: "tool_use",
                  content: "",
                  metadata: {
                    toolName: block.name as string,
                    toolInput: block.input as Record<string, unknown>,
                  },
                };
              }
            }
          }
        } else if (msg.type === "user") {
          const userMsg = msg.message as Record<string, unknown>;
          const content = userMsg?.content as Array<Record<string, unknown>>;

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_result") {
                yield {
                  type: "tool_result",
                  content: typeof block.content === "string" ? block.content : "",
                };
              }
            }
          }
        } else if (msg.type === "result") {
          const resultMsg = msg as Record<string, unknown>;

          if (resultMsg.is_error) {
            yield {
              type: "error",
              content: typeof resultMsg.result === "string" ? resultMsg.result : "Unknown error",
            };
          } else {
            const finalUsage = resultMsg.usage as Record<string, number> | undefined;
            const totalTokens = finalUsage?.total_tokens || (inputTokens + outputTokens);

            yield {
              type: "result",
              content: typeof resultMsg.result === "string" ? resultMsg.result : "",
              metadata: {
                tokens: {
                  inputTokens,
                  outputTokens,
                  totalTokens,
                },
              },
            };
          }
        }
      }
    } catch (error) {
      yield {
        type: "error",
        content: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * 간단한 일회성 쿼리 (워크플로우 없이)
 */
export async function simpleQuery(
  prompt: string,
  cwd: string,
  allowedTools: string[] = ["Read", "Glob", "Grep", "Bash"],
  onMessage?: (message: unknown) => void
): Promise<string> {
  let output = "";

  for await (const message of query({
    prompt,
    options: {
      cwd,
      allowedTools,
      maxTurns: 5,
      settingSources: ["project"],
    },
  })) {
    if (onMessage) {
      onMessage(message);
    }

    const msg = message as Record<string, unknown>;
    if (msg.type === "result" && typeof msg.result === "string") {
      output = msg.result;
    }
  }

  return output;
}
