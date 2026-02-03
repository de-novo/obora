# Workflow YAML Specification

> 버전: v3
> 패키지: @obora/core (workflow-parser)

---

## 개요

워크플로우는 YAML 파일로 정의되며, 작업의 단계와 실행 순서를 명시합니다.

### 파일 위치

```
.obora/workflows/
├── simple.yaml          # 내장 워크플로우
├── standard.yaml
├── review.yaml
├── bugfix.yaml
└── custom/              # 커스텀 워크플로우
    └── my-workflow.yaml
```

---

## 전체 스키마

```yaml
# 워크플로우 메타데이터
name: <string>                    # 필수: 워크플로우 이름
description: <string>             # 선택: 설명
version: <string>                 # 선택: 버전 (semver)

# 실행 모드
mode: auto | supervised | gated   # 선택: 기본 'auto'

# 전역 설정
config:
  retry: <number>                 # 선택: 기본 재시도 횟수
  retry_delay: <duration>         # 선택: 재시도 간격
  timeout: <duration>             # 선택: 단계 타임아웃
  on_failure: <action[]>          # 선택: 실패 시 동작

# 단계 정의
steps:
  - name: <string>                # 필수: 단계 이름
    agent: <string>               # 필수: 에이전트 ID
    description: <string>         # 선택: 단계 설명
    optional: <boolean>           # 선택: 실패해도 계속
    parallel: <boolean>           # 선택: 병렬 실행 허용
    gate: <boolean>               # 선택: 승인 게이트
    retry: <number>               # 선택: 재시도 횟수
    retry_delay: <duration>       # 선택: 재시도 간격
    timeout: <duration>           # 선택: 타임아웃
    inputs:                       # 선택: 입력 파일
      - <path>
    outputs:                      # 선택: 출력 파일
      - <path>
    depends_on:                   # 선택: 의존 단계
      - <step-name>
    on_failure:                   # 선택: 실패 시 동작
      - <action>
    env:                          # 선택: 환경 변수
      <KEY>: <value>
```

---

## 필수/선택 필드

### 루트 레벨

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `name` | string | ✅ | - | 워크플로우 이름 |
| `description` | string | ⬜ | - | 설명 |
| `version` | string | ⬜ | "1.0.0" | 버전 |
| `mode` | enum | ⬜ | "auto" | 실행 모드 |
| `config` | object | ⬜ | {} | 전역 설정 |
| `steps` | array | ✅ | - | 단계 목록 (1개 이상) |

### config 레벨

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `retry` | number | ⬜ | 0 | 기본 재시도 횟수 |
| `retry_delay` | duration | ⬜ | "30s" | 재시도 간격 |
| `timeout` | duration | ⬜ | "30m" | 단계 타임아웃 |
| `on_failure` | action[] | ⬜ | [] | 실패 시 동작 |

### step 레벨

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `name` | string | ✅ | - | 단계 이름 (고유) |
| `agent` | string | ✅ | - | 에이전트 ID |
| `description` | string | ⬜ | - | 단계 설명 |
| `optional` | boolean | ⬜ | false | 실패해도 계속 |
| `parallel` | boolean | ⬜ | true | 병렬 실행 허용 |
| `gate` | boolean | ⬜ | false | 승인 게이트 |
| `retry` | number | ⬜ | config 값 | 재시도 횟수 |
| `retry_delay` | duration | ⬜ | config 값 | 재시도 간격 |
| `timeout` | duration | ⬜ | config 값 | 타임아웃 |
| `inputs` | string[] | ⬜ | [] | 입력 파일 |
| `outputs` | string[] | ⬜ | [] | 출력 파일 |
| `depends_on` | string[] | ⬜ | [] | 의존 단계 |
| `on_failure` | action[] | ⬜ | config 값 | 실패 시 동작 |
| `env` | object | ⬜ | {} | 환경 변수 |

---

## 타입 정의

### duration

시간 간격을 나타내는 문자열입니다.

```yaml
# 형식: <숫자><단위>
retry_delay: 30s      # 30초
timeout: 5m           # 5분
max_wait: 1h          # 1시간
```

| 단위 | 의미 |
|------|------|
| `s` | 초 |
| `m` | 분 |
| `h` | 시간 |
| `d` | 일 |

### action

실패 시 동작을 나타냅니다.

```yaml
on_failure:
  - notify: telegram   # 알림 전송
  - snapshot: true     # 상태 저장
  - pause: true        # 일시 정지
  - abort: true        # 워크플로우 중단
```

