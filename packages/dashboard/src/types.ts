export interface FeatureStatus {
  name: string;
  workflow: string;
  status: string;
  currentStage?: string;
  updatedAt?: string;
  notes?: string;
}

export interface RealtimeEvent {
  type: "workflow" | "agent" | "tool" | "artifact" | "feature";
  payload: unknown;
  timestamp: string;
}
