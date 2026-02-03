# YAML Validation Specification

> 버전: v3
> 패키지: @obora/core (spec-validator)

---

## 개요

`obora validate` 명령어로 워크플로우 YAML 파일을 사전 검증합니다.

### 목적

- 실행 전 오류 조기 발견
- CI/CD 파이프라인 통합
- 개발자 피드백 향상

### 관련 원칙

| 원칙 | 적용 |
|------|------|
| **Spec-First** | 스펙 검증 후 실행 |
| **Easy** | 명확한 에러 메시지 |

---

## 검증 단계 (5단계)

```
입력: YAML 파일
    ↓
[1단계] YAML 문법 검증
    ↓ (통과)
[2단계] 스키마 구조 검증 (JSON Schema)
    ↓ (통과)
[3단계] 의존성 검증 (순환 감지)
    ↓ (통과)
[4단계] 참조 검증 (Agent ID, 경로)
    ↓ (통과)
[5단계] 런타임 검증 (선택적)
    ↓
출력: ValidationResult
```

### 단계별 설명

| 단계 | 검증 내용 | 필수 | 중단 |
|------|----------|------|------|
| 1 | YAML 문법 | ✅ | 즉시 |
| 2 | 스키마 구조 | ✅ | 즉시 |
| 3 | 순환 의존성 | ✅ | 에러 수집 후 |
| 4 | Agent/경로 존재 | ✅ | 에러 수집 후 |
| 5 | 런타임 조건 | ⬜ | 경고만 |

---

## 1단계: YAML 문법 검증

### 검증 항목

- YAML 파서 오류
- 인코딩 (UTF-8)
- 들여쓰기 오류
- 잘못된 특수 문자

### 에러 예시

```yaml
# 잘못된 YAML
steps:
  - name: design
    agent: architect
  - name: implement
   agent: developer    # 들여쓰기 오류
```

```
ERROR: YAML syntax error

  File: workflows/broken.yaml
  Line: 5
  
  Expected indentation of 4 spaces but found 3
  
    - name: implement
   agent: developer
   ^

  Suggestion: Fix indentation to match previous line
```

---

## 2단계: JSON Schema 검증

### 스키마 정의

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://obora-kit.dev/schemas/workflow.json",
  "title": "Obora Workflow",
  "type": "object",
  "required": ["name", "steps"],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "pattern": "^[a-z0-9-]+$",
      "description": "워크플로우 이름 (kebab-case)"
    },
    "description": {
      "type": "string",
      "maxLength": 500
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "default": "1.0.0"
    },
    "mode": {
      "type": "string",
      "enum": ["auto", "supervised", "gated"],
      "default": "auto"
    },
    "config": {
      "$ref": "#/definitions/config"
    },
    "steps": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/definitions/step"
      }
    }
  },
  "definitions": {
    "config": {
      "type": "object",
      "properties": {
        "retry": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10,
          "default": 0
        },
        "retry_delay": {
          "$ref": "#/definitions/duration"
        },
        "timeout": {
          "$ref": "#/definitions/duration"
        },
        "on_failure": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/action"
          }
        }
      }
    },
    "step": {
      "type": "object",
      "required": ["name", "agent"],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 50,
          "pattern": "^[a-z0-9-]+$"
        },
        "agent": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string",
          "maxLength": 200
        },
        "optional": {
          "type": "boolean",
          "default": false
        },
        "parallel": {
          "type": "boolean",
          "default": true
        },
        "gate": {
          "type": "boolean",
          "default": false
        },
        "retry": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10
        },
        "retry_delay": {
          "$ref": "#/definitions/duration"
        },
        "timeout": {
          "$ref": "#/definitions/duration"
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "outputs": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "depends_on": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "on_failure": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/action"
          }
        },
        "env": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        }
      }
    },
    "duration": {
      "type": "string",
      "pattern": "^\\d+[smhd]$",
      "description": "시간 형식: 30s, 5m, 1h, 1d"
    },
    "action": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "notify": { "type": "string" }
          },
          "required": ["notify"]
        },
        {
          "type": "object",
          "properties": {
            "snapshot": { "type": "boolean" }
          },
          "required": ["snapshot"]
        },
        {
          "type": "object",
          "properties": {
            "pause": { "type": "boolean" }
          },
          "required": ["pause"]
        },
        {
          "type": "object",
          "properties": {
            "abort": { "type": "boolean" }
          },
          "required": ["abort"]
        }
      ]
    }
  }
}
```

### 검증 항목

| 항목 | 검증 내용 |
|------|----------|
| 필수 필드 | `name`, `steps` 존재 |
| 타입 | 각 필드의 타입 일치 |
| 제약 조건 | minLength, pattern 등 |
| 열거형 | mode가 유효한 값인지 |
| 배열 | steps가 1개 이상인지 |

### 에러 예시

```yaml
name: 123                    # 문자열이어야 함
mode: manual                 # 유효하지 않은 mode
steps: []                    # 최소 1개 필요
```

```
ERROR: Schema validation failed (3 errors)

  [1] Invalid type
      Path: /name
      Expected: string
      Received: number (123)

  [2] Invalid enum value
      Path: /mode
      Expected: auto | supervised | gated
      Received: "manual"

  [3] Array too short
      Path: /steps
      Expected: minItems 1
      Received: 0 items
