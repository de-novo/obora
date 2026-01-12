# Orchestrator

SDK 기반 워크플로우 오케스트레이터 모듈입니다. `.claude/agents/*.md`에서 에이전트를 동적으로 로드하고, 워크플로우를 계획 및 실행합니다.

## 설치

이 모듈은 `@obora/kit` 패키지의 일부입니다.

```bash
pnpm add @obora/kit
```

## 사용법

```typescript
import {
  loadAgents,
  runAgent,
  planWorkflow,
  executeWorkflow,
  simpleQuery,
} from "@obora/kit/orchestrator";
```

## 주요 API

### `loadAgents(projectRoot: string): Map<string, AgentDefinition>`

`.claude/agents/` 디렉토리에서 모든 에이전트 정의를 로드합니다.

```typescript
const agents = loadAgents(process.cwd());

for (const [name, agent] of agents) {
  console.log(`${name}: ${agent.description}`);
}
```

### `runAgent(agent, task, cwd, onMessage?): Promise<AgentResult>`

단일 에이전트를 실행합니다.

```typescript
const agent = agents.get("explorer");
const result = await runAgent(
  agent,
  "src/ 디렉토리 구조를 분석해주세요",
  process.cwd(),
  (message) => console.log(message)
);

if (result.success) {
  console.log(result.output);
} else {
  console.error(result.error);
}
```

### `planWorkflow(task, cwd, onMessage?): Promise<WorkflowPlan>`

Planner 에이전트를 통해 작업을 분석하고 워크플로우를 설계합니다.

```typescript
const plan = await planWorkflow(
  "새로운 API 엔드포인트를 추가해주세요",
  process.cwd()
);

console.log("분석:", plan.analysis);
console.log("워크플로우:", plan.workflow);
```

### `executeWorkflow(task, cwd, options?): Promise<{ plan, results }>`

전체 워크플로우를 실행합니다. Planner를 통한 계획 수립부터 각 에이전트의 순차 실행까지 처리합니다.

```typescript
const { plan, results } = await executeWorkflow(
  "README.md를 업데이트해주세요",
  process.cwd(),
  {
    onPlanComplete: (plan) => {
      console.log("계획 완료:", plan.workflow.length, "단계");
    },
    onStepStart: (step, index) => {
      console.log(`[${index + 1}] ${step.agent} 시작...`);
    },
    onStepComplete: (step, result, index) => {
      console.log(`[${index + 1}] ${step.agent} 완료:`, result.success);
    },
  }
);
```

### `simpleQuery(prompt, cwd, allowedTools?, onMessage?): Promise<string>`

워크플로우 없이 간단한 일회성 쿼리를 실행합니다.

```typescript
const result = await simpleQuery(
  "package.json의 의존성 목록을 보여주세요",
  process.cwd(),
  ["Read", "Glob"] // 선택적: 허용할 도구 목록
);

console.log(result);
```

### `formatAgentsForPlanner(agents): string`

에이전트 목록을 Planner용 문자열로 변환합니다.

```typescript
const agents = loadAgents(process.cwd());
const formatted = formatAgentsForPlanner(agents);
// 출력: "- explorer: 코드베이스 탐색 (tools: Read, Glob, Grep)\n- ..."
```

### `getAgentByName(agents, name): AgentDefinition | undefined`

이름으로 특정 에이전트를 조회합니다.

```typescript
const explorer = getAgentByName(agents, "explorer");
```

## 타입 정의

### `AgentDefinition`

에이전트 정의를 나타내는 인터페이스입니다.

```typescript
interface AgentDefinition {
  name: string;           // 에이전트 이름
  description: string;    // 에이전트 설명
  allowedTools: string[]; // 사용 가능한 도구 목록
  systemPrompt: string;   // 시스템 프롬프트 (마크다운 본문)
}
```

### `WorkflowStep`

워크플로우의 개별 단계를 정의합니다.

```typescript
interface WorkflowStep {
  agent: string;   // 실행할 에이전트 이름
  task: string;    // 에이전트에게 할당할 작업
  reason?: string; // 이 단계의 이유 (선택)
}
```

### `WorkflowPlan`

