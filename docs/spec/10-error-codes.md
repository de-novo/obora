# Error Codes Specification

> 버전: v3
> 패키지: @obora/core (error-handler)

---

## 개요

obora-kit은 일관된 에러 코드 체계를 사용하여 문제 해결을 용이하게 합니다.

### 에러 코드 형식

```
E<카테고리><세부코드>

예: E1001 = CLI 카테고리(1) + Invalid argument(001)
```

### 카테고리 분류

| 카테고리 | 범위 | 설명 |
|---------|------|------|
| E1xxx | CLI | CLI 인자/옵션 관련 |
| E2xxx | YAML | YAML 파싱/검증 관련 |
| E3xxx | Dependency | 의존성 해석 관련 |
| E4xxx | Execution | 실행 시 발생 |
| E5xxx | Database | DuckDB 관련 |
| E6xxx | Agent | 에이전트/OpenClaw 관련 |
| E7xxx | FileSystem | 파일 시스템 관련 |
| E8xxx | Config | 설정 관련 |
| E9xxx | Internal | 내부 오류 |

---

## E1xxx: CLI 에러

### E1001: Invalid Argument

```
E1001: Invalid argument '<arg>'
```

**원인:** 명령어에 유효하지 않은 인자 전달

**예시:**
```bash
obora init --unknown-flag
# E1001: Invalid argument '--unknown-flag'
```

**해결:** `obora <command> --help`로 유효한 옵션 확인

---

### E1002: Missing Required Argument

```
E1002: Missing required argument '<arg>'
```

**원인:** 필수 인자 누락

**예시:**
```bash
obora new
# E1002: Missing required argument 'feature-name'
```

**해결:** 필수 인자 제공

---

### E1003: Invalid Feature Name

```
E1003: Invalid feature name '<name>'. Must be kebab-case (a-z, 0-9, -)
```

**원인:** 피처 이름이 규칙에 맞지 않음

**규칙:**
- 허용 문자: `[a-z0-9-]`
- 최대 길이: 64자
- 시작/끝: 영소문자 또는 숫자
- 연속 하이픈 불가

**예시:**
```bash
obora new Invalid_Name
# E1003: Invalid feature name 'Invalid_Name'. Must be kebab-case (a-z, 0-9, -)
```

---

### E1004: Feature Already Exists

```
E1004: Feature '<name>' already exists
```

**원인:** 동일 이름의 피처 폴더 존재

**해결:** 다른 이름 사용 또는 기존 피처 아카이브

---

### E1005: Feature Not Found

```
E1005: Feature '<name>' not found
```

**원인:** 지정한 피처가 존재하지 않음

**해결:** `obora status`로 피처 목록 확인

---

### E1006: Already Initialized

```
E1006: Already initialized. Use --force to reinitialize
```

**원인:** `.obora/` 폴더가 이미 존재

**해결:** `--force` 옵션으로 재초기화

---

### E1007: Not Initialized

```
E1007: Not initialized. Run 'obora init' first
```

**원인:** `.obora/` 폴더 없음

**해결:** `obora init` 실행

---

### E1008: Reserved Feature Name

```
E1008: '<name>' is a reserved word and cannot be used as feature name
```

**예약어 목록:**
`init`, `new`, `plan`, `run`, `status`, `done`, `validate`, `lock`, `config`, `help`, `version`

---

## E2xxx: YAML 에러

### E2001: YAML Syntax Error

```
E2001: YAML syntax error at line <n>: <message>
```

**원인:** YAML 문법 오류

**예시:**
```yaml
name: workflow
steps:
  - name: step1
    agent: architect
    inputs:
    - file.md  # 잘못된 들여쓰기
```

---

### E2002: Missing Required Field

```
E2002: Missing required field '<field>' in <file>
```

**원인:** 필수 필드 누락

**예시:**
```yaml
# name 필드 누락
steps:
  - name: design
    agent: architect
```

---

### E2003: Invalid Field Type

```
E2003: Invalid type for '<field>': expected <type>, got <actual>
```

**원인:** 필드 타입 불일치

---

### E2004: Unknown Field

```
E2004: Unknown field '<field>' in <file> (strict mode)
```