| 액션 | 설명 |
|------|------|
| `notify: <channel>` | 지정 채널로 알림 |
| `snapshot: true` | 현재 상태 저장 |
| `pause: true` | 실행 일시 정지 |
| `abort: true` | 워크플로우 중단 |

### backoff (지수 백오프)

재시도 간격 증가 전략입니다.

```yaml
backoff:
  exponential: true    # 지수 증가 활성화
  max_delay: 5m        # 최대 대기 시간
  multiplier: 2        # 배율 (기본: 2)
  jitter: true         # 무작위 변동 추가
```

### on_failure enum

| 값 | 설명 |
|------|------|
| `continue` | 에러 무시하고 계속 |
| `pause` | 일시 정지 (수동 재개) |
| `abort` | 워크플로우 중단 |
| `retry` | 재시도 (retry 설정 사용) |

---

## steps 구조

### 기본 구조

```yaml
steps:
  - name: design
    agent: architect
    inputs:
      - proposal.md
    outputs:
      - context/design-output.md

  - name: implement
    agent: developer
    depends_on:
      - design
    inputs:
      - context/design-output.md
    outputs:
      - context/implement-output.md
```

### 의존성 지정

#### 암묵적 의존성 (inputs/outputs)

```yaml
steps:
  - name: step-a
    outputs:
      - file-a.md

  - name: step-b
    inputs:
      - file-a.md    # step-a의 output → 자동 의존성
```

#### 명시적 의존성 (depends_on)

```yaml
steps:
  - name: step-a
    agent: architect

  - name: step-b
    agent: developer
    depends_on:
      - step-a       # 명시적 의존성
```

### 병렬 실행

```yaml
steps:
  - name: step-a
    agent: dev-1
    parallel: true

  - name: step-b
    agent: dev-2
    parallel: true
    # step-a와 의존성 없음 → 병렬 실행

  - name: step-c
    agent: tester
    depends_on:
      - step-a
      - step-b
    # step-a, step-b 모두 완료 후 실행
```

---

## mode (실행 모드)

### auto

모든 단계를 자동으로 실행합니다.

```yaml
name: auto-workflow
mode: auto
steps:
  - name: design
    agent: architect
  - name: implement
    agent: developer
  # 모두 자동 실행
```

### supervised

각 단계 완료 후 사용자 승인을 요청합니다.

```yaml
name: supervised-workflow
mode: supervised
steps:
  - name: design
    agent: architect
    # 완료 후 승인 대기
  - name: implement
    agent: developer
    # 완료 후 승인 대기
```

**승인 프롬프트:**

```
[obora] Step 'design' 완료
        결과: context/design-output.md

        [Y] 승인 및 다음 단계 진행
        [N] 중단
        [R] 현재 단계 재실행
        [V] 결과 상세 보기

> 
```

### gated

`gate: true`인 단계에서만 승인을 요청합니다.

```yaml
name: gated-workflow
mode: gated
steps:
  - name: design
    agent: architect
    # gate 없음 → 자동 실행

  - name: implement
    agent: developer
    # gate 없음 → 자동 실행

  - name: deploy
    agent: deployer
    gate: true
    # 여기서만 승인 요청
```

---

## retry, on_failure

### 재시도 설정

```yaml
steps:
  - name: implement
    agent: developer
    retry: 3              # 최대 3회 재시도
    retry_delay: 30s      # 재시도 간격 30초
```

### 지수 백오프

```yaml
steps:
  - name: implement
    agent: developer
    retry: 5
    retry_delay: 10s
    backoff:
      exponential: true   # 지수 백오프 활성화
      max_delay: 5m       # 최대 대기 시간
```

**재시도 간격 계산:**
- 1회: 10s
- 2회: 20s
- 3회: 40s
- 4회: 80s
- 5회: 160s (→ max_delay로 5m 적용)

### 실패 처리

```yaml
steps:
  - name: implement
    agent: developer
    retry: 3
    on_failure:
      - notify: telegram   # Telegram 알림
      - snapshot: true     # 상태 저장
      - pause: true        # 일시 정지 (resume 가능)
```

### optional 단계

```yaml
steps:
  - name: lint
    agent: linter
    optional: true         # 실패해도 다음 단계 진행
    on_failure:
      - notify: telegram   # 알림만 전송
```

---

## 예시 워크플로우

### simple.yaml (내장)

