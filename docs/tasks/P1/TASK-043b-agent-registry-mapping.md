---
status: draft
owner: denovo
project: obora-kit
created: 2026-02-14
updated: 2026-02-14
links:
  - "[[TASK-043-llm-runtime-bridge]]"
  - "[[TASK-043a-step-agent-bridge]]"
---

# TASK-043b: Agent Registry 매핑

## 개요
- **상태**: 📝 드래프트
- **우선순위**: P1
- **예상 소요**: 2h
- **담당**: (미정)
- **의존성**: TASK-043a

## 목표
워크플로우 YAML의 `step.agent` 문자열(예: `"analyst"`, `"executor"`)을 `AgentRole` enum으로 매핑하고, 해당 role의 `BaseAgent` 인스턴스를 생성하는 레지스트리를 구현한다.

## 현재 상태 (AS-IS)
- `packages/agents/src/roles/factory.ts`에 `createAgent(config)` 존재
- `config.role`은 `"analyst" | "executor" | "verifier" | "director"` 문자열
- 하지만 CLI(`run.ts`)에서 이 factory를 호출하는 코드 없음
- `step.agent`는 자유 문자열 — 유효성 검증 없음

## 목표 상태 (TO-BE)
```typescript
// AgentResolver 구현
class AgentRegistry implements AgentResolver {
  constructor(private llm: LLMAdapter, private toolRegistry?: ToolRegistry) {}

  resolve(agentName: string): BaseAgent {
    const role = this.mapToRole(agentName);
    return createAgent({ id: `${role}-${Date.now()}`, role, llm: this.llm, toolRegistry: this.toolRegistry });
  }

  private mapToRole(name: string): AgentRole {
    const mapping: Record<string, AgentRole> = {
      analyst: AgentRole.ANALYST,
      executor: AgentRole.EXECUTOR,
      verifier: AgentRole.VERIFIER,
      director: AgentRole.DIRECTOR,
    };
    const role = mapping[name.toLowerCase()];
    if (!role) throw new OboraError("E4003", `Unknown agent: ${name}`);
    return role;
  }
}
```

## 작업 내용

### 1. `AgentRegistry` 클래스
- `AgentResolver` 인터페이스 구현 (TASK-043a에서 정의)
- `step.agent` → `AgentRole` 매핑 테이블
- 미지원 agent 이름 → `OboraError` (기존 진단 코드 `E4003: "Agent not found"` 사용)
- ⚠️ `E4003`은 이미 `ErrorCodes` union에 존재하므로 추가 확장 불필요

### 2. LLM Adapter 선택 로직
- MVP: 환경변수 `OBORA_LLM_PROVIDER`로 adapter 결정
- `packages/agents/src/llm/factory.ts`의 기존 `createAdapterFromEnv()` 활용
- ⚠️ 현재 `createAdapterFromEnv()`는 미설정 시 throw — `MockLLMAdapter` fallback 로직을 **043b에서 추가 구현**해야 함
- `MockLLMAdapter`는 `packages/agents/src/llm/mock-adapter.ts`에 존재하지만 factory에 미연결

### 3. 워크플로우 검증 강화
- `workflow-validator.ts`에 agent 이름 유효성 검증 추가
- 유효 agent: `analyst`, `executor`, `verifier`, `director`
- 잘못된 agent 이름 → parse 단계에서 경고/에러

## 인터페이스 정의
```typescript
interface AgentRegistryConfig {
  llm: LLMAdapter;
  toolRegistry?: ToolRegistry;
  allowedRoles?: AgentRole[];
}

class AgentRegistry {
  constructor(config: AgentRegistryConfig);
  resolve(agentName: string): BaseAgent;
  has(agentName: string): boolean;
  listAvailable(): string[];
}
```

## 테스트 기준
- [ ] 4개 유효 role 각각 resolve 성공
- [ ] 대소문자 무관 매핑 (`Analyst` → `analyst`)
- [ ] 미지원 agent → OboraError E4003
- [ ] `has()` / `listAvailable()` 정확성
- [ ] LLM adapter factory 연동 (mock)

## 파일 구조
```
packages/cli/src/
├── runtime/
│   ├── agent-registry.ts      # AgentRegistry (신규)
│   └── agent-registry.test.ts
packages/core/src/
├── errors/
│   └── diagnosis.ts           # E4003 진단 템플릿 추가 (ErrorCodes에는 이미 존재)
```

> **참고**: `E4003: "Agent not found"`는 `packages/core/src/errors/index.ts`의 `ErrorCodes` 상수에 이미 정의되어 있으므로 `ErrorCode` union 확장은 불필요. `diagnosis.ts`에 E4003용 진단 템플릿만 추가하면 됨.

## 수용 기준 (AC)
- [ ] `step.agent` 문자열 → `BaseAgent` 인스턴스 생성 가능
- [ ] 미지원 agent 이름 시 명확한 에러 메시지 + 진단 코드
- [ ] MockAdapter fallback 동작
- [ ] 단위 테스트 통과

## 리스크
- agent alias 확장 시 매핑 테이블 유지보수 필요 → MVP는 4개 고정
- LLM API 키 미설정 시 런타임 에러 → MockAdapter fallback으로 해결
- **role 타입 정합성**: `createAgent`의 `role` 파라미터는 `"analyst" | "executor" | ...` (string literal union)이고, `AgentRole` enum 값도 동일 string이므로 런타임/타입 모두 호환. `mapToRole()`이 `AgentRole` enum을 반환하면 `createAgent({ role })` 호출에 그대로 전달 가능

## 완료 정의
- 코드 구현 + 단위 테스트 통과
- `pnpm typecheck` 통과
- 3모델 리뷰 9+/10

---
*작성일: 2026-02-14*