```

---

## 3단계: 의존성 검증

### 검증 항목

- 순환 의존성
- 존재하지 않는 의존성
- 중복 단계 이름

### 검증 로직

```typescript
function validateDependencies(steps: Step[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const stepNames = new Set(steps.map(s => s.name));
  
  // 중복 이름 검사
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.name)) {
      errors.push({
        code: 'DUPLICATE_STEP',
        message: `Duplicate step name: '${step.name}'`,
        path: `/steps/${step.name}`,
      });
    }
    seen.add(step.name);
  }
  
  // 존재하지 않는 의존성 검사
  for (const step of steps) {
    for (const dep of step.depends_on || []) {
      if (!stepNames.has(dep)) {
        errors.push({
          code: 'UNKNOWN_DEPENDENCY',
          message: `Step '${step.name}' depends on unknown step '${dep}'`,
          path: `/steps/${step.name}/depends_on`,
          suggestion: `Available steps: ${[...stepNames].join(', ')}`,
        });
      }
    }
  }
  
  // 순환 의존성 검사
  const cycleResult = detectCycles(steps);
  if (cycleResult.hasCycle) {
    errors.push({
      code: 'CIRCULAR_DEPENDENCY',
      message: `Circular dependency detected`,
      path: `/steps`,
      details: { cyclePath: cycleResult.cyclePath },
      suggestion: 'Check inputs/outputs references and depends_on',
    });
  }
  
  return errors;
}
```

### 에러 예시

```
ERROR: Dependency validation failed (2 errors)

  [1] Circular dependency
      Path: /steps
      Cycle: implement → test → review → implement
      
      Suggestion:
        - Check if 'review' should output to 'implement'
        - Consider breaking the cycle with optional steps

  [2] Unknown dependency
      Path: /steps/test/depends_on
      Step 'test' depends on 'implment' (typo?)
      
      Did you mean: 'implement'?
```

---

## 4단계: 참조 검증

### 검증 항목

- Agent ID 존재
- 입력 파일 경로 유효성
- 출력 경로 쓰기 가능 여부

### 검증 로직

```typescript
async function validateReferences(
  steps: Step[],
  agentRegistry: AgentRegistry,
  featurePath: string
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  
  for (const step of steps) {
    // Agent 존재 확인
    if (!agentRegistry.has(step.agent)) {
      errors.push({
        code: 'UNKNOWN_AGENT',
        message: `Agent '${step.agent}' not found`,
        path: `/steps/${step.name}/agent`,
        suggestion: `Available agents: ${agentRegistry.list().join(', ')}`,
      });
    }
    
    // 입력 파일 확인 (경고)
    for (const input of step.inputs || []) {
      const fullPath = path.join(featurePath, input);
      if (!await fileExists(fullPath)) {
        errors.push({
          code: 'INPUT_NOT_FOUND',
          message: `Input file '${input}' does not exist`,
          path: `/steps/${step.name}/inputs`,
          severity: 'warning',  // 경고만
          suggestion: 'File may be created by a previous step',
        });
      }
    }
  }
  
  return errors;
}
```

### 에러 예시

```
ERROR: Reference validation failed (1 error, 1 warning)

  [ERROR] Agent not found
      Path: /steps/implement/agent
      Agent: 'frontend-dev'
      
      Available agents:
        - architect
        - developer
        - tester
        - reviewer
        - general

  [WARNING] Input file not found
      Path: /steps/implement/inputs
      File: 'context/design-output.md'
      
      Note: This file may be created by the 'design' step
