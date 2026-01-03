# Obora Architecture Proposal

> Unified Runtime for "Combination of AIs"

## Visual Overview

### Current Architecture (Before)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @obora/core                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐        │
│  │      DebateEngine           │    │      AgentRunner            │        │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━   │    │  ━━━━━━━━━━━━━━━━━━━━━━━━   │        │
│  │  • 847 lines                │    │  • 655 lines                │        │
│  │  • Hardcoded phases         │    │  • TODO placeholders        │        │
│  │  • Own participant mgmt     │    │  • No LLM integration       │        │
│  │  • Own streaming logic      │    │  • Own session mgmt         │        │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘        │
│                 │                                   │                       │
│                 │  ┌────────────────────────────────┘                       │
│                 │  │                                                        │
│                 ▼  ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                      providers/                              │           │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │           │
│  │  │  Claude   │  │  OpenAI   │  │  Gemini   │                │           │
│  │  │ Provider  │  │ Provider  │  │ Provider  │                │           │
│  │  └───────────┘  └───────────┘  └───────────┘                │           │
│  │        │              │              │                       │           │
│  │        └──────────────┴──────────────┘                       │           │
│  │                       │                                      │           │
│  │              ┌────────┴────────┐                             │           │
│  │              │  Provider I/F   │  run(), stream()            │           │
│  │              └─────────────────┘                             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐                              │
│  │     skills/      │    │     agents/      │                              │
│  │  ━━━━━━━━━━━━━   │    │  ━━━━━━━━━━━━━   │                              │
│  │  SkillLoader     │    │  AgentLoader     │  ← Not used                  │
│  │  Skill types     │    │  Agent types     │    (Disconnected from Debate)│
│  └──────────────────┘    └──────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Problems:
  ❌ DebateEngine and AgentRunner are separate systems
  ❌ Adding new patterns (ensemble, cross-check) requires another Engine
  ❌ Agent definitions not used in Debate (participant ≠ agent)
  ❌ Duplicated execution/streaming logic
```

### Proposed Architecture (After)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @obora/core                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                        patterns/                             │           │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────┐ │           │
│  │  │   Debate    │ │ CrossCheck  │ │  Ensemble   │ │  ...   │ │           │
│  │  │   Pattern   │ │   Pattern   │ │   Pattern   │ │        │ │           │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────────┘ │           │
│  │         │               │               │                    │           │
│  │         └───────────────┴───────────────┘                    │           │
│  │                         │                                    │           │
│  │                implements Pattern<I,O>                       │           │
│  └─────────────────────────┬───────────────────────────────────┘           │
│                            │                                                │
│                            ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                       runtime/                               │           │
│  │  ┌─────────────────────────────────────────────────────────┐│           │
│  │  │                   AgentExecutor                         ││           │
│  │  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ││           │
│  │  │  • Single execution path                                ││           │
│  │  │  • Unified streaming                                    ││           │
│  │  │  • Session/cost tracking                                ││           │
│  │  └─────────────────────────────────────────────────────────┘│           │
│  │                                                              │           │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │           │
│  │  │  Runnable    │  │  RunHandle   │  │  RunContext  │       │           │
│  │  │  <I, O>      │  │  <O>         │  │              │       │           │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │           │
│  └─────────────────────────┬───────────────────────────────────┘           │
│                            │                                                │
│                            ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                         llm/                                 │           │
│  │  ┌─────────────────────────────────────────────────────────┐│           │
│  │  │                    ChatModel                            ││           │
│  │  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ││           │
│  │  │  • Provider-agnostic interface                          ││           │
│  │  │  • Normalized RunEvent stream                           ││           │
│  │  └─────────────────────────────────────────────────────────┘│           │
│  │                            │                                 │           │
│  │              ┌─────────────┼─────────────┐                   │           │
│  │              ▼             ▼             ▼                   │           │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │           │
│  │  │   Anthropic  │ │    OpenAI    │ │    Google    │         │           │
│  │  │   Adapter    │ │    Adapter   │ │    Adapter   │         │           │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘         │           │
│  └─────────┼────────────────┼────────────────┼─────────────────┘           │
│            │                │                │                              │
│            ▼                ▼                ▼                              │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                      providers/ (existing)                   │           │
│  │     ClaudeProvider    OpenAIProvider    GeminiProvider      │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐                              │
│  │     agents/      │    │     skills/      │                              │
│  │  ━━━━━━━━━━━━━   │    │  ━━━━━━━━━━━━━   │                              │
│  │  AgentSpec       │───▶│  PromptComposer  │                              │
│  │  • id, name      │    │  • system prompt │                              │
│  │  • ModelRef ─────┼───▶│  • + persona     │                              │
│  │  • skills[]      │    │  • + skills      │                              │
│  └──────────────────┘    └──────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Comparison

**Before: Separate Execution Paths**

```
User Request
     │
     ├──────────────────────────┬──────────────────────────┐
     ▼                          ▼                          ▼
