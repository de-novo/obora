/**
 * Workflow Executor
 *
 * SDK를 사용하여 에이전트를 실행하고 워크플로우를 관리
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { loadAgents, formatAgentsForPlanner, getAgentByName, findProjectRoot } from "./agent-loader";
import type { AgentDefinition, AgentResult, WorkflowPlan } from "./types";
import type { WorkflowTracker } from "./tracker";
import type { WorkflowType } from "@obora/database";

/**
 * LLM 출력에서 JSON 추출
 *
 * 지원 형식:
 * 1. 코드 블록: ```json ... ``` 또는 ``json ... ``
 * 2. Raw JSON: { ... } 형태의 첫 번째 완전한 객체
 */
function extractJsonFromOutput(output: string): unknown | null {
  // 1. 코드 블록에서 추출 시도 (``json 또는 ```json)
  const jsonMatch = output.match(/`{2,3}json\n?([\s\S]*?)\n?`{2,3}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // 파싱 실패 시 raw JSON 추출 시도
    }
  }

  // 2. Raw JSON 객체 추출 (첫 번째 완전한 객체)
  const startIdx = output.indexOf("{");
  if (startIdx === -1) {
    return null;
  }

  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < output.length; i++) {
    if (output[i] === "{") depth++;
    else if (output[i] === "}") depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }

  if (depth !== 0) {
    return null;
  }

  try {
    return JSON.parse(output.slice(startIdx, endIdx));
  } catch {
    return null;
  }
}

// WorkflowPlan 스키마 정의
const WorkflowStepSchema = z.object({
  agent: z.string(),
  task: z.string(),
  reason: z.string().optional(),
});

const FeedbackLoopSchema = z.object({
  enabled: z.boolean(),
  maxIterations: z.number().int().min(0).max(10).default(3),
});

const WorkflowPlanSchema = z.object({
  analysis: z.string(),
  workflow: z.array(WorkflowStepSchema).min(1),
  feedbackLoop: FeedbackLoopSchema.optional(),
});

// Review 결과 스키마
const ReviewIssueSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  description: z.string(),
});

const ReviewResultSchema = z.object({
  issues: z.array(ReviewIssueSchema).default([]),
});

/**
 * 환경 변수 설정 (기존 값 보존)
 */
let originalOboraSession: string | undefined;

export function setOboraSession(): void {
  if (originalOboraSession === undefined) {
    originalOboraSession = process.env.OBORA_SESSION;
  }
  process.env.OBORA_SESSION = "true";
}

export function restoreOboraSession(): void {
  if (originalOboraSession === undefined) {
    delete process.env.OBORA_SESSION;
  } else {
    process.env.OBORA_SESSION = originalOboraSession;
  }
}

/**
 * 단일 에이전트 실행
 */
