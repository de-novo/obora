export type AIName = "claude" | "gemini" | "codex";

export interface AIResponse {
  ai: AIName;
  content: string;
  raw: unknown;
}

// Orchestrator Function Call 타입
export interface OrchestratorAction {
  action: "select" | "end" | "request_vote";
  target?: AIName;           // select 시 발언할 AI
  reason?: string;           // 선택 이유
  conclusion?: string;       // end 시 결론
}

export interface ParticipantVote {
  action: "request" | "pass";
  urgency?: "high" | "medium" | "low";
  topic?: string;            // 발언하고 싶은 주제
}

export interface Config {
  orchestrator: {
    ai: AIName;
  };
  participants: AIName[];
  settings: {
    max_rounds: number;
    timeout: number;
  };
}

export interface Message {
  role: "user" | "orchestrator" | AIName;
  content: string;
}

export interface DebateState {
  topic: string;
  history: Message[];
  round: number;
  speakCounts: Record<AIName, number>;
}
