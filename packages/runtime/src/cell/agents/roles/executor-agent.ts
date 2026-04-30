import { createAgentId } from "../../../blackboard/types/base.js";
import {
  BaseAgent,
  BaseAgentConfig,
  AgentContext,
  Task,
  AgentRole,
  ExecutorInput,
  ExecutorOutput,
} from "./base-agent";

interface ToolCtx {
  sessionId: string;
  agentId: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  permissions: Set<string>;
}

export interface ToolRegistryLike {
  listTools(): Array<{ name: string }>;
  execute(name: string, params: Record<string, unknown>, context: ToolCtx): Promise<unknown>;
}

/**
 * Executor 에이전트
 * 역할: 작업 실행, API 호출, 파일 처리
 *
 * 입력: ExecutorInput
 * 출력: ExecutorOutput
 */
export class ExecutorAgent extends BaseAgent {
  private toolRegistry?: ToolRegistryLike;

  constructor(
    config: Omit<BaseAgentConfig, "role"> & {
      toolRegistry?: ToolRegistryLike;
    }
  ) {
    super({ ...config, role: AgentRole.EXECUTOR });
    this.toolRegistry = config.toolRegistry;
  }

  protected getDefaultSystemPrompt(): string {
    const runtimeTools = ["file_write", "file_read", "file_list", "shell_exec"];
    const availableTools = this.toolRegistry
      ? [...new Set([...this.toolRegistry.listTools().map((t: { name: string }) => t.name), ...runtimeTools])].join(", ")
      : runtimeTools.join(", ");

    return `You are an executor agent responsible for taking action and executing tasks.

Your responsibilities:
1. Understand the task requirements clearly
2. Determine the best approach to complete the task
3. Execute the action using available tools
4. Report the outcome accurately
5. Handle errors gracefully

Available tools: ${availableTools}

When implementing a feature:
1. Use board_read to understand the task context
2. Use file_write to create actual source code files
3. Use shell_exec to run build/test commands
4. Use board_write to report what you created

IMPORTANT: Generate ACTUAL code files, not just descriptions. Use file_write for each source file.

Backend implementation requirement (critical):
- When the plan includes a backend server, you MUST create the server entry file (e.g., server.js or index.js) with actual Express/HTTP server code, not just a static frontend.
- Ensure the backend entry file starts a listening server on the required port and wires the API routes specified in the plan.

Tool invocation policy (critical):
- Always invoke tools via structured tool-calling API.
- Never emit XML/inline pseudo tool calls in plain text.
- Prefer file_write/file_read/file_list/shell_exec calls over descriptive prose when implementation is requested.

When planning execution, structure your response as follows:
- Action: What action will you take?
- Tool: Which tool will you use? (if applicable)
- Parameters: What parameters are needed for the tool?
- Steps: Break down the execution into steps
- Expected Outcome: What result do you expect?

Be precise, efficient, and safety-conscious in your execution.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const plan = action as ExecutorOutput;

    if (plan.tool && this.toolRegistry) {
      // 도구 레지스트리에서 도구 실행
      const toolContext: ToolCtx = {
        sessionId: context.sessionId,
        agentId: this.id,
        taskId: context.currentTask?.id,
        metadata: context.currentTask?.metadata,
        permissions: new Set(["*"]),
      };
      const toolResult = await this.toolRegistry.execute(
        plan.tool,
        (plan.parameters ?? {}) as Record<string, unknown>,
        toolContext,
      );

      // 실행 결과를 상태에 저장
      context.board.write(`state.execution.${this.id}.${Date.now()}`, {
        plan,
        toolResult,
        timestamp: new Date(),
      });

      // 도구 실행 결과를 반환
      return toolResult;
    }

    // 도구 없는 경우 기본 실행
    const result = {
      action: plan.action,
      steps: plan.steps,
      outcome: plan.expectedOutcome,
      timestamp: new Date(),
    };

    context.board.write(`state.execution.${this.id}.${Date.now()}`, {
      plan,
      result,
      timestamp: new Date(),
    });

    // 계획(ExecutorOutput)을 반환
    return plan;
  }

  protected parseResponse(content: string, task: Task): ExecutorOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        const { type: _type, ...safeParsed } = parsed as Record<string, unknown>;
        return { ...safeParsed, type: "execution", content } as ExecutorOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
      const parsed = JSON.parse(cleanContent);
      const { type: _type, ...safeParsed } = parsed as Record<string, unknown>;
      return { ...safeParsed, type: "execution", content } as ExecutorOutput;
    } catch {
      return {
        type: "execution",
        content,
        action: content,
        parameters: {},
        steps: [content],
        expectedOutcome: "Task execution",
      };
    }
  }

  /**
   * 도구 레지스트리 설정
   */
  setToolRegistry(registry: ToolRegistryLike): void {
    this.toolRegistry = registry;
  }
}

/**
 * 실행 에이전트 생성
 */
export function createExecutorAgent(
  id: string,
  llm: BaseAgentConfig["llm"],
  toolRegistry?: ToolRegistryLike
): ExecutorAgent {
  return new ExecutorAgent({ id: createAgentId(id), llm, toolRegistry });
}
