# Configuration Schema Specification

> 버전: v3
> 패키지: @obora/core (config-loader)

---

## 개요

`config.yaml`은 obora-kit의 전역 설정을 정의합니다.

### 파일 위치

```
.obora/config.yaml
```

---

## 전체 스키마

```yaml
# 스키마 버전
version: "3"

# 기본 워크플로우
default_workflow: simple

# 스펙 검증 설정
spec_first:
  required:                       # 필수 스펙 파일
    - proposal.md
    - design.md
  on_missing: block               # block | warn | allow

# 동시성 제어
concurrency:
  feature_lock: true              # 피처 락 사용
  lock_timeout: 30s               # 락 타임아웃
  stale_lock_threshold: 30m       # stale 락 감지 기준

# OpenClaw 연동
openclaw:
  default_model: zai/glm-4.7      # 기본 모델
  timeout: 300000                 # 타임아웃 (ms)
  retry:
    max_retries: 3                # 최대 재시도
    base_delay: 10s               # 기본 대기
    backoff: exponential          # fixed | linear | exponential
    max_delay: 5m                 # 최대 대기
  gateway_url: null               # 커스텀 게이트웨이 (선택)

# 알림 설정
notifications:
  channels:                       # 알림 채널
    - telegram
  on_failure: true                # 실패 시 알림
  on_complete: false              # 완료 시 알림
  on_gate: true                   # 게이트 대기 시 알림

# 데이터베이스
database:
  path: obora.db                  # DuckDB 파일 경로
  auto_vacuum: true               # 자동 정리
  backup_on_upgrade: true         # 업그레이드 시 백업

# 로깅
logging:
  level: info                     # debug | info | warn | error
  file: null                      # 로그 파일 (선택)
  format: pretty                  # pretty | json

# 아카이브 설정
archive:
  date_prefix: true               # 날짜 접두사 (YYYY-MM-)
  generate_log: true              # execution.log 생성
  compress: false                 # 압축 (추후 구현)
```

---

## 섹션별 상세

### version

```yaml
version: "3"
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `version` | string | ✅ | "3" | 설정 스키마 버전 |

---

### default_workflow

```yaml
default_workflow: simple
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `default_workflow` | string | ⬜ | "simple" | `obora new` 시 기본 워크플로우 |

---

### spec_first

스펙 우선 개발 설정입니다.

```yaml
spec_first:
  required:
    - proposal.md
    - design.md
  on_missing: block
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `required` | string[] | ⬜ | `["proposal.md"]` | 필수 스펙 파일 |
| `on_missing` | enum | ⬜ | "block" | 누락 시 동작 |

**on_missing 값:**

| 값 | 설명 |
|------|------|
| `block` | 워크플로우 실행 차단 |
| `warn` | 경고만 표시, 실행 계속 |
| `allow` | 무시 |

---

### concurrency

동시성 제어 설정입니다.

```yaml
concurrency:
  feature_lock: true
  lock_timeout: 30s
  stale_lock_threshold: 30m
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `feature_lock` | boolean | ⬜ | true | 피처별 락 사용 |
| `lock_timeout` | duration | ⬜ | "30s" | 락 획득 타임아웃 |
| `stale_lock_threshold` | duration | ⬜ | "30m" | stale 락 판정 기준 |

---

### openclaw

OpenClaw 연동 설정입니다.

