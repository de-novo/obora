export type AIName = "claude" | "gemini" | "codex";

export interface AIResponse {
  ai: AIName;
  content: string;
  raw: unknown;
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
