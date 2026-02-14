---
status: draft
owner: denovo
project: obora-kit
created: 2026-02-14
updated: 2026-02-14
links:
  - "[[TASK-043-llm-runtime-bridge]]"
---

# TASK-043a: Step-Agent 브릿지

## 개요
- **상태**: 📝 드래프트
- **우선순위**: P1
- **예상 소요**: 3h
- **담당**: (미정)
- **의존성**: TASK-034 (agents 패키지)

## 목표
`packages/cli/src/commands/run.ts`의 `executeStep()` 함수를 리팩터링하여 `BaseAgent.execute()`를 실제로 호출하도록 배선한다.

## 현재 상태 (AS-IS)
```typescript
// run.ts:executeStep() — 현재 placeholder
async function executeStep(step, featurePath, workflowConfig, attempt) {
  // Simulated execution — LLM 호출 없음
  return { success: true, output: "Simulated..." };
}
```

## 목표 상태 (TO-BE)
```typescript
async function executeStep(step, featurePath, workflowConfig, attempt) {
  const agent = resolveAgent(step.agent);        // TASK-043b
  const context = buildContext(featurePath);      // TASK-043c
  const task = stepToTask(step);
  const result = await agent.execute(task, context);
  return {
    success: result.success,
    output: formatOutput(result),
    error: result.error?.message,
    diagnosisCode: result.error ? mapErrorToDiagnosis(result.error) : undefined,
  };
}
```

## 작업 내용

### 1. `stepToTask()` 변환 함수
- `Step` (core 타입) → `Task` (agents 타입) 변환
- 매핑: `step.name` → `task.id`, `step.agent` → `task.type`, `step.description` → `task.description`
- `step.config` → `task.input`, `step.inputs/outputs` → `task.metadata`

### 2. `executeStep()` 시그니처 변경
- 추가 파라미터: `agent: BaseAgent`, `context: AgentContext`
- 또는 팩토리 주입 패턴으로 `AgentResolver` 인터페이스 전달

### 3. 결과 변환
- `TaskResult` → `{ success, output, error }` 변환
- `result.output`을 markdown 형식으로 포맷팅 (기존 출력 형식 유지)

### 4. 에러 처리 및 Timeout/Retry 책임
- `agent.hasExceededMaxErrors()` 체크 → 즉시 실패 반환
- **Retry 책임은 StepExecutor에 집중**: Agent/Registry/Context 계층은 에러를 throw/반환만 하고 retry하지 않음
- **Timeout**: 스텝 레벨 timeout은 `StepExecutor`가 관리 (기본 60s, `step.timeout` 오버라이드 가능). LLM 호출 레벨 timeout은 adapter 설정에 위임
- `TaskResult.error` → 진단 코드 매핑: `E4001`(실행 실패), `E4002`(timeout), `E4005`(retry 소진)
- `AgentRegistry.resolve()` 실패 (`E4003`) → retry 없이 즉시 실패

## 인터페이스 정의
```typescript
// 새로 추가할 인터페이스
interface AgentResolver {
  resolve(agentName: string): BaseAgent;
}

interface StepExecutor {
  execute(
    step: Step,
    resolver: AgentResolver,
    context: AgentContext,
  ): Promise<{ success: boolean; output?: string; error?: string; diagnosisCode?: ErrorCode }>;
}

// Step → Task 변환
function stepToTask(step: Step): Task {
  return {
    id: step.name,
    type: step.agent,
    description: step.description ?? step.name,
    input: step.config ?? {},
    priority: 1,
    metadata: {
      inputs: step.inputs,
      outputs: step.outputs,
    },
  };
}
```

## 테스트 기준
- [ ] `stepToTask()`: Step → Task 변환 정확성 (5 케이스)
- [ ] `executeStep()`: mock agent 주입 → 성공 경로
- [ ] `executeStep()`: mock agent 에러 → 실패 경로 + error 메시지
- [ ] `executeStep()`: timeout 시나리오
- [ ] 기존 `run.test.ts` regression 없음

## 파일 구조
```
packages/cli/src/
├── commands/
│   └── run.ts              # executeStep 리팩터링
├── runtime/
│   ├── step-executor.ts    # StepExecutor 구현 (신규)
│   └── step-executor.test.ts
```

## 수용 기준 (AC)
- [ ] `executeStep()`가 `BaseAgent.execute()`를 호출
- [ ] `Step` → `Task` 변환이 정확
- [ ] `TaskResult` → CLI 출력 형식 변환 정확
- [ ] mock adapter로 단위 테스트 통과

## 리스크
- **CLI 의존성 추가 필수**: 현재 CLI는 `@obora/core` + `@obora/database`만 의존. `@obora-kit/agents` + `@obora-kit/blackboard` 추가 필요 (`pnpm add`)
- **패키지 이름 불일치 주의**: core는 `@obora/core`, agents는 `@obora-kit/agents` — scope가 다름. 확인 필요
- 기존 `run.ts`의 순환 참조 가능성 → runtime/ 분리로 해결

## 완료 정의
- 코드 구현 + 단위 테스트 통과
- `pnpm typecheck` 통과
- 3모델 리뷰 9+/10

---
*작성일: 2026-02-14*