```yaml
name: simple
description: 간단한 3단계 워크플로우
mode: auto

steps:
  - name: design
    agent: architect
    description: 아키텍처 설계
    inputs:
      - proposal.md
    outputs:
      - context/design-output.md

  - name: implement
    agent: developer
    description: 코드 구현
    inputs:
      - context/design-output.md
    outputs:
      - context/implement-output.md

  - name: test
    agent: tester
    description: 테스트 및 검증
    inputs:
      - context/implement-output.md
    outputs:
      - context/test-output.md
```

### standard.yaml (내장)

```yaml
name: standard
description: 표준 개발 워크플로우
mode: gated
version: "1.0.0"

config:
  retry: 2
  retry_delay: 30s
  on_failure:
    - notify: telegram

steps:
  - name: design
    agent: architect
    description: 아키텍처 설계
    inputs:
      - proposal.md
      - design.md
    outputs:
      - context/design-output.md
    retry: 1

  - name: implement
    agent: developer
    description: 코드 구현
    inputs:
      - context/design-output.md
    outputs:
      - context/implement-output.md
    retry: 3

  - name: test
    agent: tester
    description: 테스트 및 검증
    inputs:
      - context/implement-output.md
    outputs:
      - context/test-output.md
    retry: 2

  - name: review
    agent: reviewer
    description: 코드 리뷰
    inputs:
      - context/implement-output.md
      - context/test-output.md
    outputs:
      - context/review-output.md
    gate: true
```

### 병렬 실행 예시

```yaml
name: parallel-workflow
description: 병렬 실행이 포함된 워크플로우
mode: auto

steps:
  - name: design
    agent: architect
    outputs:
      - context/design.md

  # frontend와 backend는 병렬 실행
  - name: frontend
    agent: frontend-dev
    depends_on:
      - design
    outputs:
      - context/frontend.md

  - name: backend
    agent: backend-dev
    depends_on:
      - design
    outputs:
      - context/backend.md

  # integration은 frontend, backend 완료 후 실행
  - name: integration
    agent: tester
    depends_on:
      - frontend
      - backend
    outputs:
      - context/integration.md
```

### 복잡한 의존성 예시

```yaml
name: complex-workflow
description: 복잡한 의존성이 있는 워크플로우
mode: supervised

steps:
  - name: spec
    agent: architect
    outputs:
      - context/spec.md

  - name: design-api
    agent: api-designer
    depends_on:
      - spec
    outputs:
      - context/api-design.md

  - name: design-ui
    agent: ui-designer
    depends_on:
      - spec
    outputs:
      - context/ui-design.md

  - name: implement-api
    agent: backend-dev
    depends_on:
      - design-api
    outputs:
      - context/api-impl.md

  - name: implement-ui
    agent: frontend-dev
    depends_on:
      - design-ui
      - design-api    # API 설계도 필요
    outputs:
      - context/ui-impl.md

  - name: integration
    agent: tester
    depends_on:
      - implement-api
      - implement-ui
```

---

## 환경 변수

### 전역 환경 변수

```yaml
name: env-workflow
config:
  env:
    NODE_ENV: production
    DEBUG: "false"

steps:
  - name: build
    agent: builder
    env:
      BUILD_TARGET: web    # 단계별 오버라이드
```

### 내장 환경 변수

에이전트 실행 시 자동으로 주입되는 변수입니다.

| 변수 | 설명 |
|------|------|
| `OBORA_PROJECT_PATH` | 프로젝트 경로 |
| `OBORA_FEATURE` | 현재 feature 이름 |
| `OBORA_STEP` | 현재 단계 이름 |
| `OBORA_WORKFLOW` | 워크플로우 이름 |
| `OBORA_RUN_ID` | 실행 ID |

---

## 엣지 케이스

### 빈 steps

```yaml
name: empty-workflow
steps: []
# ERROR: steps는 최소 1개 이상 필요
```

### 중복 step 이름

```yaml
steps:
  - name: build
    agent: builder
  - name: build
    agent: builder
# ERROR: step 이름은 고유해야 함
```

### 존재하지 않는 depends_on

```yaml
steps:
  - name: build
    agent: builder
    depends_on:
      - nonexistent
# ERROR: 'nonexistent' 단계가 존재하지 않음
```

### 순환 의존성

```yaml
steps:
  - name: a
    depends_on: [c]
  - name: b
    depends_on: [a]
  - name: c
    depends_on: [b]
# ERROR: 순환 의존성 감지: a → c → b → a
```

