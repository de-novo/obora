import { createAgentId } from "../../blackboard/types/base.js";
import {
  BaseAgent,
  BaseAgentConfig,
  AgentContext,
  Task,
  AgentRole,
  DirectorInput,
  DirectorOutput,
} from "./base-agent";

/**
 * Director 에이전트
 * 역할: 조율, 진행 관리, 합의 도출
 *
 * 입력: DirectorInput
 * 출력: DirectorOutput
 */
export class DirectorAgent extends BaseAgent {
  constructor(config: Omit<BaseAgentConfig, "role">) {
    super({ ...config, role: AgentRole.DIRECTOR });
  }

  protected getDefaultSystemPrompt(): string {
    return `You are a director agent responsible for coordinating activities and facilitating collaboration.

Your responsibilities:
1. Understand the overall goal and requirements
2. Coordinate between different agents and stakeholders
3. Facilitate discussions and consensus-building
4. Monitor progress and adjust plans as needed
5. Provide clear direction and guidance

When creating a coordination plan, structure your response as follows (JSON format):
{
  "type": "coordination",
  "content": "Description of the coordination plan",
  "agenda": "Main goal or purpose",
  "participants": ["participant1", "participant2", ...],
  "steps": [
    {
      "step": 1,
      "description": "First step description",
      "assignee": "who handles this step",
      "dependencies": [],
      "estimatedDuration": "time estimate"
    },
    ...
  ],
  "timeline": ["step1 timeline", "step2 timeline", ...],
  "expectedOutcome": "What should be achieved"
}

Key principles for effective coordination:
- Clear communication
- Inclusive participation
- Transparent decision-making
- Agile adaptation to changes
- Focus on results

Be diplomatic, organized, and results-oriented in your coordination.`;
  }

  protected async act(action: unknown, context: AgentContext): Promise<unknown> {
    const plan = action as DirectorOutput;

    // 조율 계획을 결정 섹션에 저장
    context.board.write(`decisions.coordination.${this.id}.${Date.now()}`, plan);

    // 이벤트 발행
    context.board.emit("coordination.started", {
      agentId: this.id,
      plan,
    });

    return plan;
  }

  protected parseResponse(content: string, task: Task): DirectorOutput {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        const { type: _type, ...safeParsed } = parsed as Record<string, unknown>;
        return { ...safeParsed, type: "coordination", content } as DirectorOutput;
      }

      const cleanContent = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
      const parsed = JSON.parse(cleanContent);
      const { type: _type, ...safeParsed } = parsed as Record<string, unknown>;
      return { ...safeParsed, type: "coordination", content } as DirectorOutput;
    } catch {
      return {
        type: "coordination",
        content,
        agenda: content,
        participants: [],
        steps: [],
        timeline: [],
        expectedOutcome: "Coordination complete",
      };
    }
  }

  /**
   * 투표 세션 시작
   */
  async startVotingSession(
    agendaId: string,
    participants: string[],
    context: AgentContext
  ): Promise<void> {
    context.board.write(`decisions.voting.${agendaId}`, {
      started: new Date(),
      participants,
      votes: {},
      status: "in-progress",
    });

    context.board.emit("voting.started", {
      agendaId,
      participants,
    });
  }

  /**
   * 투표 집계
   */
  async tallyVotes(agendaId: string, context: AgentContext): Promise<Record<string, number>> {
    const session = context.board.read<Record<string, unknown>>(`decisions.voting.${agendaId}`, {
      strict: false,
    });

    if (!session) {
      throw new Error(`Voting session ${agendaId} not found`);
    }
    if (session.status !== "completed") {
      throw new Error(`Voting session ${agendaId} not completed`);
    }

    return session.votes as Record<string, number>;
  }
}

/**
 * 디렉터 에이전트 생성
 */
export function createDirectorAgent(id: string, llm: BaseAgentConfig["llm"]): DirectorAgent {
  return new DirectorAgent({ id: createAgentId(id), llm });
}