```

---

## 5단계: 런타임 검증

### 검증 항목 (선택적)

- OpenClaw 연결 상태
- 모델 가용성
- 리소스 제한

### 검증 로직

```typescript
async function validateRuntime(
  workflow: Workflow,
  options: ValidateOptions
): Promise<ValidationError[]> {
  if (!options.runtime) {
    return [];  // 런타임 검증 비활성화
  }
  
  const errors: ValidationError[] = [];
  
  // OpenClaw 연결 확인
  const clawStatus = await checkOpenClawStatus();
  if (!clawStatus.connected) {
    errors.push({
      code: 'OPENCLAW_UNAVAILABLE',
      message: 'OpenClaw is not running',
      severity: 'warning',
      suggestion: 'Run: openclaw gateway start',
    });
  }
  
  // 모델 가용성 (옵션)
  if (options.checkModels) {
    for (const step of workflow.steps) {
      const agent = agentRegistry.get(step.agent);
      if (agent?.model && !await isModelAvailable(agent.model)) {
        errors.push({
          code: 'MODEL_UNAVAILABLE',
          message: `Model '${agent.model}' is not available`,
          severity: 'warning',
        });
      }
    }
  }
  
  return errors;
}
```

---

## 에러 메시지 형식

### ValidationError 인터페이스

```typescript
interface ValidationError {
  /** 에러 코드 */
  code: string;
  
  /** 사람이 읽을 수 있는 메시지 */
  message: string;
  
  /** JSON Path 형식의 위치 */
  path?: string;
  
  /** 파일 내 라인 번호 */
  line?: number;
  
  /** 심각도 */
  severity: 'error' | 'warning';
  
  /** 추가 상세 정보 */
  details?: Record<string, any>;
  
  /** 해결 제안 */
  suggestion?: string;
}
```

### 에러 코드 목록

| 코드 | 설명 | 심각도 |
|------|------|--------|
| `YAML_SYNTAX` | YAML 문법 오류 | error |
| `SCHEMA_INVALID` | 스키마 불일치 | error |
| `MISSING_REQUIRED` | 필수 필드 누락 | error |
| `INVALID_TYPE` | 타입 불일치 | error |
| `INVALID_ENUM` | 열거형 값 오류 | error |
| `DUPLICATE_STEP` | 중복 단계 이름 | error |
| `CIRCULAR_DEPENDENCY` | 순환 의존성 | error |
| `UNKNOWN_DEPENDENCY` | 존재하지 않는 의존성 | error |
| `UNKNOWN_AGENT` | 존재하지 않는 에이전트 | error |
| `INPUT_NOT_FOUND` | 입력 파일 없음 | warning |
| `OPENCLAW_UNAVAILABLE` | OpenClaw 연결 실패 | warning |
| `MODEL_UNAVAILABLE` | 모델 사용 불가 | warning |

---

## CLI 출력 형식

### default 형식

```
$ obora validate

✗ Validation failed

  workflows/custom.yaml

    ERROR 1: Circular dependency
      Line: - (computed)
      Cycle: implement → test → review → implement
      
      Suggestion:
        Check inputs/outputs references and depends_on

    ERROR 2: Agent not found
      Line: 15
      Agent: 'frontend-dev'
      
      Available: architect, developer, tester, reviewer

    WARNING: Input file not found
      Line: 22
      File: 'context/design-output.md'
      
      Note: May be created by previous step

  ─────────────────────────────────────
  2 errors, 1 warning