---

## TypeScript 타입 정의

완전한 TypeScript 타입 정의입니다.

```typescript
/** 시간 간격 타입 (예: "30s", "5m", "1h") */
type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

/** Duration 파싱 함수 */
function parseDuration(duration: Duration): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  
  return value * multipliers[unit];
}

/** 실행 모드 */
type ExecutionMode = 'auto' | 'supervised' | 'gated';

/** 실패 시 동작 */
type OnFailure = 'continue' | 'pause' | 'abort' | 'retry';

/** 액션 (discriminated union) */
type Action = 
  | { notify: string }
  | { snapshot: boolean }
  | { pause: boolean }
  | { abort: boolean };

/** 백오프 전략 */
interface BackoffStrategy {
  exponential?: boolean;
  max_delay?: Duration;
  multiplier?: number;    // 기본값: 2
  jitter?: boolean;       // 무작위 변동
}

/** 전역 설정 */
interface WorkflowConfig {
  retry?: number;
  retry_delay?: Duration;
  timeout?: Duration;
  on_failure?: Action[];
  env?: Record<string, string>;
}

/** 단계 정의 */
interface Step {
  /** 단계 이름 (고유, 필수) */
  name: string;
  
  /** 에이전트 ID (필수) */
  agent: string;
  
  /** 단계 설명 */
  description?: string;
  
  /** 실패해도 계속 진행 */
  optional?: boolean;
  
  /** 병렬 실행 허용 (기본: true) */
  parallel?: boolean;
  
  /** 승인 게이트 (gated 모드) */
  gate?: boolean;
  
  /** 재시도 횟수 */
  retry?: number;
  
  /** 재시도 간격 */
  retry_delay?: Duration;
  
  /** 백오프 전략 */
  backoff?: BackoffStrategy;
  
  /** 타임아웃 */
  timeout?: Duration;
  
  /** 입력 파일 목록 */
  inputs?: string[];
  
  /** 출력 파일 목록 */
  outputs?: string[];
  
  /** 의존 단계 목록 */
  depends_on?: string[];
  
  /** 실패 시 동작 */
  on_failure?: Action[];
  
  /** 환경 변수 */
  env?: Record<string, string>;
}

/** 워크플로우 정의 */
interface Workflow {
  /** 워크플로우 이름 (필수) */
  name: string;
  
  /** 설명 */
  description?: string;
  
  /** 버전 (semver) */
  version?: string;
  
  /** 실행 모드 (기본: auto) */
  mode?: ExecutionMode;
  
  /** 전역 설정 */
  config?: WorkflowConfig;
  
  /** 단계 목록 (필수, 1개 이상) */
  steps: Step[];
}

/** 검증 결과 */
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  code: string;           // E2xxx, E3xxx
  message: string;
  path?: string;          // JSON path (e.g., "steps[0].name")
  line?: number;
}

interface ValidationWarning {
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
}
```

### Duration 파싱 규칙

| 입력 | 결과 (ms) | 유효 |
|------|----------|------|
| `30s` | 30000 | ✅ |
| `5m` | 300000 | ✅ |
| `1h` | 3600000 | ✅ |
| `7d` | 604800000 | ✅ |
| `30` | - | ❌ (단위 없음) |
| `5min` | - | ❌ (잘못된 단위) |
| `-5m` | - | ❌ (음수) |
| `5.5m` | - | ❌ (소수) |

### 타입 가드

```typescript
function isValidDuration(value: unknown): value is Duration {
  if (typeof value !== 'string') return false;
  return /^\d+[smhd]$/.test(value);
}

function isValidAction(value: unknown): value is Action {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  const key = keys[0];
  return ['notify', 'snapshot', 'pause', 'abort'].includes(key);
}

function isValidStep(value: unknown): value is Step {
  if (typeof value !== 'object' || value === null) return false;
  const step = value as Record<string, unknown>;
  return typeof step.name === 'string' && typeof step.agent === 'string';
}
```

---

## MVP vs Full

### MVP

- [x] 기본 스키마 (name, steps)
- [x] mode: auto
- [x] inputs/outputs
- [x] depends_on
- [x] retry (기본)
- [x] 내장 워크플로우 (simple)

### Full

- [ ] mode: supervised, gated
- [ ] 지수 백오프
- [ ] on_failure 액션
- [ ] 환경 변수
- [ ] 병렬 실행
- [ ] config 상속

---

*마지막 수정: 2026-02-03*
