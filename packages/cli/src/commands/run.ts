/**
 * obora run - 일회성 작업 실행
 *
 * SDK를 통해 워크플로우를 실행하고 결과를 반환합니다.
 */

import { defineCommand } from "citty";
import { consola } from "consola";
import { executeWorkflow, simpleQuery, loadAgents, setOboraSession, getTracker } from "../orchestrator";

// OBORA_SESSION 환경 변수 설정 (훅에서 체크)
setOboraSession();

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Execute a single task with workflow enforcement",
  },
  args: {
    task: {
      type: "positional",
      description: "Task to execute",
      required: true,
    },
    simple: {
      type: "boolean",
      alias: "s",
      description: "Simple mode - skip workflow planning",
      default: false,
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show detailed output",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const task = args.task as string;

    // 에이전트 로드 확인
    const agents = loadAgents(cwd);
    if (agents.size === 0) {
      consola.error("No agents found in .claude/agents/obora/");
      consola.info("Run 'obora init' to set up the project");
      process.exit(1);
    }

    // 트래커 초기화 (ProjectService 통합)
    const tracker = getTracker();
    await tracker.initialize(cwd);

    const project = tracker.getProject();
    tracker.startSession();

    if (args.verbose) {
      if (project) {
        consola.info(`Project: ${project.name} (${project.identifiedBy})`);
      }
      consola.info(`Loaded ${agents.size} agents`);
      consola.info(`Task: ${task}`);
      consola.info(`Mode: ${args.simple ? "simple" : "workflow"}`);
    }

    try {
      if (args.simple) {
        // 심플 모드
        consola.start("Executing task (simple mode)...");

        const result = await simpleQuery(task, cwd, undefined, (msg) => {
          if (args.verbose) {
            const m = msg as Record<string, unknown>;
            if (m.type === "assistant") {
              const assistantMsg = m.message as Record<string, unknown>;
              const content = assistantMsg?.content as Array<Record<string, unknown>>;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "tool_use") {
                    consola.info(`Tool: ${block.name}`);
                  }
                }
              }
            }
          }
        });

        consola.success("Task completed");
        console.log("\n" + result);
        tracker.completeSession();
      } else {
        // 워크플로우 모드
        consola.start("Planning workflow...");

        let workflowLength = 0;
        const { plan, results } = await executeWorkflow(task, cwd, {
          tracker,
          workflowType: "custom",
          onPlanComplete: (p) => {
            workflowLength = p.workflow.length;
            consola.success(`Plan: ${p.analysis}`);
            if (args.verbose) {
              console.log("\nWorkflow steps:");
              p.workflow.forEach((step, i) => {
                console.log(`  ${i + 1}. ${step.agent}: ${step.task}`);
              });
              console.log();
            }
          },
          onStepStart: (step, i) => {
            consola.start(`[${i + 1}/${workflowLength}] ${step.agent}`);
          },
          onStepComplete: (step, result) => {
            if (result.success) {
              consola.success(`${step.agent} completed`);
            } else {
              consola.error(`${step.agent} failed: ${result.error}`);
            }
          },
        });

        // 결과 요약
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        console.log();
        if (failed === 0) {
          consola.success(`Workflow completed: ${succeeded} steps succeeded`);
          tracker.completeSession();
        } else {
          consola.warn(`Workflow completed: ${succeeded} succeeded, ${failed} failed`);
          tracker.failSession();
        }

        // 최종 결과
        const lastResult = results[results.length - 1];
        if (lastResult?.output) {
          console.log("\n--- Result ---\n");
          console.log(lastResult.output);
        }
      }
    } catch (error) {
      tracker.failSession();
      consola.error("Execution failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  },
});
