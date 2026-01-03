# Obora Roadmap

> Unified Runtime Implementation Plan

## Overview

```
현재 (v0.1)                      목표 (v1.0)
───────────────────────────────────────────────────────────────────
DebateEngine (단독)      →      Unified Runtime + Multiple Patterns
  └── Debate only                 ├── Debate
                                  ├── CrossCheck
                                  ├── Ensemble
                                  └── Workflow
```

---

## Phase 1: Foundation (Week 1-2)

> 새 런타임 기반 구축. 기존 DebateEngine 유지.

### 1.1 LLM Layer

```
packages/core/src/llm/
├── types.ts          # ChatModel, ChatRequest, ChatResponse, RunEvent
└── adapters/
    ├── anthropic.ts  # ClaudeProvider → ChatModel
    ├── openai.ts     # OpenAIProvider → ChatModel
    └── google.ts     # GeminiProvider → ChatModel
```

**Tasks:**
- [ ] `RunEvent` 타입 정의 (token, message, tool_call, usage, error, done)
- [ ] `ChatModel` 인터페이스 정의
- [ ] `ChatRequest` / `ChatResponse` 타입
- [ ] Anthropic adapter (기존 ClaudeProvider 래핑)
- [ ] OpenAI adapter
- [ ] Google adapter
- [ ] Adapter 단위 테스트

**Deliverable:** 기존 Provider를 통해 ChatModel로 LLM 호출 가능

---

### 1.2 Runtime Layer

```
packages/core/src/runtime/
├── types.ts          # Runnable, RunHandle, RunContext
├── context.ts        # RunContext factory
└── executor.ts       # AgentExecutor
```

**Tasks:**
- [ ] `Runnable<I,O>` 인터페이스
- [ ] `RunHandle<O>` (events + result + cancel)
- [ ] `RunContext` (abort, session, trace, budget)
- [ ] `AgentExecutor` 기본 구현
- [ ] Session/cost tracking 연동 (기존 session/ 활용)
- [ ] 스트리밍 테스트

**Deliverable:** AgentExecutor로 단일 에이전트 실행 가능 (스트리밍 포함)

---

## Phase 2: First Pattern (Week 3-4)

> CrossCheck 패턴으로 병렬 실행 검증

### 2.1 Pattern Infrastructure

```
packages/core/src/patterns/
├── types.ts          # Pattern<I,O>, PatternConfig
└── cross-check.ts    # CrossCheckPattern
```

**CrossCheck 패턴:**
```
Input ──┬──▶ Agent A ──┐
        ├──▶ Agent B ──┼──▶ Judge Agent ──▶ Validated Output
        └──▶ Agent C ──┘
```

**Tasks:**
- [ ] `Pattern<I,O>` 인터페이스
- [ ] `CrossCheckPattern` 구현
  - [ ] 병렬 실행 (Promise.all)
  - [ ] Judge agent 호출
  - [ ] 결과 병합
- [ ] 스트리밍 이벤트 전파
- [ ] E2E 테스트 (실제 LLM 호출)

**Deliverable:** CrossCheck 패턴 작동. 새 런타임 검증 완료.

---

### 2.2 Agent-Model Binding

```
packages/core/src/agents/
├── types.ts          # AgentSpec, ModelRef 추가
├── loader.ts         # 기존 + ModelRef 파싱
└── registry.ts       # AgentRegistry (새 파일)
```

**Tasks:**
- [ ] `ModelRef` 타입 (provider, model, fallbacks)
- [ ] `AgentSpec`에 `model` 필드 추가
- [ ] Agent markdown에서 model 파싱
- [ ] `AgentRegistry` 구현
- [ ] AgentExecutor와 연동

**Deliverable:** Agent 정의에서 모델 선택 가능

---

## Phase 3: Debate Migration (Week 5-6)

> 기존 DebateEngine을 새 런타임 위에서 실행

### 3.1 Debate as Pattern

```
packages/core/src/patterns/
├── types.ts
├── cross-check.ts
└── debate.ts         # DebatePattern (새 파일)
```

**Strategy:**
```
기존 DebateEngine              새 DebatePattern
─────────────────              ─────────────────
• Hardcoded phases      →      • DebatePhase[] config
• Own provider mgmt     →      • AgentExecutor 사용
• Own streaming         →      • RunHandle 사용
```

**Tasks:**
- [ ] `DebatePhase` 타입 (id, instruction, mode, speakerOrder)
- [ ] `DebatePattern` 구현
  - [ ] Phase 설정 기반 실행
  - [ ] AgentExecutor 호출
  - [ ] 기존 프롬프트 로직 유지
- [ ] 기존 DebateEngine과 결과 비교 테스트
- [ ] 스트리밍 동작 검증

**Deliverable:** DebatePattern이 기존 DebateEngine과 동일하게 작동

---

### 3.2 Backward Compatibility

**Tasks:**
- [ ] 기존 `DebateEngine` API 유지 (내부만 변경)
- [ ] 또는 `DebateEngine` deprecated + `DebatePattern` 권장
- [ ] CLI 명령어 호환성 유지
- [ ] 마이그레이션 가이드 문서

**Deliverable:** 기존 사용자 코드 변경 없이 업그레이드 가능

---

## Phase 4: Additional Patterns (Week 7-8)

> 패턴 확장으로 "Combination of AIs" 비전 실현

### 4.1 Ensemble Pattern

