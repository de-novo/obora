# Getting Started with Obora

> **Obora는 AI가 실패해도 시스템이 흔들리지 않게 만드는 AI Control Runtime입니다.**

이 가이드는 30분 안에 Obora의 핵심 기능을 체험할 수 있도록 구성했습니다.

---

## What Makes Obora Different

| 기능 | 다른 프레임워크 | Obora |
|------|----------------|-------|
| AI가 실패하면 | 전체 재시작 | **자동 진단 → 수정 → 재검증** |
| 실패 패턴 학습 | 없음 (각 실행이 독립) | **이전 실행에서 배워서 재발 방지** |
| 결과물 검증 | LLM에게 물어봄 | **Shell로 실제 빌드/테스트 실행** |
| 무인 운영 | 위험 | **DLQ + Auto-rollback + Health Check** |

---

## Prerequisites

- **Node.js 18+**
- **npm** 또는 **pnpm**
- **LLM API Key** (ZAI, OpenAI, Anthropic 중 하나)

```bash
# ZAI (권장 - 한국어 최적화)
export ZAI_API_KEY=your-key

# 또는 OpenAI
export OPENAI_API_KEY=your-key

# 또는 Anthropic
export ANTHROPIC_API_KEY=your-key
```

---

## Step 1: 설치 (2분)

```bash
# Clone & build
git clone https://github.com/your-org/obora-kit.git
cd obora-kit
pnpm install
pnpm build

# 또는 (npm publish 후)
npm install -g @obora/cli
```

---

## Step 2: 첫 워크플로우 실행 (5분)

### Hello Obora

가장 간단한 워크플로우를 실행해 봅니다.

```bash
cd obora-kit

# ZAI API Key 설정
export ZAI_API_KEY=your-key

# Hello World 실행
obora run examples/hello-obora.yaml
```

**결과**: `workspace/` 폴더에 AI가 생성한 결과물이 저장됩니다.

---

## Step 3: Validation-Repair Loop 체험 (10분)

**이게 Obora의 핵심입니다.** AI가 생성한 결과물을 자동으로 검증하고, 실패하면 수정해서 다시 시도합니다.

### 실행

```bash
cd examples/06-validation-repair-loop

# 의존성 빌드 (최초 1회)
pnpm --filter @obora/sdk build

# 실행
export ZAI_API_KEY=your-key
node run.mjs
```

### 무슨 일이 일어나나?

```
┌─────────────────┐
│ build_or_repair │  ← 릴리스 노트 초안 작성
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    validate     │  ← 커스텀 validator 실행
└────────┬────────┘
         │
    ┌────┴────┐
    │ FAILED? │
    └────┬────┘
         │ YES
         ▼
┌─────────────────┐
│ build_or_repair │  ← 검증 실패 컨텍스트와 함께 재진입
└────────┬────────┘
         │
         ▼
    (loop until PASS or max_iterations)
```

### 결과 확인

```bash
cat artifacts/release-note.md
```

**예상 결과**:
```markdown
# Release Note

## Changes
- Feature A added
- Bug B fixed

READY
```

### YAML로 보는 핵심 패턴

```yaml
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2

  - name: validate
    agent: validator
    depends_on: [build_or_repair]
    config:
      validation:
        enabled: true
        emit_structured_result: true
    on_fail:
      goto: build_or_repair      # ← 실패 시 어디로 돌아갈지
      max_iterations: 3          # ← 최대 반복 횟수
      escalate_on_exhaust: fail  # ← 소진 시 동작
```

---

## Step 4: Shell Hooks로 실제 빌드/테스트 실행 (5분)

LLM에게 "테스트 통과했어?"라고 묻지 마세요. **실제로 테스트를 실행하세요.**

```yaml
# workflow.yaml
hooks:
  pre_step:
    shell: "npm install && npm run build"
  post_step:
    shell: "npm test"

steps:
  - name: implement
    agent: coder
    skills: [typescript, testing]
```

### 실제 예시: Todo App 생성

```bash
cd examples/todo-app
export ZAI_API_KEY=your-key
obora run workflow.yaml
```

이 워크플로우는:
1. Todo 앱 코드를 생성
2. **실제로 TypeScript 빌드** (`tsc`)
3. **실제로 테스트 실행** (`npm test`)
4. 실패하면 자동으로 수정 후 재시도

---

## Step 5: Enterprise 기능 체험 (선택, 5분)

### DLQ (Dead Letter Queue)

실패한 실행을 자동으로 기록하고, 나중에 분석할 수 있습니다.

```yaml
# obora.config.yaml
dlq:
  enabled: true
  store: file
  path: ./dlq
```

### Execution Lock

같은 워크플로우가 동시에 실행되지 않도록 보호합니다.

```yaml
executionLock:
  enabled: true
  timeout: 3600000  # 1 hour
```

### Auto-Recovery

실패 시 이전 상태로 자동 복구합니다.

```yaml
autoRecovery:
  enabled: true
  strategy: rollback
```

---

## Next Steps

### 1. Examples 둘러보기

| Example | 설명 |
|---------|------|
| [01-simple-pipeline](../examples/01-simple-pipeline) | 기본 선형 워크플로우 |
| [02-multi-agent-consensus](../examples/02-multi-agent-consensus) | 다중 에이전트 합의 |
| [03-policy-gate](../examples/03-policy-gate) | 정책 게이트 |
| [06-validation-repair-loop](../examples/06-validation-repair-loop) | 검증-수정 루프 (핵심) |

### 2. CLI Reference

```bash
obora --help
obora run --help
obora init --help
```

### 3. API Reference

Obora를 프로그래밍 방식으로 사용:

```typescript
import { OboraRuntime, Workflow } from "@obora/sdk";

const runtime = new OboraRuntime({
  llm: { provider: "zai", model: "glm-4.7" }
});

const workflow: Workflow = {
  name: "my-workflow",
  version: "1.0",
  steps: [
    { name: "plan", agent: "architect" },
    { name: "implement", agent: "coder", depends_on: ["plan"] }
  ]
};

const result = await runtime.execute(workflow);
```

### 4. Enterprise Guide

프로덕션 배포를 위한 Enterprise 기능:

- [Enterprise Reliability Guide](./operations/enterprise-reliability.md)
- [DLQ & Recovery](./operations/enterprise-reliability.md#dlq-dead-letter-queue)
- [Execution Lock](./operations/enterprise-reliability.md#execution-lock)
- [Health Check & Alerting](./operations/enterprise-reliability.md#health-check--alerting)

---

## Troubleshooting

### "No LLM provider configured"

API Key가 설정되지 않았습니다:

```bash
export ZAI_API_KEY=your-key
# 또는
export OPENAI_API_KEY=your-key
```

### "Module not found"

SDK를 빌드해야 합니다:

```bash
pnpm --filter @obora/sdk build
```

### "Validation keeps failing"

`max_no_progress_iterations`를 늘려보세요:

```yaml
repair_loop:
  max_no_progress_iterations: 5
```

---

## Need Help?

- **GitHub Issues**: https://github.com/your-org/obora-kit/issues
- **Discord**: https://discord.gg/obora
- **Docs**: https://docs.obora.ai