Planner가 생성하는 워크플로우 계획입니다.

```typescript
interface WorkflowPlan {
  analysis: string;           // 작업 분석 내용
  workflow: WorkflowStep[];   // 실행할 단계 목록
  feedbackLoop?: FeedbackLoop; // 피드백 루프 설정 (선택)
}
```

### `FeedbackLoop`

피드백 루프 설정입니다.

```typescript
interface FeedbackLoop {
  enabled: boolean;     // 활성화 여부
  maxIterations: number; // 최대 반복 횟수
}
```

### `AgentResult`

에이전트 실행 결과입니다.

```typescript
interface AgentResult {
  success: boolean; // 성공 여부
  output: string;   // 출력 내용
  error?: string;   // 에러 메시지 (실패 시)
}
```

### `SessionInfo`

세션 정보입니다.

```typescript
interface SessionInfo {
  sessionId: string; // 세션 ID
  startedAt: Date;   // 시작 시간
  cwd: string;       // 작업 디렉토리
}
```

## 에이전트 파일 형식

`.claude/agents/*.md` 파일은 YAML frontmatter를 사용합니다:

```markdown
---
name: explorer
description: 코드베이스를 탐색하고 구조를 분석합니다
tools: Read, Glob, Grep
---

# Explorer Agent

코드베이스 탐색을 담당하는 에이전트입니다.

## 역할
- 파일 구조 분석
- 코드 패턴 탐지
- 의존성 파악
```

**필수 frontmatter 필드:**
- `name`: 에이전트 이름 (고유해야 함)
- `description`: 에이전트 설명
- `tools`: 사용 가능한 도구 목록 (쉼표 또는 공백으로 구분)

## 사용 예시

### 기본 워크플로우 실행

```typescript
import { executeWorkflow } from "@obora/kit/orchestrator";

async function main() {
  const { plan, results } = await executeWorkflow(
    "프로젝트에 로깅 시스템을 추가해주세요",
    process.cwd(),
    {
      onPlanComplete: (plan) => {
        console.log("=== 워크플로우 계획 ===");
        console.log(plan.analysis);
        plan.workflow.forEach((step, i) => {
          console.log(`${i + 1}. [${step.agent}] ${step.task}`);
        });
      },
      onStepStart: (step, index) => {
        console.log(`\n>>> ${step.agent} 실행 중...`);
      },
      onStepComplete: (step, result, index) => {
        if (result.success) {
          console.log(`<<< ${step.agent} 완료`);
        } else {
          console.error(`<<< ${step.agent} 실패:`, result.error);
        }
      },
    }
  );

  console.log("\n=== 결과 요약 ===");
  const successCount = results.filter((r) => r.success).length;
  console.log(`${successCount}/${results.length} 단계 성공`);
}

main();
```

### 특정 에이전트만 실행

```typescript
import { loadAgents, runAgent, getAgentByName } from "@obora/kit/orchestrator";

async function analyzeCode() {
  const agents = loadAgents(process.cwd());
  const explorer = getAgentByName(agents, "explorer");

  if (!explorer) {
    console.error("explorer 에이전트를 찾을 수 없습니다");
    return;
  }

  const result = await runAgent(
    explorer,
    "src/utils/ 디렉토리의 모든 함수를 분석해주세요",
    process.cwd()
  );

  console.log(result.output);
}
```

### 간단한 쿼리

```typescript
import { simpleQuery } from "@obora/kit/orchestrator";

async function quickCheck() {
  const result = await simpleQuery(
    "이 프로젝트에서 사용 중인 테스트 프레임워크가 무엇인가요?",
    process.cwd(),
    ["Read", "Glob", "Grep"]
  );

  console.log(result);
}
```

## 프로젝트 구조

```
orchestrator/
├── index.ts        # 모듈 진입점 (re-export)
├── types.ts        # 타입 정의
├── agent-loader.ts # 에이전트 로딩 로직
├── executor.ts     # 워크플로우 실행 로직
└── README.md       # 이 문서
```

## 의존성

- `@anthropic-ai/claude-agent-sdk`: Claude Agent SDK
- Node.js 내장 모듈: `fs`, `path`

## 라이선스

MIT