```
Input ──┬──▶ Agent A ──┐
        ├──▶ Agent B ──┼──▶ Aggregator ──▶ Combined Output
        └──▶ Agent C ──┘
```

**Tasks:**
- [ ] `EnsemblePattern` 구현
- [ ] Voting / weighted average 지원
- [ ] Confidence score 처리

### 4.2 Sequential Pattern

```
Input ──▶ Agent A ──▶ Agent B ──▶ Agent C ──▶ Output
```

**Tasks:**
- [ ] `SequentialPattern` 구현
- [ ] 중간 결과 전달
- [ ] 실패 시 중단/재시도 옵션

### 4.3 Parallel Pattern

```
Input ──┬──▶ Agent A ──▶ Output A
        ├──▶ Agent B ──▶ Output B
        └──▶ Agent C ──▶ Output C
```

**Tasks:**
- [ ] `ParallelPattern` 구현
- [ ] 독립 실행 + 결과 수집

---

## Phase 5: Workflow (Week 9-10)

> 패턴 조합으로 복잡한 워크플로우 구성

### 5.1 Workflow Engine

```
packages/core/src/workflow/
├── types.ts          # WorkflowSpec, Step
└── runner.ts         # WorkflowRunner
```

**Example Workflow:**
```yaml
name: code-review
steps:
  - pattern: parallel
    agents: [security-scanner, perf-analyzer]
  - pattern: debate
    agents: [reviewer-a, reviewer-b]
    config:
      mode: strong
  - pattern: ensemble
    agents: [summarizer]
```

**Tasks:**
- [ ] `WorkflowSpec` YAML 스키마
- [ ] `WorkflowRunner` 구현
- [ ] 패턴 조합 (nesting)
- [ ] 조건부 분기 (optional)

---

## Phase 6: Execution Modes (Week 11-12)

> Human-in-the-loop 지원을 위한 실행 모드 레이어

### 6.1 Mode Layer

```
packages/core/src/modes/
├── types.ts              # ExecutionMode, CheckpointEvent, InteractionController
├── withMode.ts           # Higher-order wrapper: withMode(pattern, config)
├── plan.ts               # Plan Mode: 계획 → 승인 → 실행
├── edit.ts               # Edit Mode: 변경 제안 → 승인
└── interactive.ts        # Interactive Mode: 대화형 체크포인트
```

**Key Interfaces:**
```typescript
// RunContext 확장
interface RunContext {
  interaction?: InteractionController
}

interface InteractionController {
  requestApproval(checkpoint: CheckpointRequest): Promise<CheckpointResponse>
}

// PatternEvent 확장
type CheckpointEvent =
  | { type: 'checkpoint_request'; checkpointId: string; kind: 'plan'|'edit'|'tool'; payload: unknown }
  | { type: 'checkpoint_resolved'; checkpointId: string; outcome: 'approved'|'rejected' }
```

**Tasks:**
- [ ] `InteractionController` 인터페이스 정의
- [ ] `CheckpointEvent` 타입 추가
- [ ] `withMode(pattern, config)` wrapper 구현
- [ ] Plan Mode 구현 (계획 → 승인 → 실행)
- [ ] Edit Mode 구현 (변경 제안 → 승인)
- [ ] Interactive Mode 구현 (대화형 체크포인트)
- [ ] CLI/Web 어댑터 (InteractionController 구현체)

**Design Principles:**
- 모드는 패턴과 직교 (orthogonal)
- `withMode(pattern)` wrapper로 패턴 순수성 유지
- `ctx.interaction`으로 human-in-the-loop 대기

---

## Milestones

| Milestone | Target | Key Deliverable |
|-----------|--------|-----------------|
| **M1** | Week 2 | llm/ + runtime/ 완성, AgentExecutor 작동 |
| **M2** | Week 4 | CrossCheck 패턴 출시 |
| **M3** | Week 6 | DebatePattern 마이그레이션 완료 |
| **M4** | Week 8 | Ensemble, Sequential, Parallel 패턴 |
| **M5** | Week 10 | Workflow 지원 |
| **M6** | Week 12 | Execution Modes, v1.0 출시 |

---

## Success Criteria

### Technical
- [ ] 모든 패턴이 `AgentExecutor`를 통해 실행
- [ ] 기존 DebateEngine 테스트 100% 통과 (DebatePattern으로)
- [ ] 스트리밍이 모든 패턴에서 작동
- [ ] Cost tracking이 모든 경로에서 자동

### User-Facing
- [ ] 새 패턴 추가가 1주일 이내 가능
- [ ] Agent 정의에서 모델 선택 가능
- [ ] CLI로 모든 패턴 실행 가능

---

## Non-Goals (v1.0)

- ❌ 실시간 협업 (WebSocket 기반 멀티유저)
- ❌ GUI/웹 인터페이스
- ❌ 자체 호스팅 모델 지원 (Ollama 등)
- ❌ 복잡한 DAG 워크플로우 (linear + parallel만)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| DebateEngine 마이그레이션 중 regression | Fixture 기반 테스트로 출력 비교 |
| 추상화가 패턴마다 안 맞음 | CrossCheck 먼저 구현해 parallel 검증 |
| Provider별 스트리밍 차이 | Adapter에서 정규화 |
| 마이그레이션 기간 중 두 시스템 유지 부담 | Phase 1-2는 새 코드만, 기존 코드 수정 최소화 |

---

*Created: 2026-01-04*
*Status: Active*
