---
status: draft
owner: denovo
project: obora-kit
created: 2026-02-14
updated: 2026-02-14
links:
  - "[[TASK-043-llm-runtime-bridge]]"
  - "[[TASK-043a-step-agent-bridge]]"
  - "[[TASK-043b-agent-registry-mapping]]"
---

# TASK-043c: Context & Blackboard 조립

## 개요
- **상태**: 📝 드래프트
- **우선순위**: P1
- **예상 소요**: 2.5h
- **담당**: (미정)
- **의존성**: TASK-043a, TASK-022 (blackboard 패키지)

## 목표
워크플로우 실행 시 각 스텝에 전달할 `AgentContext`를 조립한다. 핵심은 `Blackboard` 인스턴스를 생성하고 스텝 간 상태를 공유하는 메커니즘을 구축하는 것.

## 현재 상태 (AS-IS)
- `AgentContext` 인터페이스 정의 완료 (`base-agent.ts`)
  ```typescript
  interface AgentContext {
    sessionId: string;
    board: Blackboard;
    currentTask?: Task;
    history: ChatMessage[];
  }
  ```
- `Blackboard` 클래스 존재 (`@obora-kit/blackboard`)
- 하지만 CLI에서 Blackboard 인스턴스를 생성/주입하는 코드 없음
- 스텝 간 상태 전달 메커니즘 없음

## 목표 상태 (TO-BE)
```typescript
// 워크플로우 실행 시 1개의 Blackboard 생성, 모든 스텝이 공유
async function executeWorkflow(workflow, featurePath, options) {
  const board = createWorkflowBlackboard(featurePath);
  const sessionId = generateSessionId();

  for (const stepName of executionOrder) {
    const context = buildAgentContext(sessionId, board, step);
    const result = await stepExecutor.execute(step, resolver, context);

    // 이전 스텝 출력을 board에 기록 → 다음 스텝이 참조 가능
    // Blackboard는 meta|state|knowledge|decisions 섹션만 허용
    board.write(`state.steps.${stepName}.result`, result);
  }
}
```

## 작업 내용

### 1. `createWorkflowBlackboard()` 팩토리
- 워크플로우 당 1개 Blackboard 인스턴스 생성
- 초기 상태: feature 메타데이터, 워크플로우 설정 로드
- `.obora/outputs/` 기존 출력물 참조 가능

### 2. `buildAgentContext()` 함수
- `sessionId`: 워크플로우 실행 ID (기존 `run-${Date.now()}` 활용)
- `board`: 공유 Blackboard 인스턴스
- `currentTask`: 현재 스텝의 Task
- `history`: 이전 스텝들의 LLM 대화 이력 (초기에는 빈 배열, 이후 누적)

### 3. 스텝 간 상태 전파
- 스텝 완료 시 `board.write(`state.steps.{name}.result`, result)` 기록
- 다음 스텝에서 `board.read(`state.steps.{prevStep}.result`)` 가능
- ⚠️ Blackboard 경로는 반드시 `meta|state|knowledge|decisions` 중 하나의 섹션으로 시작해야 함 (`path-utils.ts` 제약)
- `step.inputs`에 명시된 의존 스텝의 출력을 자동 조회

### 4. 실패 경로 연동
- 스텝 실패 시 `board.write(`state.steps.{name}.error`, error)` 기록
- `status.yaml` 업데이트 시 board 상태에서 에러 코드 추출
- `obora status` 명령에서 진단 정보 표시 가능

## 인터페이스 정의
```typescript
interface ContextBuilder {
  createBlackboard(featurePath: string, workflow: Workflow): Blackboard;
  buildContext(
    sessionId: string,
    board: Blackboard,
    step: Step,
    history: ChatMessage[],
  ): AgentContext;
}
```

## 테스트 기준
- [ ] `createWorkflowBlackboard()`: Blackboard 생성 + 초기 상태 설정
- [ ] `buildAgentContext()`: 필수 필드 전부 채워진 AgentContext 반환
- [ ] 스텝 간 상태 전파: step1 결과를 step2에서 read 가능
- [ ] 실패 스텝의 에러 정보가 board에 기록
- [ ] Blackboard가 워크플로우 종료 후 정리(leak 없음)

## 파일 구조
```
packages/cli/src/
├── runtime/
│   ├── context-builder.ts      # ContextBuilder (신규)
│   └── context-builder.test.ts
```

## 수용 기준 (AC)
- [ ] 각 스텝에 유효한 `AgentContext`가 전달됨
- [ ] Blackboard를 통해 스텝 간 데이터 공유 가능
- [ ] 실패 경로에서 에러 정보가 board에 기록됨
- [ ] 단위 테스트 통과

## 리스크
- `@obora-kit/blackboard` API가 `read(key)` / `write(key, value)` 형태인지 확인 필요
  - 현재 코드상 `board.read("state", { strict: false })` 형태 확인됨 → 호환
- Blackboard 메모리 사용량 — 대규모 워크플로우 시 고려 필요 (MVP 범위 외)

## 완료 정의
- 코드 구현 + 단위 테스트 통과
- `pnpm typecheck` 통과
- 3모델 리뷰 9+/10

---
*작성일: 2026-02-14*
