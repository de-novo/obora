import {
  BaseAgent,
  BaseAgentConfig,
  AgentContext,
  Task,
  AgentRole,
  ExecutorInput,
  ExecutorOutput,
} from "./base-agent";
import { ToolRegistry } from "../tools";

/**
 * Executor 에이전트
 * 역할: 작업 실행, API 호출, 파일 처리
 *
 * 입력: ExecutorInput
 * 출력: ExecutorOutput
 */
export class ExecutorAgent extends BaseAgent {
  private toolRegistry?: ToolRegistry;

  constructor(
    config: Omit<BaseAgentConfig, "role"> & {
      toolRegistry?: ToolRegistry;
    }
  ) {
    super({ ...config, role: AgentRole.EXECUTOR });
    this.toolRegistry = config.toolRegistry;
  }

  protected getDefaultSystemPrompt(): string {
    const availableTools = this.toolRegistry
      ? this.toolRegistry
          .listTools()
          .map((t) => t.name)
          .join(", ")
      : "none";

    return `You are an executor agent responsible for taking action and executing tasks.

Your responsibilities:
1. Understand the task requirements clearly
2. Determine the best approach to complete the task
3. Execute the action using available tools
4. Report the outcome accurately
5. Handle errors gracefully

Available tools: ${availableTools}

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
      const toolResult = await this.toolRegistry.execute(plan.tool, plan.parameters);

      // 실행 결과를 상태에 저장
      context.board.write(`state.execution.${this.id}.${Date.now()}`, {
        plan,
        toolResult,
        timestamp: new Date(),
      });

      // 도구 실행 후에도 계획(ExecutorOutput)을 반환
      return plan;
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
        return { type: "execution", content, ...parsed } as ExecutorOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
      const parsed = JSON.parse(cleanContent);
      return { type: "execution", content, ...parsed } as ExecutorOutput;
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
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }
}

/**
 * 실행 에이전트 생성
 */
export function createExecutorAgent(
  id: string,
  llm: BaseAgentConfig["llm"],
  toolRegistry?: ToolRegistry
): ExecutorAgent {
  return new ExecutorAgent({ id, llm, toolRegistry });
}