```yaml
openclaw:
  default_model: zai/glm-4.7
  timeout: 300000
  retry:
    max_retries: 3
    base_delay: 10s
    backoff: exponential
    max_delay: 5m
  gateway_url: null
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `default_model` | string | ⬜ | "zai/glm-4.7" | 기본 AI 모델 |
| `timeout` | number | ⬜ | 300000 | 타임아웃 (ms) |
| `retry.max_retries` | number | ⬜ | 3 | 최대 재시도 횟수 |
| `retry.base_delay` | duration | ⬜ | "10s" | 재시도 기본 간격 |
| `retry.backoff` | enum | ⬜ | "exponential" | 백오프 전략 |
| `retry.max_delay` | duration | ⬜ | "5m" | 최대 대기 시간 |
| `gateway_url` | string | ⬜ | null | 커스텀 게이트웨이 URL |

---

### notifications

알림 설정입니다.

```yaml
notifications:
  channels:
    - telegram
  on_failure: true
  on_complete: false
  on_gate: true
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `channels` | string[] | ⬜ | [] | 알림 채널 목록 |
| `on_failure` | boolean | ⬜ | true | 실패 시 알림 |
| `on_complete` | boolean | ⬜ | false | 완료 시 알림 |
| `on_gate` | boolean | ⬜ | true | 게이트 대기 시 알림 |

---

### database

DuckDB 설정입니다.

```yaml
database:
  path: obora.db
  auto_vacuum: true
  backup_on_upgrade: true
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `path` | string | ⬜ | "obora.db" | DB 파일 경로 |
| `auto_vacuum` | boolean | ⬜ | true | 자동 정리 |
| `backup_on_upgrade` | boolean | ⬜ | true | 마이그레이션 시 백업 |

---

### logging

로깅 설정입니다.

```yaml
logging:
  level: info
  file: null
  format: pretty
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `level` | enum | ⬜ | "info" | 로그 레벨 |
| `file` | string | ⬜ | null | 로그 파일 경로 |
| `format` | enum | ⬜ | "pretty" | 출력 형식 |

**level 값:** `debug`, `info`, `warn`, `error`

**format 값:** `pretty`, `json`

---

### archive

아카이브 설정입니다.

```yaml
archive:
  date_prefix: true
  generate_log: true
  compress: false
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `date_prefix` | boolean | ⬜ | true | YYYY-MM- 접두사 |
| `generate_log` | boolean | ⬜ | true | execution.log 생성 |
| `compress` | boolean | ⬜ | false | 압축 (미구현) |

---

## 락 파일 스펙

### 파일 위치

```
.obora/lock
```

### 형식

```yaml
feature: user-auth
run_id: run-2026-02-03-001
pid: 12345
hostname: my-machine
started_at: "2026-02-03T16:30:00+09:00"
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `feature` | string | 락된 피처 이름 |
| `run_id` | string | 실행 ID |
| `pid` | number | 프로세스 ID |
| `hostname` | string | 호스트 이름 |
| `started_at` | datetime | 락 획득 시간 |

### Stale 락 감지 규칙

락이 다음 조건 중 하나를 만족하면 stale로 판정:

1. `started_at`이 `stale_lock_threshold` (기본 30분) 초과
2. `pid` 프로세스가 존재하지 않음
3. `hostname`이 현재 호스트와 다르고 `started_at` > 10분

### 락 정리

```bash
# stale 락만 정리
obora lock clean

# 모든 락 강제 정리
obora lock clean --force

# 확인만
obora lock clean --dry-run
```

