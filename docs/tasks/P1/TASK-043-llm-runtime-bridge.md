---
status: draft
owner: denovo
project: obora-kit
created: 2026-02-14
updated: 2026-02-14
links:
  - "[[TASK-043a-step-agent-bridge]]"
  - "[[TASK-043b-agent-registry-mapping]]"
  - "[[TASK-043c-context-blackboard-assembly]]"
---

# TASK-043: LLM 런타임 브릿지 (상위)

## 개요
- **상태**: 📝 드래프트
- **우선순위**: P1
- **예상 소요**: 1h (하위 태스크 통합 검증)
- **담당**: (미정)
- **의존성**: TASK-043a, TASK-043b, TASK-043c

## 목표
`obora run` 명령이 실제 LLM 에이전트를 호출하여 워크플로우 스텝을 실행하도록 한다.
현재 `executeStep()`은 시뮬레이션 출력만 반환하는 placeholder 상태이며, 이를 `@obora-kit/agents`의 `BaseAgent.execute()`와 연결하는 것이 핵심 목표.

## 범위
이 상위 태스크는 하위 3개 태스크(043a/b/c)의 통합 검증만 담당:
- 전체 파이프라인 E2E 검증: YAML → parse → resolve → **executeStep → Agent → LLM** → output 저장
- `obora run --dry-run`과 실제 실행 경로 분기 확인
- `obora status`에서 실패 진단 코드(E4001/E4005) 정상 표시 확인

## 수용 기준 (AC)
- [ ] `obora run -f test-feature` 실행 시 실제 LLM 호출 발생 (mock adapter로 검증 가능)
- [ ] step 실패 시 진단 코드가 Blackboard (`state.context.steps.<name>.diagnosisCode`)에 기록됨
- [ ] `--dry-run` 모드에서는 LLM 호출 없음
- [ ] 기존 CLI 테스트 regression 없음

## 테스트 기준
- [ ] E2E (integration-e2e.test.ts): mock LLM adapter로 3-step 워크플로우 실행 성공
- [ ] E2E (integration-e2e.test.ts): step 실패 (E4003 unknown agent) → blackboard 기록 + fallback 실행
- [ ] E2E (integration-e2e.test.ts): timeout (E4002) → blackboard 기록
- [ ] E2E (integration-e2e.test.ts): inter-step 전파, single-writer guard, history trimming
- [ ] Unit (step-executor.test.ts): E4001 runtime failure, timeout, parseDuration
- [ ] _(향후)_ Workflow orchestration: retry loop → E4005 retry 소진 → 최종 실패
- [ ] 기존 `run.test.ts` 통과

## 통합 인터페이스 계약

하위 태스크 간 명확한 책임 분리를 위해 다음 계약을 정의한다.

### executeStep 시그니처 (043a 기준)
```typescript
// StepExecutor.execute — 단일 스텝 실행의 최종 시그니처
execute(
  step: Step,
  resolver: AgentResolver,
  context: AgentContext,
): Promise<{ success: boolean; output?: string; error?: string; diagnosisCode?: ErrorCode }>
```

### Timeout / Retry 책임 분리
| 계층 | 책임 | 기본값 |
|------|------|--------|
| `StepExecutor` (043a) | **스텝 레벨** retry 루프 (agent 전체 재실행), `maxRetries` 관리 | 3회 |
| `StepExecutor` (043a) | 스텝 레벨 timeout (`step.timeout` or workflow default) | 60s |
| `RetryHandler` (agents/llm) | **LLM 호출 레벨** retry (네트워크 에러, rate-limit 등 transient 에러) | 3회, exponential backoff |
| `BaseAgent.execute()` | LLM 호출 레벨 timeout (adapter 설정에 위임) | adapter별 |
| `AgentRegistry` (043b) | agent 생성 실패 시 즉시 에러 (retry 없음) | — |
| `ContextBuilder` (043c) | blackboard I/O 실패 시 즉시 에러 (retry 없음) | — |

- **2계층 retry 구조**: LLM 레벨 transient 에러는 `RetryHandler`(`packages/agents/src/llm/retry-handler.ts`)가 처리. StepExecutor는 agent-level 실패(비즈니스 로직 실패, 잘못된 출력 등)를 retry한다.
- `RetryHandler`가 `RetryExhaustedError`를 throw하면 StepExecutor의 retry 카운트를 소모한다.
- StepExecutor retry 소진 시 `E4005` 진단 코드를 기록한다.

### 에러 전파 규칙
| 에러 발생 위치 | 진단 코드 | 전파 방식 |
|---------------|----------|----------|
| `AgentRegistry.resolve()` — 미지원 agent | `E4003` | `OboraError` throw → StepExecutor catch → 즉시 실패 (retry 안함) |
| `BaseAgent.execute()` — LLM 실패 (transient) | — | `RetryHandler`가 내부 retry → 소진 시 `RetryExhaustedError` throw → StepExecutor retry 루프 |
| `BaseAgent.execute()` — 비즈니스 실패 | `E4001` | `TaskResult { success: false, error }` 반환 → StepExecutor retry 루프 |
| `BaseAgent.execute()` — timeout | `E4002` | adapter-level timeout → `RetryHandler`가 retry 또는 throw → StepExecutor retry 루프 |
| StepExecutor retry 소진 | `E4005` | Blackboard `state.context.steps.<name>` 기록 + CLI 출력 |
| `ContextBuilder` — blackboard 조립 실패 | `E4001` | `OboraError` throw → StepExecutor catch → 즉시 실패 |

### role 타입 정합성
- `createAgent(config)` 의 `config.role`은 `"analyst" | "executor" | "verifier" | "director"` (string literal union)
- `AgentRole` enum 값이 동일한 string이므로 **`AgentRole.ANALYST` → `createAgent({ role: AgentRole.ANALYST })`는 타입 호환**
- 043b의 `AgentRegistry.mapToRole()`은 `AgentRole` enum을 반환하되, `createAgent` 호출 시 그대로 전달 가능 (enum value = string literal)

## 리스크
- 하위 태스크 간 인터페이스 불일치 가능 → 043a 완료 후 043b/c 착수 권장 (순서: 043a→043b→043c→043)
- LLM adapter 설정 미비 시 런타임 에러 → 환경변수/config 검증 로직 필요
- `ErrorCode` union 확장 시 `packages/core/src/errors/index.ts` 수정 필요 (컴파일 타임 영향)

## 완료 정의
- 하위 3개 태스크 모두 ✅ 완료
- 통합 E2E 테스트 통과
- 3모델 리뷰 9+/10

## 구현 순서
1. [[TASK-043a-step-agent-bridge]] — executeStep → BaseAgent.execute() 배선
2. [[TASK-043b-agent-registry-mapping]] — step.agent 문자열 → AgentRole 매핑
3. [[TASK-043c-context-blackboard-assembly]] — AgentContext + Blackboard 조립
4. TASK-043 통합 검증

## 참고 문서
- `packages/cli/src/commands/run.ts` — executeStep() placeholder
- `packages/agents/src/roles/base-agent.ts` — BaseAgent.execute()
- `packages/agents/src/roles/factory.ts` — createAgent()

---
*작성일: 2026-02-14*