**원인:** 정의되지 않은 필드 사용 (strict 모드)

---

### E2005: Invalid Duration Format

```
E2005: Invalid duration format '<value>'. Expected: <n>s, <n>m, <n>h, <n>d
```

**원인:** 시간 형식 오류

**유효한 형식:** `30s`, `5m`, `1h`, `7d`

---

### E2006: Duplicate Step Name

```
E2006: Duplicate step name '<name>' in workflow
```

**원인:** 동일한 단계 이름 중복 사용

---

### E2007: Invalid Enum Value

```
E2007: Invalid value '<value>' for '<field>'. Expected one of: <options>
```

**원인:** 허용되지 않는 enum 값

---

## E3xxx: 의존성 에러

### E3001: Circular Dependency

```
E3001: Circular dependency detected: <step1> → <step2> → ... → <step1>
```

**원인:** 순환 의존성

**예시:**
```yaml
steps:
  - name: a
    depends_on: [c]
  - name: b
    depends_on: [a]
  - name: c
    depends_on: [b]
# E3001: Circular dependency detected: a → c → b → a
```

---

### E3002: Missing Dependency

```
E3002: Step '<step>' depends on '<missing>' which does not exist
```

**원인:** 존재하지 않는 단계에 의존

---

### E3003: Self Dependency

```
E3003: Step '<step>' cannot depend on itself
```

**원인:** 자기 자신에 대한 의존성

---

### E3004: Unresolved Input

```
E3004: Input '<file>' required by '<step>' is not produced by any step
```

**원인:** 입력 파일을 생성하는 단계 없음 (암묵적 의존성 해석 실패)

---

## E4xxx: 실행 에러

### E4001: Agent Timeout

```
E4001: Agent '<agent>' timed out after <duration>
```

**원인:** 에이전트 실행 시간 초과

**해결:** `timeout` 설정 증가 또는 작업 분할

---

### E4002: Agent Failed

```
E4002: Agent '<agent>' failed: <message>
```

**원인:** 에이전트 실행 중 오류

---

### E4003: Already Running

```
E4003: Feature '<name>' is already running (run_id: <id>)
```

**원인:** 동일 피처에 대한 중복 실행 시도

**해결:** `obora status`로 확인 후 완료 대기 또는 `obora cancel`

---

### E4004: Lock Acquisition Failed

```
E4004: Failed to acquire lock for '<feature>'. Another process may be running
```

**원인:** 락 획득 실패

**해결:** `obora lock clean` 또는 잠시 후 재시도

---

### E4005: Step Failed

```
E4005: Step '<step>' failed after <n> retries
```

**원인:** 단계 실행 실패 (재시도 소진)

---

### E4006: Spec Validation Failed

```
E4006: Spec validation failed: <details>
```

**원인:** 필수 스펙 파일 누락 또는 검증 실패

**해결:** `proposal.md`, `design.md` 등 필수 파일 작성

---

### E4007: Workflow Not Completed

```
E4007: Workflow not completed. Cannot run 'obora done'
```

**원인:** 완료되지 않은 워크플로우에 `obora done` 시도

---

### E4008: Resume Not Possible

```
E4008: Cannot resume workflow in '<status>' status
```

**원인:** 재개 불가능한 상태

---

## E5xxx: 데이터베이스 에러

### E5001: Database Connection Failed

```
E5001: Failed to connect to database: <path>
```

**원인:** DuckDB 파일 접근 실패

---

### E5002: Database Corrupted

```
E5002: Database file appears to be corrupted
```

**원인:** DuckDB 파일 손상

**해결:** 백업에서 복원 또는 `obora.db` 재생성

---

### E5003: Query Failed

```
E5003: Database query failed: <message>
```

**원인:** SQL 쿼리 실행 실패

---

### E5004: Migration Failed

```
E5004: Database migration failed from v<from> to v<to>
```

**원인:** 스키마 마이그레이션 실패

---

## E6xxx: 에이전트 에러

### E6001: Agent Not Found

```
E6001: Agent '<id>' not found in registry
```

**원인:** 등록되지 않은 에이전트 참조

**해결:** `obora validate`로 사용 가능한 에이전트 확인

---

### E6002: Agent Definition Invalid

