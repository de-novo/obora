## Workflow/Agent 구조 문서 (현재 구조 기반)

이 문서는 현재 코드베이스의 워크플로우/에이전트 구조를 정리하고,
향후 Claude 외 에이전트(Codex, Gemini 등) 지원을 위해 분리해야 할 요소를 명확히 기록합니다.

### 현재 구조 요약

`packages/cli/src/orchestrator` 가 워크플로우 엔진의 중심입니다.

```
packages/cli/src/orchestrator/
├── agent-loader.ts     # 에이전트 정의 로딩
├── executor.ts         # 워크플로우 실행 (Claude SDK 사용)
├── tracker.ts          # 워크플로우/토큰/세션 트래킹
├── project-service.ts  # 프로젝트 식별/DB 연동
├── db-init.ts          # 로컬 DB 초기화 (~/ .obora)
├── types.ts            # 공용 타입 정의
└── index.ts            # re-export
```

CLI 명령은 아래 파일들이 오케스트레이터를 호출합니다.

- `packages/cli/src/commands/run.ts`
- `packages/cli/src/commands/chat.ts`

### Agent 정의 로딩 (현재)

- `.claude/agents/obora/*.md`에서 에이전트를 로드
- YAML frontmatter 필드: `name`, `description`, `tools`, `model?`
- 도구 목록은 문자열 기반 (쉼표/공백 구분)

관련 코드:

- `packages/cli/src/orchestrator/agent-loader.ts`
- `packages/cli/src/orchestrator/types.ts`

### Tool 사용 방식 (현재)

- 에이전트의 `allowedTools`는 Claude SDK의 `allowedTools`로 그대로 전달
- 실제 도구 실행은 **Claude Code/SDK**가 담당
- obora는 “도구 허용 정책 + 실행 흐름”만 관리

관련 코드:

- `packages/cli/src/orchestrator/executor.ts` (`query` 호출)

### Workflow 실행 흐름 (현재)

1. `planWorkflow()`
   - planner 에이전트를 호출해 JSON 계획을 생성
   - Zod 스키마로 검증

2. `executeWorkflow()`
   - plan의 step을 순차 실행
   - 실패 시 중단
   - reviewer 기반 feedback loop (critical 이슈만 재시도)

관련 코드:

- `packages/cli/src/orchestrator/executor.ts`

### Tracking/Storage (현재)

**WorkflowTracker**

- 실행 로그/토큰/도구 호출 기록
- `@obora/database`로 로컬 DB에 저장
- 이벤트 소싱 형태로 SaaS 확장 고려

**ProjectService**

- 프로젝트 식별 우선순위:
  1. `.obora/project.yaml`의 id
  2. Git remote origin
  3. local path fallback

관련 코드:

- `packages/cli/src/orchestrator/tracker.ts`
- `packages/cli/src/orchestrator/project-service.ts`
- `packages/cli/src/orchestrator/db-init.ts`

---

## 분리되어야 할 요소 (향후 다중 Agent 지원)

### 1) Agent Provider 추상화 (핵심)

Claude SDK에 고정된 실행 로직을 분리해야 함.

**필요 인터페이스 예시**

```
interface AgentProvider {
  name: "claude" | "codex" | "gemini";
  runAgent(input: AgentRunInput): AsyncIterable<ProviderMessage> | Promise<AgentResult>;
}
```

현재는 `executor.ts` 내부에 Claude SDK가 하드코딩되어 있음.

### 2) Tool Runtime 추상화

Claude는 `allowedTools` 기반이지만, 다른 에이전트는 별도 호출 방식 필요.

**필요 요소**

- `ToolDefinition` (이름/입력 스키마/권한)
- `ToolRuntime` (실행/결과/로깅)
- Provider별 tool binding 로직

### 3) Agent Manifest 확장

`.claude/agents/*.md` 포맷은 유지하되 provider 필드를 확장 필요.

**예시**

```
---
name: planner
description: workflow planner
tools: Read, Glob, Grep
provider: claude | codex | gemini
model: sonnet
---
```

### 4) Core Workflow Engine 분리

`executeWorkflow`, `planWorkflow`, `runAgent`는 provider 독립이어야 함.

**목표 구조**

- `@obora/workflow-core` (순수 workflow engine)
- `@obora/agent-claude` (Claude adapter)
- `@obora/agent-codex`
- `@obora/agent-gemini`

CLI는 provider 설정만 전달하고, 실제 실행은 adapter가 수행.

---

## 권장 분리 아키텍처 (미래 구조)

```
packages/
├── workflow-core/         # engine + types + planning
├── agent-claude/          # Claude provider adapter
├── agent-codex/           # Codex provider adapter
├── agent-gemini/          # Gemini provider adapter
└── cli/                   # 사용자 인터페이스 + fs + preset/template
```

---

## 다음 단계 제안

1. `executor.ts`에서 Claude SDK 호출 부분 분리
2. provider 인터페이스 설계
3. `.claude/agents` 포맷 확장 (provider/model 추가)
4. CLI에서 provider 선택 플래그 추가 (`--provider`)