Run 'obora validate --help' for options.
Exit code: 1
```

### json 형식

```bash
$ obora validate --format json
```

```json
{
  "valid": false,
  "file": "workflows/custom.yaml",
  "errors": [
    {
      "code": "CIRCULAR_DEPENDENCY",
      "message": "Circular dependency detected",
      "path": "/steps",
      "severity": "error",
      "details": {
        "cyclePath": ["implement", "test", "review", "implement"]
      },
      "suggestion": "Check inputs/outputs references and depends_on"
    },
    {
      "code": "UNKNOWN_AGENT",
      "message": "Agent 'frontend-dev' not found",
      "path": "/steps/implement/agent",
      "line": 15,
      "severity": "error",
      "suggestion": "Available agents: architect, developer, tester, reviewer"
    }
  ],
  "warnings": [
    {
      "code": "INPUT_NOT_FOUND",
      "message": "Input file 'context/design-output.md' does not exist",
      "path": "/steps/implement/inputs",
      "line": 22,
      "severity": "warning",
      "suggestion": "File may be created by a previous step"
    }
  ],
  "summary": {
    "errorCount": 2,
    "warningCount": 1
  }
}
```

---

## 검증 옵션

### CLI 옵션

```bash
obora validate [workflow] [options]

Options:
  --format <type>     출력 형식 (default, json)
  --verbose, -v       상세 출력
  --strict            경고도 에러 처리
  --no-runtime        런타임 검증 건너뛰기
  --check-models      모델 가용성 확인
  --fix               자동 수정 가능한 항목 수정 (Full)
```

### 프로그래매틱 API

```typescript
interface ValidateOptions {
  /** 출력 형식 */
  format?: 'default' | 'json';
  
  /** 상세 출력 */
  verbose?: boolean;
  
  /** 엄격 모드 (경고 = 에러) */
  strict?: boolean;
  
  /** 런타임 검증 포함 */
  runtime?: boolean;
  
  /** 모델 가용성 확인 */
  checkModels?: boolean;
}

interface ValidationResult {
  /** 유효 여부 */
  valid: boolean;
  
  /** 에러 목록 */
  errors: ValidationError[];
  
  /** 경고 목록 */
  warnings: ValidationError[];
  
  /** 요약 */
  summary: {
    errorCount: number;
    warningCount: number;
    checkedFiles: number;
  };
}

async function validate(
  workflowPath: string,
  options?: ValidateOptions
): Promise<ValidationResult>;
```

---

## 자동 수정 (Full 버전)

### 수정 가능 항목

| 코드 | 자동 수정 | 내용 |
|------|----------|------|
| `INVALID_INDENTATION` | ✅ | 들여쓰기 정렬 |
| `TRAILING_WHITESPACE` | ✅ | 후행 공백 제거 |
| `MISSING_NEWLINE` | ✅ | 파일 끝 개행 추가 |
| `UNKNOWN_DEPENDENCY` | ⬜ | 제안만 제공 |
| `CIRCULAR_DEPENDENCY` | ⬜ | 제안만 제공 |

### 사용법

```bash
# 자동 수정 가능 항목 표시
obora validate --fix --dry-run

# 실제 수정 적용
obora validate --fix
```

---

## MVP vs Full 구현

### MVP

- [x] YAML 문법 검증
- [x] 기본 스키마 검증 (필수 필드)
- [x] 순환 의존성 감지
- [x] 기본 에러 메시지
- [x] default 출력 형식

### Full

- [ ] 완전한 JSON Schema 검증
- [ ] 라인 번호 추적
- [ ] json 출력 형식
- [ ] 런타임 검증
- [ ] 자동 수정
- [ ] Did-you-mean 제안
- [ ] CI 통합 (GitHub Actions)

---

*마지막 수정: 2026-02-03*
