# Obora Execution Trace 설계

## 문제의식

현재 Obora에서 각 step은 블랙박스입니다. 다음 step은 이전 step의 output 문자염만 받고, **어떤 과정을 거쳤는지, 어떤 가정과 제약이 있는지 전혀 모릅니다**.

```yaml
# 현재
steps:
  - name: planning
    agent: product-manager
    # output: "계획서 내용..."
    
  - name: architecture
    agent: architect
    depends_on: [planning]
    # 아는 것: "계획서 내용..." 문자염뿐
    # 모르는 것: 
    #   - 사용자 인터뷰 5건을 통해 도출
    #   - 경쟁사 A, B 분석 후 차별화 전략 수립
    #   - MVP 범위는 기술적 제약으로 3개 기능으로 제한
    #   - 모바일 우선 가정
```

## 해결 방향

각 step 완료 시 **Execution Trace**를 자동 생성하여 공유 메모리에 저장하고, 다음 step은 이를 참조하여 upstream의 맥락(의사결정, 가정, 제약, 방법론)을 이해합니다.

## Execution Trace Schema

```typescript
interface ExecutionTrace {
  // 기본 정보
  step: string;                    // 스텝 이름
  agent: string;                   // 사용한 에이전트
  timestamp: string;               // 완료 시간
  
  // 작업 내역 (상세)
  task_summary: string;            // 수행한 작업 요약 (5-10문장)
  methodology: string;             // 사용한 방법론/접근법
  tools_used: string[];            // 사용한 도구/툴들
  
  // 의사결정 및 사고
  key_decisions: string[];         // 핵심 결정사항들
  decision_rationale: string;      // 결정의 근거
  alternatives_considered: string[]; // 고려했던 대안들
  
  // 가정 및 제약
  assumptions: string[];           // 가정한 것들
  constraints: string[];           // 제약사항들
  risks_identified: string[];      // 식별한 리스크
  
  // 입력 및 참조
  inputs_processed: string[];      // 처리한 주요 입력
  dependencies_used: Array<{
    step: string;
    purpose: string;               // 어떤 목적으로 사용했는지
  }>;
  
  // 결과 및 산출물
  output_summary: string;          // 출력물 요약
  output_format: string;           // 출력 형태 (markdown, json, code 등)
  artifacts_created: string[];     // 생성된 아티팩트 경로
  metrics?: Record<string, unknown>; // 측정 가능한 지표
  
  // 품질 및 이슈
  issues_encountered: string[];    // 마주친 문제/장애물
  workarounds_applied: string[];   // 적용한 해결책
  confidence_level: "high" | "medium" | "low";
  known_limitations: string[];     // 알려진 한계점
  
  // 연속성 (다음 단계를 위한 정보)
  implications_for_next: string[]; // 다음 단계에 미치는 영향
  recommended_next: string[];      // 추천하는 다음 작업
  open_questions: string[];        // 해결되지 않은 질문
  context_for_successors: string;  // 후속 작업자를 위한 핵심 맥락
}
```

## 저장 방식

### 1. 메모리 내 (기본)
```typescript
// execution.outputs 확장
execution.outputs[stepName] = {
  output: rawOutput,
  trace: executionTrace       // ← 자동 생성
}
```

### 2. 파일 기반 공유 메모리 (선택)
```yaml
# workflow 설정
sharedMemory:
  enabled: true
  adapter: file
  file:
    basePath: ./shared
    tracesDir: ./shared/traces   # ← trace 저장 경로
```

```markdown
# shared/traces/planning.md
## Execution Trace: planning

**Agent:** product-manager  
**Timestamp:** 2026-05-17T10:00:00Z

### Task Summary
사용자 인터뷰 5건을 실시하고...

### Key Decisions
- MVP 범위를 3개 기능으로 제한 (기술적 제약 고려)
- 모바일 우선 전략 채택

### Assumptions
- 사용자는 기술에 익숙함
- 2주 내 MVP 출품 가능

### Implications for Next
- 아키텍처 설계 시 확장성 고려 필요
- API 설계는 모바일 최적화 필요
```

### 3. 데이터베이스 (고급)
```yaml
sharedMemory:
  enabled: true
  adapter: sqlite
  sqlite:
    path: ./data/obora.db
    tracesTable: execution_traces
```

## 자동 생성 방식

