/**
 * Orchestrator Type Definitions
 */

export interface AgentDefinition {
  name: string;
  description: string;
  allowedTools: string[];
  systemPrompt: string;
}

export interface WorkflowStep {
  agent: string;
  task: string;
  reason?: string;
}

export interface FeedbackLoop {
  enabled: boolean;
  maxIterations: number;
}

export interface WorkflowPlan {
  analysis: string;
  workflow: WorkflowStep[];
  feedbackLoop?: FeedbackLoop;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface SessionInfo {
  sessionId: string;
  startedAt: Date;
  cwd: string;
}
