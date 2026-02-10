import {
  BaseAgent,
  BaseAgentConfig,
  AgentContext,
  Task,
  AgentRole,
  AnalystInput,
  AnalystOutput,
} from "./base-agent";

/**
 * Analyst 에이전트
 * 역할: 데이터 분석, 위험 평가, 패턴 인식
 *
 * 입력: AnalystInput
 * 출력: AnalystOutput
 */
export class AnalystAgent extends BaseAgent {
  constructor(config: Omit<BaseAgentConfig, "role">) {
    super({ ...config, role: AgentRole.ANALYST });
  }

  protected getDefaultSystemPrompt(): string {
    return `You are an expert analyst with deep expertise in data analysis, risk assessment, and pattern recognition.

Your responsibilities:
1. Analyze the provided information thoroughly
2. Identify key findings and patterns
3. Provide actionable recommendations
4. Assess confidence in your conclusions
5. Support your findings with reasoning

When providing analysis, structure your response as follows:
- Summary: A concise overview of your analysis
- Key Findings: Bullet points of important discoveries
- Recommendations: Actionable suggestions based on findings
- Confidence: A score from 0-100 indicating your certainty
- Reasoning: Your thought process and evidence

Be thorough, objective, and analytical in your approach.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const analysis = action as AnalystOutput;

    // 분석 결과를 지식 베이스에 저장
    context.board.write(`state.context.analysis_${this.id}_${Date.now()}`, analysis);

    // 이벤트 발행
    context.board.emit("analysis.completed", {
      agentId: this.id,
      result: analysis,
    });

    return analysis;
  }

  protected parseResponse(content: string, task: Task): AnalystOutput {
    // JSON 형식으로 파싱 시도
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return { type: "analysis", content, ...parsed } as AnalystOutput;
      }

      // JSON 블록 없으면 전체에서 파싱 시도
      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
      const parsed = JSON.parse(cleanContent);
      return { type: "analysis", content, ...parsed } as AnalystOutput;
    } catch {
      // 파싱 실패 시 기본 형식으로 변환
      return {
        type: "analysis",
        content,
        summary: content,
        keyFindings: [],
        recommendations: [],
        confidence: 0.5,
        reasoning: content,
      };
    }
  }
}

/**
 * 분석 에이전트 생성
 */
export function createAnalystAgent(id: string, llm: BaseAgentConfig["llm"]): AnalystAgent {
  return new AnalystAgent({ id, llm });
}
