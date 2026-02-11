import {
  BaseAgent,
  BaseAgentConfig,
  AgentContext,
  Task,
  AgentRole,
  VerifierInput,
  VerifierOutput,
} from "./base-agent";

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
- Passed: Overall pass/fail status (true/false)
- Checks: List of specific verification checks performed
- Summary: Brief overview of the verification
- Issues: Detailed list of issues found, with severity levels
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
    const findings = Array.isArray(verification.findings) ? verification.findings : [];
    if (findings.some((f) => f.severity === "critical")) {
      context.board.emit("verification.critical", {
        agentId: this.id,
        findings: findings.filter((f) => f.severity === "critical"),
      });
    }

    return verification;
  }

  protected parseResponse(content: string, task: Task): VerifierOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return { type: "verification", content, ...parsed } as VerifierOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
      const parsed = JSON.parse(cleanContent);
      return { type: "verification", content, ...parsed } as VerifierOutput;
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
  return new VerifierAgent({ id, llm });
}