---

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://obora.dev/schemas/config.yaml.json",
  "title": "Obora Config YAML",
  "type": "object",
  "required": ["version"],
  "properties": {
    "version": {
      "type": "string",
      "const": "3"
    },
    "default_workflow": {
      "type": "string",
      "default": "simple"
    },
    "spec_first": {
      "type": "object",
      "properties": {
        "required": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["proposal.md"]
        },
        "on_missing": {
          "type": "string",
          "enum": ["block", "warn", "allow"],
          "default": "block"
        }
      }
    },
    "concurrency": {
      "type": "object",
      "properties": {
        "feature_lock": {
          "type": "boolean",
          "default": true
        },
        "lock_timeout": {
          "type": "string",
          "pattern": "^\\d+[smhd]$",
          "default": "30s"
        },
        "stale_lock_threshold": {
          "type": "string",
          "pattern": "^\\d+[smhd]$",
          "default": "30m"
        }
      }
    },
    "openclaw": {
      "type": "object",
      "properties": {
        "default_model": {
          "type": "string",
          "default": "zai/glm-4.7"
        },
        "timeout": {
          "type": "number",
          "minimum": 1000,
          "default": 300000
        },
        "retry": {
          "type": "object",
          "properties": {
            "max_retries": {
              "type": "integer",
              "minimum": 0,
              "maximum": 10,
              "default": 3
            },
            "base_delay": {
              "type": "string",
              "pattern": "^\\d+[smhd]$",
              "default": "10s"
            },
            "backoff": {
              "type": "string",
              "enum": ["fixed", "linear", "exponential"],
              "default": "exponential"
            },
            "max_delay": {
              "type": "string",
              "pattern": "^\\d+[smhd]$",
              "default": "5m"
            }
          }
        },
        "gateway_url": {
          "type": ["string", "null"]
        }
      }
    },
    "notifications": {
      "type": "object",
      "properties": {
        "channels": {
          "type": "array",
          "items": { "type": "string" },
          "default": []
        },
        "on_failure": {
          "type": "boolean",
          "default": true
        },
        "on_complete": {
          "type": "boolean",
          "default": false
        },
        "on_gate": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "database": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "default": "obora.db"
        },
        "auto_vacuum": {
          "type": "boolean",
          "default": true
        },
        "backup_on_upgrade": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "logging": {
      "type": "object",
      "properties": {
        "level": {
          "type": "string",
          "enum": ["debug", "info", "warn", "error"],
          "default": "info"
        },
        "file": {
          "type": ["string", "null"]
        },
        "format": {
          "type": "string",
          "enum": ["pretty", "json"],
          "default": "pretty"
        }
      }
    },
    "archive": {
      "type": "object",
      "properties": {
        "date_prefix": {
          "type": "boolean",
          "default": true
        },
        "generate_log": {
          "type": "boolean",
          "default": true
        },
        "compress": {
          "type": "boolean",
          "default": false
        }
      }
    }
  }
}
```

---

## TypeScript 타입 정의

```typescript
type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'pretty' | 'json';
type OnMissingAction = 'block' | 'warn' | 'allow';
type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

interface SpecFirstConfig {
  required?: string[];
  on_missing?: OnMissingAction;
}

interface ConcurrencyConfig {
  feature_lock?: boolean;
  lock_timeout?: Duration;
  stale_lock_threshold?: Duration;
}

interface RetryConfig {
  max_retries?: number;
  base_delay?: Duration;
  backoff?: BackoffStrategy;
  max_delay?: Duration;
}

interface OpenClawConfig {
  default_model?: string;
  timeout?: number;
  retry?: RetryConfig;
  gateway_url?: string | null;
}

interface NotificationsConfig {
  channels?: string[];
  on_failure?: boolean;
  on_complete?: boolean;
  on_gate?: boolean;
}

interface DatabaseConfig {
  path?: string;
  auto_vacuum?: boolean;
  backup_on_upgrade?: boolean;
}

interface LoggingConfig {
  level?: LogLevel;
  file?: string | null;
  format?: LogFormat;
}

interface ArchiveConfig {
  date_prefix?: boolean;
  generate_log?: boolean;
  compress?: boolean;
}

interface OboraConfig {
  version: '3';
  default_workflow?: string;
  spec_first?: SpecFirstConfig;
  concurrency?: ConcurrencyConfig;
  openclaw?: OpenClawConfig;
  notifications?: NotificationsConfig;
  database?: DatabaseConfig;
  logging?: LoggingConfig;
  archive?: ArchiveConfig;
}

/** 락 파일 */
interface LockFile {
  feature: string;
  run_id: string;
  pid: number;
  hostname: string;
  started_at: string;  // ISO 8601
}
```

---

## 관련 문서

- [[02-cli-commands.md]] - CLI 명령어
- [[04-folder-structure.md]] - 폴더 구조
- [[09-status-schema.md]] - 상태 스키마
- [[10-error-codes.md]] - 에러 코드

---

*마지막 수정: 2026-02-03*