### Option A: System Prompt에 요청 (권장)
```
[Execution Trace Requirements]
작업 완료 후, 반드시 다음 JSON 형식의 execution_trace를 제공하세요:
{
  "task_summary": "...",
  "key_decisions": ["..."],
  "assumptions": ["..."],
  ...
}
```

**장점:** 에이전트가 작업을 수행하면서 자연스럽게 trace 생성, 컨텍스트 최적화 가능  
**단점:** 에이전트가 누락하거나 형식을 어길 수 있음

### Option B: Post-processing (안전)
```typescript
// Step 완료 후 LLM 호출로 trace 생성
async function generateTrace(
  step: WorkflowStep,
  output: unknown,
  toolCalls: ToolCall[],
  messages: ChatMessage[]
): Promise<ExecutionTrace> {
  const tracePrompt = `다음 작업의 수행 내역을 분석하여 structured trace를 생성하세요...`;
  return await llm.generateStructured(tracePrompt, traceSchema);
}
```

**장점:** 일관된 형식 보장  
**단점:** 추가 LLM 비용 발생, 원본 컨텍스트보다 덜 정확할 수 있음

### Option C: 하이브리드 (최종 제안)
1. **System Prompt**에 trace 생성 요청
2. 에이전트가 응답에 trace 포함
3. **Validator**가 trace 존재/형식 검증
4. 없거나 불완전하면 **Post-processing**으로 생성
5. 최종 trace를 공유 메모리에 저장

## Context 주입 방식

### 다음 Step의 User Prompt에 자동 포함
```typescript
// buildUserPrompt에 추가
const upstreamTraces = getUpstreamTraces(step, execution);

return [
  `Step: ${step.name}`,
  "Task:",
  task,
  "",
  "=== Execution History ===",
  ...upstreamTraces.map(trace => formatTrace(trace)),
  "",
  "=== Current Task ===",
  // ... 기존 내용
]
```

### Markdown 형식 주입
```markdown
## Execution History

### 1. planning (product-manager)
**Task:** 사용자 요구사항 분석 및 MVP 계획 수립
**Methodology:** 사용자 인터뷰 5건, 경쟁사 분석
**Key Decisions:**
  - 3개 MVP 기능으로 범위 제한 (기술적 제약)
  - 모바일 우선 전략
**Assumptions:** 사용자는 기술에 익숙함
**Implications for Next:** 아키텍처 설계 시 확장성 고려 필요

### 2. architecture (architect)
**Task:** 시스템 아키텍처 설계
**Methodology:** MVC 패턴, Clean Architecture
**Key Decisions:**
  - React + TypeScript 선택
  - localStorage 기반 상태 관리
**Assumptions:** 단일 사용자 환경
**Constraints:** 오프라인 지원 필요
**Implications for Next:** 컴포넌트 설계 시 재사용성 고려
```

## 설정 옵션

```yaml
# workflow 레벨
execution_traces:
  enabled: true              # 기본 true
  detail_level: detailed     # minimal | standard | detailed
  storage: memory            # memory | file | db
  include_in_prompt: true    # 다음 step에 주입 여부
  max_history_steps: 10      # 주입할 최대 upstream step 수
  compaction:                # 이력 압축 설정
    enabled: true
    after_steps: 5           # 5개 step 이후 압축
    strategy: summary        # summary | archive

# step 레벨 (override)
steps:
  - name: planning
    agent: product-manager
    execution_trace:
      detail_level: detailed
      store_in_file: true    # 이 step만 파일에 저장
```

## 구현 순서

1. **ExecutionTrace 타입 정의** (`runtime-types.ts`)
2. **Trace 생성 로직** (step-executor 완료 후)
3. **Trace 저장** (memory / file / db)
4. **Context 주입** (buildUserPrompt 수정)
5. **Compaction** (이력 압축)
6. **CLI 업데이트** (workflow create 시 trace 설정)
7. **테스트**

## 기대 효과

1. **맥락 이해 향상**: 다음 에이전트가 이전 작업의 의사결정, 가정, 제약을 이해
2. **일관성 유지**: 연속된 작업에서 가정/제약이 유지됨
3. **디버깅 용이**: 실행 이력을 통해 문제 원인 추적 가능
4. **투명성**: 각 step의 수행 내역이 명확히 기록됨
5. **확장성**: trace를 활용한 리플렉터, 자동 최적화 등 고급 기능 기반