export async function runAgent(
  agent: AgentDefinition,
  task: string,
  cwd: string,
  onMessage?: (message: unknown) => void
): Promise<AgentResult> {
  // 프로젝트 루트에서 실행 (에이전트가 전체 프로젝트에 접근 가능하도록)
  const projectRoot = findProjectRoot(cwd);
  let output = "";
  let error: string | undefined;

  try {
    for await (const message of query({
      prompt: `${agent.systemPrompt}\n\n## 작업\n${task}`,
      options: {
        cwd: projectRoot,
        allowedTools: agent.allowedTools,
        maxTurns: 10,
        settingSources: ["project"], // 프로젝트의 .claude/rules/ 로드
      },
    })) {
      if (onMessage) {
        onMessage(message);
      }

      const msg = message as Record<string, unknown>;

      if (msg.type === "assistant") {
        const assistantMsg = msg.message as Record<string, unknown>;
        const content = assistantMsg?.content as Array<Record<string, unknown>>;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && typeof block.text === "string") {
              output += block.text;
            }
          }
        }
      } else if (msg.type === "result") {
        const resultMsg = msg as Record<string, unknown>;
        if (typeof resultMsg.result === "string") {
          output = resultMsg.result;
        }
        if (resultMsg.is_error) {
          error = typeof resultMsg.result === "string" ? resultMsg.result : "Unknown error";
        }
      }
    }

    return { success: !error, output, error };
  } catch (err) {
    return {
      success: false,
      output: "",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Planner를 통해 워크플로우 설계
 */
export async function planWorkflow(
  task: string,
  cwd: string,
  onMessage?: (message: unknown) => void
): Promise<WorkflowPlan> {
  // 에이전트 동적 로드
  const agents = loadAgents(cwd);
  const planner = getAgentByName(agents, "planner");

  if (!planner) {
    throw new Error("Planner agent not found in .claude/agents/");
  }

  // 사용 가능한 에이전트 목록 동적 생성
  const agentList = formatAgentsForPlanner(agents);

  const enhancedPrompt = `${planner.systemPrompt}

## 현재 사용 가능한 에이전트
${agentList}

## 사용자 요청
${task}

위 에이전트들을 사용하여 최적의 워크플로우를 설계하세요.
반드시 JSON 형식으로 출력하세요.`;

  const result = await runAgent(
    { ...planner, systemPrompt: enhancedPrompt },
    task,
    cwd,
    onMessage
  );

  // JSON 파싱 및 스키마 검증
  const jsonData = extractJsonFromOutput(result.output);

  if (jsonData) {
    const validated = WorkflowPlanSchema.safeParse(jsonData);
    if (validated.success) {
      return validated.data;
    }
    // 검증 실패 시 로깅 (개발용)
    if (process.env.DEBUG) {
      console.warn("WorkflowPlan validation failed:", validated.error.issues);
    }
  }

  return {
    analysis: result.output,
    workflow: [
      {
        agent: "explorer",
        task: task,
        reason: "기본 탐색",
      },
    ],
  };
}

/**
 * 전체 워크플로우 실행
 */
export async function executeWorkflow(
  task: string,
  cwd: string,
  options: {
    /** 워크플로우 타입 (DB 기록용) */
    workflowType?: WorkflowType;
    /** 워크플로우 트래커 (DB 기록용) */
    tracker?: WorkflowTracker;
    onPlanComplete?: (plan: WorkflowPlan) => void;
    onStepStart?: (step: { agent: string; task: string }, index: number) => void;
    onStepComplete?: (
      step: { agent: string; task: string },
      result: AgentResult,
      index: number
    ) => void;
    onMessage?: (message: unknown) => void;
  } = {}
): Promise<{ plan: WorkflowPlan; results: AgentResult[] }> {
  const { tracker, workflowType = "custom" } = options;

  // 에이전트 로드
  const agents = loadAgents(cwd);

  // 워크플로우 시작 기록
  tracker?.startWorkflow(workflowType, task.slice(0, 100), { task });

  try {
    // 1. Planner 실행
    const plan = await planWorkflow(task, cwd, options.onMessage);
    options.onPlanComplete?.(plan);

    // 계획 완료 기록
    tracker?.planCompleted(plan);

    const results: AgentResult[] = [];

    // 2. 워크플로우 순차 실행
    for (let i = 0; i < plan.workflow.length; i++) {
      const step = plan.workflow[i];
      const agent = getAgentByName(agents, step.agent);

      if (!agent) {
        const errorResult = {
          success: false,
          output: "",
          error: `Unknown agent: ${step.agent}`,
        };
        results.push(errorResult);
        tracker?.completeStep(i, errorResult);
        continue;
      }

      options.onStepStart?.(step, i);
      tracker?.startStep(i);

      const result = await runAgent(agent, step.task, cwd, options.onMessage);
      results.push(result);

      // 스텝 완료 및 에이전트 실행 기록
      tracker?.completeStep(i, result);
      tracker?.recordAgentRun(step.agent, result, i);

      options.onStepComplete?.(step, result, i);

      // 실패 시 중단
      if (!result.success) {
        tracker?.failWorkflow(result.error || "Step failed");
        break;
      }
    }

    // 3. 피드백 루프 (활성화된 경우)
    if (plan.feedbackLoop?.enabled) {
      const reviewerAgent = getAgentByName(agents, "reviewer");
      if (reviewerAgent) {
        let iterations = 0;
        const maxIterations = plan.feedbackLoop.maxIterations || 3;

        while (iterations < maxIterations) {
          const reviewResult = await runAgent(
            reviewerAgent,
            "이전 작업 결과를 검토하세요.",
            cwd,
            options.onMessage
          );

          // 리뷰어 에이전트 실행 기록
          tracker?.recordAgentRun("reviewer", reviewResult);

          // 이슈 파싱 및 스키마 검증
          const jsonData = extractJsonFromOutput(reviewResult.output);

          // Zod 스키마로 검증
          const validated = ReviewResultSchema.safeParse(jsonData);
          if (!validated.success) {
            break; // 검증 실패 시 종료
          }

          const review = validated.data;
          if (review.issues.length === 0) {
            break; // 이슈 없으면 종료
          }

          // critical 이슈만 수정
          const criticalIssues = review.issues.filter(
            (issue) => issue.severity === "critical"
          );
          if (criticalIssues.length === 0) {
            break;
          }

          // 수정 에이전트 재실행
          const fixAgent = getAgentByName(agents, "debugger");
          if (fixAgent) {
            const fixResult = await runAgent(
              fixAgent,
              `다음 이슈들을 수정하세요:\n${JSON.stringify(criticalIssues, null, 2)}`,
              cwd,
              options.onMessage
            );

            // 디버거 에이전트 실행 기록
            tracker?.recordAgentRun("debugger", fixResult);
          }

          iterations++;
        }
      }
    }

    // 워크플로우 완료 기록
    const allSuccess = results.every((r) => r.success);
    if (allSuccess) {
      tracker?.completeWorkflow({ resultsCount: results.length });
    } else {
      const lastError = results.find((r) => !r.success)?.error;
      tracker?.failWorkflow(lastError || "Workflow failed");
    }

    return { plan, results };
  } catch (error) {
    // 예외 발생 시 실패 기록
    tracker?.failWorkflow(error instanceof Error ? error.message : "Unknown error");
    throw error;
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
      settingSources: ["project"], // 프로젝트의 .claude/rules/ 로드
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
