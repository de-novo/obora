/**
 * obora title-generate - 워크플로우 제목 자동 생성
 *
 * Stop hook에서 호출되어 현재 워크플로우의 제목을 LLM으로 생성합니다.
 */

import { defineCommand } from "citty";
import { consola } from "consola";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "pathe";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { simpleQuery } from "@obora/agent-claude";

const WORKFLOW_CONTEXT_PATH = join(homedir(), ".obora", "workflow-context.json");

interface WorkflowContext {
  current_workflow_id: string;
  current_prompt: string;
  session_id: string;
  timestamp: number;
}

export const titleGenerateCommand = defineCommand({
  meta: {
    name: "title-generate",
    description: "Generate meaningful workflow title using LLM",
  },
  args: {
    quiet: {
      type: "boolean",
      alias: "q",
      description: "Suppress output",
      default: false,
    },
  },
  async run({ args }) {
    const log = args.quiet ? () => {} : consola.info.bind(consola);

    // 1. 워크플로우 컨텍스트 파일 읽기
    if (!existsSync(WORKFLOW_CONTEXT_PATH)) {
      if (!args.quiet) {
        consola.warn("Workflow context not found, skipping title generation");
      }
      return;
    }

    let context: WorkflowContext;
    try {
      const content = await fs.readFile(WORKFLOW_CONTEXT_PATH, "utf-8");
      context = JSON.parse(content);
    } catch (error) {
      if (!args.quiet) {
        consola.error("Failed to parse workflow context:", error);
      }
      return;
    }

    const { current_workflow_id, current_prompt } = context;

    if (!current_workflow_id) {
      if (!args.quiet) {
        consola.warn("No workflow ID in context");
      }
      return;
    }

    // 2. LLM으로 제목 생성
    log("Generating workflow title...");

    const prompt = `다음 작업 요청을 보고 2-5단어의 간결한 제목을 생성하세요.

작업 요청: "${current_prompt}"

규칙:
- 한글로 작성
- 동사 + 목적어 형태 (예: "로그인 기능 구현", "버그 수정", "코드 리뷰")
- 10자 이내로 간결하게
- 제목만 출력, 다른 설명 없이

제목:`;

    try {
      const title = await simpleQuery(prompt, process.cwd());
      const cleanTitle = title.trim().replace(/^["']|["']$/g, "").slice(0, 50);

      if (!cleanTitle) {
        if (!args.quiet) {
          consola.warn("Empty title generated, skipping update");
        }
        return;
      }

      log(`Generated title: ${cleanTitle}`);

      // 3. update-workflow.sh 스크립트로 DB 업데이트
      const scriptPath = join(
        process.cwd(),
        ".claude/scripts/workflow/update-workflow.sh"
      );

      if (existsSync(scriptPath)) {
        try {
          execSync(`"${scriptPath}" "${current_workflow_id}" title "${cleanTitle}"`, {
            stdio: args.quiet ? "ignore" : "inherit",
          });
          log("Workflow title updated successfully");
        } catch (execError) {
          // 스크립트가 없으면 직접 sqlite3 호출
          const dbPath = join(homedir(), ".obora", "dashboard.db");
          if (existsSync(dbPath)) {
            const escapedTitle = cleanTitle.replace(/'/g, "''");
            execSync(
              `sqlite3 "${dbPath}" "UPDATE workflows SET name = '${escapedTitle}' WHERE id = '${current_workflow_id}';"`,
              { stdio: args.quiet ? "ignore" : "inherit" }
            );
            log("Workflow title updated via sqlite3");
          }
        }
      } else {
        // 스크립트 없으면 직접 sqlite3 호출
        const dbPath = join(homedir(), ".obora", "dashboard.db");
        if (existsSync(dbPath)) {
          const escapedTitle = cleanTitle.replace(/'/g, "''");
          execSync(
            `sqlite3 "${dbPath}" "UPDATE workflows SET name = '${escapedTitle}' WHERE id = '${current_workflow_id}';"`,
            { stdio: args.quiet ? "ignore" : "inherit" }
          );
          log("Workflow title updated via sqlite3");
        }
      }
    } catch (error) {
      if (!args.quiet) {
        consola.error("Failed to generate title:", error);
      }
    }
  },
});