```
E6002: Invalid agent definition in '<file>': <message>
```

**원인:** 에이전트 마크다운 형식 오류

---

### E6003: OpenClaw Connection Failed

```
E6003: Failed to connect to OpenClaw
```

**원인:** OpenClaw 연결 실패

**해결:** OpenClaw 실행 상태 확인

---

### E6004: OpenClaw Session Error

```
E6004: OpenClaw session error: <message>
```

**원인:** OpenClaw 세션 중 오류

---

## E7xxx: 파일 시스템 에러

### E7001: Permission Denied

```
E7001: Permission denied: <path>
```

**원인:** 파일/폴더 접근 권한 없음

---

### E7002: File Not Found

```
E7002: File not found: <path>
```

**원인:** 파일 없음

---

### E7003: Directory Not Found

```
E7003: Directory not found: <path>
```

**원인:** 디렉토리 없음

---

### E7004: File Already Exists

```
E7004: File already exists: <path>
```

**원인:** 파일 이미 존재 (덮어쓰기 비활성화)

---

### E7005: Disk Full

```
E7005: No space left on device
```

**원인:** 디스크 공간 부족

---

## E8xxx: 설정 에러

### E8001: Config Not Found

```
E8001: Configuration file not found: <path>
```

**원인:** `config.yaml` 없음

---

### E8002: Config Invalid

```
E8002: Invalid configuration: <message>
```

**원인:** 설정 파일 형식 오류

---

### E8003: Workflow Not Found

```
E8003: Workflow '<name>' not found
```

**원인:** 지정한 워크플로우 없음

---

## E9xxx: 내부 에러

### E9001: Internal Error

```
E9001: Internal error: <message>
```

**원인:** 예상치 못한 내부 오류

**해결:** 로그 확인 후 이슈 보고

---

### E9002: Unexpected State

```
E9002: Unexpected state: <message>
```

**원인:** 비정상적인 상태 감지

---

## TypeScript 타입 정의

```typescript
/** 에러 카테고리 */
type ErrorCategory = 
  | 'cli' 
  | 'yaml' 
  | 'dependency' 
  | 'execution' 
  | 'database' 
  | 'agent' 
  | 'filesystem' 
  | 'config' 
  | 'internal';

/** 에러 정보 */
interface OboraError {
  code: string;           // E1001, E2001, ...
  category: ErrorCategory;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
  file?: string;
  line?: number;
}

/** 에러 클래스 */
class OboraError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly details?: Record<string, unknown>;
  readonly suggestion?: string;
  
  constructor(code: string, message: string, options?: {
    details?: Record<string, unknown>;
    suggestion?: string;
  }) {
    super(`${code}: ${message}`);
    this.name = 'OboraError';
    this.code = code;
    this.category = this.getCategory(code);
    this.details = options?.details;
    this.suggestion = options?.suggestion;
  }
  
  private getCategory(code: string): ErrorCategory {
    const prefix = code.charAt(1);
    const map: Record<string, ErrorCategory> = {
      '1': 'cli',
      '2': 'yaml',
      '3': 'dependency',
      '4': 'execution',
      '5': 'database',
      '6': 'agent',
      '7': 'filesystem',
      '8': 'config',
      '9': 'internal',
    };
    return map[prefix] || 'internal';
  }
}
```

---

## 종료 코드 매핑

CLI 명령어의 종료 코드와 에러 코드 매핑:

| 종료 코드 | 의미 | 관련 에러 |
|----------|------|----------|
| 0 | 성공 | - |
| 1 | 일반 에러 | E9xxx |
| 2 | 이미 초기화됨 | E1006 |
| 3 | 초기화 필요 | E1007 |
| 4 | OpenClaw 연결 실패 | E6003 |
| 5 | 스펙 검증 실패 | E4006 |
| 6 | 순환 의존성 | E3001 |
| 7 | 단계 실행 실패 | E4005 |
| 8 | 워크플로우 미완료 | E4007 |

---

## 관련 문서

- [[02-cli-commands.md]] - CLI 명령어
- [[06-yaml-validation.md]] - YAML 검증
- [[09-status-schema.md]] - 상태 스키마

---

*마지막 수정: 2026-02-03*