┌─────────┐              ┌─────────────┐           ┌──────────────┐
│ Debate  │              │ AgentRunner │           │ Future ???   │
│ Engine  │              │ (broken)    │           │              │
└────┬────┘              └──────┬──────┘           └──────────────┘
     │                          │
     │  Different ways to       │  TODO state
     │  call Providers          │
     ▼                          ▼
┌─────────────────────────────────────┐
│           Providers                 │
└─────────────────────────────────────┘
```

**After: Single Execution Path**

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│                      Pattern Layer                       │
│  ┌────────┐  ┌────────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Debate │  │ CrossCheck │  │ Ensemble │  │ Custom  │ │
│  └────┬───┘  └─────┬──────┘  └────┬─────┘  └────┬────┘ │
│       └────────────┴──────────────┴─────────────┘      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼  All patterns use same path
┌─────────────────────────────────────────────────────────┐
│                    AgentExecutor                         │
│         (streaming, retry, timeout, cost tracking)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                       ChatModel                          │
│              (provider-agnostic interface)               │
└────────────────────────────┬────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Anthropic       OpenAI        Google
          Adapter        Adapter       Adapter
```

### Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| Execution paths | 2 (separate) | 1 (unified) |
| Adding new pattern | New Engine required | Just implement Pattern |
| Agent ↔ Model | Not connected | AgentSpec.ModelRef |
| Streaming | Each implements own | Unified via RunHandle |
| Cost tracking | DebateEngine only | All paths automatic |

---

## Executive Summary

Replace the disconnected "DebateEngine vs AgentRunner" with a **unified runtime + runnable graph**. Everything becomes a `Runnable` that produces a streaming event stream. Debate becomes one `Pattern` implementation that runs on the same `AgentExecutor` used by all other patterns.

---

## Current Problems

### 1. DebateEngine and AgentRunner are Disconnected
- DebateEngine has its own participant/provider management
- AgentRunner has invocation modes but no LLM integration (TODO placeholders)
- Code duplication and conceptual overlap

### 2. DebateEngine is Hardcoded
- Phases (initial, rebuttal, revised, consensus) are baked in
- Can't easily add cross-check or ensemble patterns
- Prompts are hardcoded strings

### 3. Agent/Skill Split is Confusing
- DebateEngine uses "participants" which are just (name, provider) pairs
- The Agent concept from AgentRunner isn't used in debates at all

### 4. Vision vs Implementation Gap
- Vision: "Combination of AIs" - flexible multi-AI patterns
- Reality: Hardcoded debate engine with separate unused AgentRunner

---

## Proposed Architecture

```
packages/core/src/
├── llm/                    # Unified model API (provider-agnostic)
│   ├── types.ts            # ChatModel, ChatRequest, ChatResponse
│   ├── adapters/           # Wrap existing providers
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   └── google.ts
│   └── registry.ts         # ModelRegistry
│
├── runtime/                # Execution + streaming + trace (THE UNIFIER)
│   ├── types.ts            # Runnable, RunHandle, RunEvent, RunContext
│   ├── executor.ts         # AgentExecutor
│   └── context.ts          # RunContext factory
│
├── agents/                 # "Who" runs (persona + model binding)
│   ├── types.ts            # AgentSpec, ModelRef, ModelSelector
│   ├── loader.ts           # Keep existing, output AgentSpec
│   └── registry.ts         # AgentRegistry
│
├── skills/                 # Reusable prompt modules
│   ├── types.ts            # Skill, SkillFrontmatter
│   ├── loader.ts           # Keep existing
│   └── composer.ts         # PromptComposer (merges system + persona + skills)
│
├── patterns/               # "How" multiple agents run
│   ├── types.ts            # Pattern<I,O> extends Runnable<I,O>
│   ├── debate.ts           # DebatePattern (keep existing logic)
│   ├── parallel.ts         # ParallelPattern
│   ├── sequential.ts       # SequentialPattern
│   ├── ensemble.ts         # EnsemblePattern
│   └── cross-check.ts      # CrossCheckPattern
│
├── workflow/               # Higher-level composition (optional)
│   ├── types.ts            # WorkflowSpec, Step
│   └── runner.ts           # WorkflowRunner
│
├── providers/              # Keep existing (wrapped by llm/adapters)
└── session/                # Keep existing (cost tracking)
```

