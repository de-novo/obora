# Workflow/Agent 아키텍처

이 문서는 obora-kit의 워크플로우/에이전트 시스템 구조를 설명합니다.

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                   Your Application                               │
│  (CLI, Web UI, API, etc.)                                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              @obora/workflow-core                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Agent Loader │  │    Engine    │  │   Tracker    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────┬────────────────────────────────────────────┘
                     │ AgentProvider interface
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│          Provider Implementation                                 │
│  @obora/agent-claude | @obora/agent-codex (future) | ...        │
└─────────────────────────────────────────────────────────────────┘
```

## 패키지 구조

```
packages/
├── workflow-core/         # Provider-agnostic workflow engine
│   ├── agent-loader.ts    # 에이전트 정의 로딩
│   ├── engine.ts          # 워크플로우 실행
│   ├── tracker.ts         # DB 트래킹
│   ├── project-service.ts # 프로젝트 식별
│   ├── db-init.ts         # DB 초기화
│   └── types.ts           # 공용 타입
├── agent-claude/          # Claude SDK provider
│   └── claude-provider.ts # ClaudeAgentProvider 구현
└── cli/                   # CLI (workflow-core + agent-claude 사용)
    └── commands/
        ├── run.ts         # obora run
        └── chat.ts        # obora chat
```

## 핵심 컴포넌트

### 1. AgentProvider 인터페이스

AI Provider 추상화 인터페이스:

```typescript
interface AgentProvider {
  readonly name: string;
  runAgent(
    agent: AgentDefinition,
    task: string,
    cwd: string,
    options?: AgentRunOptions
  ): AsyncIterable<AgentMessage>;
}
```

### 2. Agent Loader

`.claude/agents/obora/*.md` 에서 에이전트 정의 로드:

- YAML frontmatter: `name`, `description`, `tools`, `model`
- `loadAgents(cwd)` - 모든 에이전트 로드
- `getAgentByName(agents, name)` - 특정 에이전트 조회
- `formatAgentsForPlanner(agents)` - planner 프롬프트용 포맷

### 3. Workflow Engine

Provider-agnostic 워크플로우 실행:

```typescript
import { executeWorkflow } from "@obora/workflow-core";
import { ClaudeAgentProvider } from "@obora/agent-claude";

const provider = new ClaudeAgentProvider();

const { plan, results } = await executeWorkflow(
  "Implement user authentication",
  process.cwd(),
  provider,
  {
    onPlanComplete: (plan) => console.log("Plan:", plan),
    onStepComplete: (step, result) => console.log("Done:", step.agent),
  }
);
```

### 4. WorkflowTracker

실행 로그/토큰/세션 추적:

- `@obora/database`로 로컬 SQLite에 저장
- 이벤트 소싱 형태로 SaaS 확장 가능

### 5. ProjectService

프로젝트 식별 우선순위:
1. `.obora/project.yaml`의 id
2. Git remote origin
3. local path fallback

## Claude Provider 구현

`@obora/agent-claude` 패키지:

```typescript
import { ClaudeAgentProvider, simpleQuery } from "@obora/agent-claude";

// 워크플로우 실행용
const provider = new ClaudeAgentProvider({
  maxTurns: 10,
  settingSources: ["project"],
});

// 단순 쿼리용
const output = await simpleQuery(
  "Analyze the codebase",
  process.cwd(),
  ["Read", "Glob", "Grep"]
);
```

## 메시지 타입

Provider가 yield하는 메시지:

- `text` - 텍스트 응답
- `tool_use` - 도구 호출
- `tool_result` - 도구 결과
- `result` - 최종 결과 (토큰 사용량 포함)
- `error` - 에러

## 향후 확장

- `@obora/agent-codex` - OpenAI Codex provider
- `@obora/agent-gemini` - Google Gemini provider
- Parallel step execution
- Advanced error recovery
- Workflow templates

## Related Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Template/Preset composable architecture
- [VISION-AGENT-AGNOSTIC.md](./VISION-AGENT-AGNOSTIC.md) - Agent-agnostic vision and roadmap
- [AGENT-SUBSCRIPTION-RESEARCH.md](./AGENT-SUBSCRIPTION-RESEARCH.md) - Multi-agent subscription research
