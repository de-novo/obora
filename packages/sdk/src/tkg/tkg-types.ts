import type { ProjectableTKGEventType } from "./store.js";

export type TKGPromotionTrigger =
  | ProjectableTKGEventType
  | "execution_end";

export type TKGPromotionEvaluationMode =
  | "full_history"
  | "current_execution"
  | "latest_effective";

export type TKGConfidenceConflictMode =
  | "signal_only"
  | "review"
  | "blocking";