---

## Key Type Definitions

### Unified Streaming Execution

```typescript
export type RunEvent =
  | { type: "token"; text: string; agentId?: string }
  | { type: "message"; message: ChatMessage; agentId?: string }
  | { type: "tool_call"; call: ToolCall; agentId?: string }
  | { type: "tool_result"; result: ToolResult; agentId?: string }
  | { type: "usage"; usage: Usage; agentId?: string; model: string; provider: string }
  | { type: "trace"; span: TraceSpan }
  | { type: "error"; error: unknown }
  | { type: "done" };

export interface RunHandle<O> {
  events(): AsyncIterable<RunEvent>;
  result(): Promise<O>;
  cancel?(reason?: string): void;
}

export interface RunContext {
  abort: AbortSignal;
  session: Session;
  trace: TraceSink;
  now(): number;
  budget?: Budget;
}
```

### Provider/Model Unification

```typescript
export type ProviderId = "openai" | "anthropic" | "google";

export interface ModelRef {
  provider: ProviderId;
  model: string;  // e.g. "gpt-4.1-mini", "claude-3.5-sonnet"
  defaultParams?: Record<string, unknown>;
  fallbacks?: Array<Omit<ModelRef, "fallbacks">>;
}

export interface ChatModel {
  readonly provider: ProviderId;
  readonly model: string;
  run(ctx: RunContext, req: ChatRequest): RunHandle<ChatResponse>;
}
```

### Agents (Persona + Model Binding)

```typescript
export interface AgentSpec {
  id: string;
  name: string;
  persona?: string;
  system?: string;
  skills?: string[];
  model: ModelRef | ModelSelector;
  tools?: ToolDefinition[];
}

export type ModelSelector = (args: {
  ctx: RunContext;
  agent: AgentSpec;
  task: { kind: string; input: unknown };
}) => ModelRef;
```

### The "One Execution Path"

```typescript
export interface Runnable<I, O> {
  run(ctx: RunContext, input: I): RunHandle<O>;
}

export class AgentExecutor implements Runnable<AgentExecutorInput, ChatResponse> {
  constructor(
    private agents: AgentRegistry,
    private models: ModelRegistry,
    private prompts: PromptComposer
  ) {}
  
  run(ctx: RunContext, input: AgentExecutorInput): RunHandle<ChatResponse> {
    // 1. Resolve agent -> AgentSpec
    // 2. Resolve model -> ChatModel
    // 3. Compose prompt (system + persona + skills)
    // 4. Execute with streaming
    // 5. Return RunHandle
  }
}
```

### Patterns as Data + Orchestrators

```typescript
export interface Pattern<I, O> extends Runnable<I, O> {
  readonly kind: string;
}

export interface DebatePhase {
  id: string;
  instruction: string;  // template-able
  mode: "parallel" | "sequential";
  speakerOrder?: string[];
}

export class DebatePattern implements Pattern<DebateInput, DebateOutput> {
  readonly kind = "debate";
  
  constructor(
    private exec: AgentExecutor,
    private phases: DebatePhase[]  // Configurable!
  ) {}
  
  run(ctx: RunContext, input: DebateInput): RunHandle<DebateOutput> {
    // Execute phases using AgentExecutor
    // Phases are DATA, not hardcoded
  }
}
```

---

## Composability

Patterns accept other `Runnable`s or contain steps:

```typescript
// Debate within a workflow
new SequentialPattern([
  new LLMStep("analyze"),
  new DebatePattern(exec, strongDebatePhases),
  new EnsemblePattern(exec, { aggregator: "synthesizer" })
])

// Parallel branches with merge
new ParallelPattern({
  branches: {
    security: new AgentStep("security-reviewer"),
    performance: new AgentStep("perf-analyst")
  },
  merge: new AgentStep("report-generator")
})
```

---

## Migration Path

