import { createAgentId } from "../../../blackboard/types/base.js";
import {
  BaseAgent,
  BaseAgentConfig,
  AgentContext,
  Task,
  AgentRole,
  VerifierOutput,
} from "./base-agent";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Verifier 에이전트
 * 역할: 결과 검증, 품질 체크, 정확성 확인
 *
 * 입력: VerifierInput
 * 출력: VerifierOutput
 */
export class VerifierAgent extends BaseAgent {
  constructor(config: Omit<BaseAgentConfig, "role">) {
    super({ ...config, role: AgentRole.VERIFIER });
  }

  protected getDefaultSystemPrompt(): string {
    return `You are a verifier agent responsible for validating results and ensuring quality.

Your responsibilities:
1. Review the provided work thoroughly
2. Check against requirements and specifications
3. Identify any issues or discrepancies
4. Provide specific feedback for improvements
5. Verify correctness and completeness

When conducting verification, structure your response as follows:
- Type: Must be "verification"
- Passed: Overall pass/fail status (true/false)
- Score: Numeric quality score (0-100)
- Checks: List of specific verification checks performed
- Findings: Detailed list of findings, with severity levels
- Suggestions: Recommendations for improvement

Issue severity levels:
- Critical: Must be fixed before proceeding
- High: Should be fixed soon
- Medium: Can be addressed later
- Low: Minor improvements or suggestions

Be thorough, objective, and constructive in your verification.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const verification = action as VerifierOutput;

    // 검증 결과를 지식 베이스에 저장
    context.board.write(`knowledge.verification.${this.id}.${Date.now()}`, verification);

    // 이벤트 발행
    context.board.emit("verification.completed", {
      agentId: this.id,
      result: verification,
    });

    // Critical 이슈가 있는 경우 경고 이벤트
    const findings = Array.isArray(verification.findings)
      ? verification.findings.filter((f): f is VerifierOutput["findings"][number] => {
          if (!isRecord(f)) {
            return false;
          }
          return (
            typeof f.id === "string" &&
            typeof f.type === "string" &&
            typeof f.description === "string" &&
            typeof f.severity === "string"
          );
        })
      : [];
    const criticalFindings = findings.filter(
      (f) => String(f.severity).trim().toLowerCase() === "critical"
    );
    if (criticalFindings.length > 0) {
      context.board.emit("verification.critical", {
        agentId: this.id,
        findings: criticalFindings,
      });
    }

    return verification;
  }

  protected parseResponse(content: string, task: Task): VerifierOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      const raw = jsonMatch ? jsonMatch[1] : content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
      const parsedRaw = JSON.parse(raw) as unknown;
      if (!isRecord(parsedRaw)) {
        throw new Error("Verifier response must be an object");
      }
      const parsed = parsedRaw;

      const scoreRaw = parsed.score;
      const numericScore =
        typeof scoreRaw === "number"
          ? scoreRaw
          : typeof scoreRaw === "string"
            ? Number(scoreRaw)
            : 0;
      const score = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0;

      const checks = Array.isArray(parsed.checks)
        ? parsed.checks.filter((item): item is VerifierOutput["checks"][number] => {
            if (!isRecord(item)) {
              return false;
            }
            return (
              typeof item.name === "string" &&
              typeof item.description === "string" &&
              typeof item.evidence === "string" &&
              (item.status === "passed" || item.status === "failed" || item.status === "skipped")
            );
          })
        : [];
      const rawFindings = Array.isArray(parsed.findings)
        ? parsed.findings
        : Array.isArray(parsed.issues)
          ? parsed.issues
          : [];
      const findings = rawFindings.filter((item): item is VerifierOutput["findings"][number] => {
        if (!isRecord(item)) {
          return false;
        }
        return (
          typeof item.id === "string" &&
          typeof item.type === "string" &&
          typeof item.description === "string" &&
          typeof item.severity === "string"
        );
      });
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter((item): item is string => typeof item === "string")
        : [];
      const passed = typeof parsed.passed === "boolean" ? parsed.passed : false;

      return {
        type: "verification",
        content,
        passed,
        score,
        checks,
        findings,
        suggestions,
      };
    } catch {
      return {
        type: "verification",
        content,
        passed: false,
        score: 0,
        checks: [],
        findings: [],
        suggestions: [],
      };
    }
  }
}

/**
 * 검증 에이전트 생성
 */
export function createVerifierAgent(id: string, llm: BaseAgentConfig["llm"]): VerifierAgent {
  return new VerifierAgent({ id: createAgentId(id), llm });
}
