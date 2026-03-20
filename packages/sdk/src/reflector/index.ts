// ── Analyzer ───────────────────────────────────────────────────────────
export type {
  ReflectorAnalyzer,
  AnalyzerContext,
  AnalyzerResult,
  SuggestedAction,
  AnalysisSummary,
  TrendDirection,
} from "./analyzer.js";
export {
  KeywordAnalyzer,
  SignatureAnalyzer,
  CategoryAnalyzer,
  TrendAnalyzer,
  createDefaultAnalyzers,
  detectTrend,
  extractKeywords,
  extractSignatures,
  extractCategories,
} from "./analyzer.js";

// ── Actions ────────────────────────────────────────────────────────────
export type {
  ReflectorAction,
  ActionExecutionContext,
  ActionResult,
  ActionHandler,
} from "./actions.js";
export {
  ActionRegistry,
  InjectContextHandler,
  ForceTargetHandler,
  SwitchModelHandler,
  AbortHandler,
  createDefaultActionRegistry,
} from "./actions.js";

// ── Rule Engine ────────────────────────────────────────────────────────
export type { RuleCondition, ReflectorRule } from "./rule-engine.js";
export { RuleEngine } from "./rule-engine.js";

// ── Knowledge Store ────────────────────────────────────────────────────
export type { KnowledgeEntry } from "./knowledge-store.js";
export { KnowledgeStore } from "./knowledge-store.js";

// ── Reflector Engine ───────────────────────────────────────────────────
export type { ReflectorOutput, ReflectorEngineOptions } from "./reflector-engine.js";
export { ReflectorEngine } from "./reflector-engine.js";