### Phase 1: Introduce `llm/ChatModel` + Adapters (No Behavior Change)
- Wrap existing provider clients to emit `RunEvent`s
- Tie `usage` events into existing `session/` cost tracking

### Phase 2: Implement `runtime/` + `AgentExecutor`
- Single way to run an agent with streaming
- Keep current DebateEngine untouched initially

### Phase 3: Bridge DebateEngine to Runtime (Adapter)
- Create `DebatePatternV0` that wraps existing DebateEngine
- Sources participants from `AgentSpec`, uses `ChatModel`
- Goal: Debate is now "just another Runnable"

### Phase 4: Extract Debate Prompts/Phases
- Move hardcoded strings into phase config/templates
- Once phases are data, adding patterns is trivial

### Phase 5: Rebuild AgentRunner on `AgentExecutor`
- Delete TODO placeholders
- AgentRunner becomes thin wrapper or removed entirely

### Phase 6: Add New Patterns Incrementally
- `ParallelPattern`, `SequentialPattern` (easy wins)
- `CrossCheckPattern` (independent answers + judge)
- `EnsemblePattern` (N answers + aggregator)

---

## Key Benefits

| Before | After |
|--------|-------|
| Two disconnected systems | One unified runtime |
| Debate-only | Any pattern (debate, ensemble, cross-check) |
| Provider in DebateEngine | Agent owns model choice |
| Hardcoded phases | Configurable phase data |
| Can't compose patterns | Full composability |

---

## Design Rationale

1. **`Runnable + RunHandle` as core abstraction**: Forces every feature to share streaming, cancellation, tracing, and cost accounting.

2. **Patterns as orchestrators, not engines**: Pattern code doesn't know about providers; it schedules agent executions and merges results.

3. **Agents own model choice**: Aligns with vision (Agent + Model). Swap `ModelRef` per agent, or use a selector for cost optimization.

4. **Keep debate value via adapter**: Preserves working logic while incrementally refactoring into reusable pieces.

5. **Skills remain as prompt fragments**: Agents are "who", skills are "reusable instructions", patterns are "how".

---

## References

- **LangGraph/LangChain**: Runnable model, streaming surfaces
- **Microsoft AutoGen**: Multi-agent orchestration patterns
- **Semantic Kernel**: Separating prompt assets from orchestration
- **DSPy**: Programmatic prompting + evaluation loops
- **OpenAI Swarm**: Lightweight agent handoffs

---

## Debate Conclusions (2026-01-04)

An Obora debate was run on this proposal with Claude and OpenAI. Key outcomes:

### Position Changes

| Participant | Initial Position | Final Position |
|-------------|-----------------|----------------|
| Claude | REJECT (incremental enhancement) | ADOPT with staged implementation |
| OpenAI | ADOPT with modifications | ADOPT with staged implementation |

### Consensus Points

1. **Unified runtime is necessary** - Keeping DebateEngine + AgentRunner separate will entrench architectural debt
2. **Start with parallel pattern (cross-check)** - Proves abstraction works for both parallel and sequential
3. **Delay Pattern<I,O> formalization** - Extract only after two working patterns exist
4. **Maintain debate quality during migration** - Use fixture-based tests for behavior parity

### Unresolved Disagreements

1. **Parallel-first vs sequential-first** - Risk that parallel-first executor may bias against sequential debate patterns
2. **Minimal interface complexity** - Concern that `RunHandle` may become a grab-bag of pattern-specific metadata
3. **Resource allocation** - Tension between building new patterns vs improving existing debate reliability

### Recommended Implementation Order

Based on debate consensus:

1. **Month 1**: Build AgentExecutor with cross-check pattern (parallel execution)
2. **Month 2**: Adapt DebateEngine to use AgentExecutor (proves both sequential and parallel)
3. **Month 3**: Extract Pattern<I,O> based on two proven implementations

### Key Risks Identified

- **Provider-specific behaviors**: Different streaming semantics across providers may require shims
- **Operational parity**: New runtime must match debate's production behaviors (timeouts, retries, observability)
- **Abstraction leaks**: Cross-check needs confidence scores, debate needs citations - may fragment interface

---

*Proposed: 2026-01-04*
*Status: Debated - Ready for Implementation Planning*
*Debate Duration: 158.8s*
*Transcript: docs/research/ARCHITECTURE_DEBATE_2026-01-03.json*
