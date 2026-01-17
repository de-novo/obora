/**
 * obora chat - 대화형 워크플로우 오케스트레이터
 *
 * SDK를 통해 Claude Code를 실행하고 워크플로우를 강제합니다.
 */

import { defineCommand } from "citty";
import { consola } from "consola";
import { createInterface } from "node:readline";
import { loadAgents, getTracker } from "@obora/workflow-core";
import { simpleQuery } from "@obora/agent-claude";
import { executeWorkflow } from "../utils/workflow-runner";
import { setOboraSession } from "../utils/session";

// OBORA_SESSION 환경 변수 설정 (훅에서 체크)
setOboraSession();

export const chatCommand = defineCommand({
  meta: {
    name: "chat",
    description: "Interactive workflow orchestrator (enforces agent workflows)",
  },
  args: {
    simple: {
      type: "boolean",
      alias: "s",
      description: "Simple mode - skip workflow planning",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    // 에이전트 로드 확인
    const agents = loadAgents(cwd);
    if (agents.size === 0) {
      consola.error("No agents found in .claude/agents/");
      consola.info("Make sure you are in a project with .claude/agents/ directory");
      process.exit(1);
    }

    // 트래커 초기화 및 세션 시작 (ProjectService 통합)
    const tracker = getTracker();
    await tracker.initialize(cwd);

    const project = tracker.getProject();
    tracker.startSession();

    // 프로젝트 정보 표시
    const projectInfo = project
      ? `Project: ${project.name} (${project.identifiedBy})`
      : "Project: Unknown";

    consola.box({
      title: "Obora Orchestrator",
      message: `${projectInfo}\nLoaded ${agents.size} agents\nWorkflow enforcement: ${args.simple ? "OFF (simple mode)" : "ON"}`,
    });

    console.log("\nType your task or question. Type 'exit' to quit.\n");

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = () => {
      rl.question("\x1b[36mYou:\x1b[0m ", async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          prompt();
          return;
        }

        if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
          console.log("\nGoodbye!");
          tracker.completeSession();
          rl.close();
          process.exit(0);
        }

        try {
          if (args.simple) {
            // 심플 모드: 워크플로우 없이 직접 실행
            console.log("\n\x1b[33m[Simple Mode]\x1b[0m Processing...\n");

            const result = await simpleQuery(trimmed, cwd, undefined, (msg) => {
              const m = msg as Record<string, unknown>;
              if (m.type === "assistant") {
                const assistantMsg = m.message as Record<string, unknown>;
                const content = assistantMsg?.content as Array<Record<string, unknown>>;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === "tool_use") {
                      console.log(`\x1b[90m  [Tool: ${block.name}]\x1b[0m`);
                    }
                  }
                }
              }
            });

            console.log(`\n\x1b[32mAssistant:\x1b[0m ${result}\n`);
          } else {
            // 워크플로우 모드: planner → agents → feedback loop
            console.log("\n\x1b[33m[Orchestrator]\x1b[0m Planning workflow...\n");

            const { results } = await executeWorkflow(trimmed, cwd, {
              tracker,
              workflowType: "custom",
              onPlanComplete: (p) => {
                console.log(`\x1b[34m[Plan]\x1b[0m ${p.analysis}\n`);
                console.log("\x1b[34mWorkflow:\x1b[0m");
                p.workflow.forEach((step, i) => {
                  console.log(`  ${i + 1}. ${step.agent}: ${step.task}`);
                });
                if (p.feedbackLoop?.enabled) {
                  console.log(`\n  Feedback loop: enabled (max ${p.feedbackLoop.maxIterations} iterations)`);
                }
                console.log();
              },
              onStepStart: (step, i) => {
                console.log(`\x1b[33m[Step ${i + 1}]\x1b[0m Running ${step.agent}...`);
              },
              onStepComplete: (step, result) => {
                const status = result.success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
                console.log(`${status} ${step.agent} completed`);
                if (!result.success && result.error) {
                  console.log(`  \x1b[31mError: ${result.error}\x1b[0m`);
                }
              },
            });

            // 최종 결과 출력
            const lastResult = results[results.length - 1];
            if (lastResult?.output) {
              console.log(`\n\x1b[32m[Result]\x1b[0m\n${lastResult.output}\n`);
            }
          }
        } catch (error) {
          consola.error("Error:", error instanceof Error ? error.message : error);
        }

        prompt();
      });
    };

    prompt();
  },
});
