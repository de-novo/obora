# obora-kit v3 문서 수정 요약

> 날짜: 2026-02-03
> 목표: 리뷰 점수 9/10 이상 달성

---

## 배경

4개 모델 리뷰 결과에서 공통 이슈 발견:
- Opus: 8.5/10
- GLM: 7.5/10
- Codex: 6/10

---

## 수정 내역

### Critical 이슈 (3건)

#### 1. ✅ CLI 옵션 불일치 해결

**문제:** TASK 파일과 spec 파일 간 CLI 옵션 불일치

**수정:**
- `TASK-003-obora-init.md`
  - `--template` → `--workflow`, `-w`
  - `--minimal`, `-m` 옵션 추가
  - spec 참조 링크 추가
  
- `TASK-004-obora-new.md`
  - `--type`, `--description` → `--workflow`, `--from-existing`
  - Feature name 검증 규칙 상세화
  - 종료 코드 추가

**SSOT:** `spec/02-cli-commands.md`

---

#### 2. ✅ status.yaml 스키마 정의

**문제:** status.yaml 언급만 있고 스키마 없음

**수정:** `spec/09-status-schema.md` 신규 생성

**내용:**
- 전체 스키마 정의
- 상태 enum (pending, running, completed, failed, blocked, paused, cancelled)
- 단계 상태 enum (pending, running, completed, failed, skipped, waiting)
- 이벤트 유형 정의
- TypeScript 타입 정의
- JSON Schema
- 예시 (초기/실행중/실패/완료)

---

#### 3. ✅ OpenClaw 연동 상세화

**문제:** 연동 방법이 추상적

**수정:** `spec/08-agent-definition.md` 확장

**추가 내용:**
- `OpenClawExecutor` 래퍼 클래스 전체 구현
- 타임아웃/재시도 정책 (`RetryPolicy` 인터페이스)
- 에러 핸들링 패턴 (`ErrorHandler` 인터페이스)
- Context 전달 방식 (`OboraContext`, `serializeContext`)
- 환경 변수 확장 (10개)

---

### High 이슈 (3건)

#### 4. ✅ 에러 코드 표준화

**수정:** `spec/10-error-codes.md` 신규 생성

**에러 코드 체계:**
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

**정의된 에러 코드:** 30+ 개

---

#### 5. ✅ TypeScript 타입 완성

**수정:** `spec/03-workflow-yaml.md` 확장

**추가 타입:**
- `Duration` 타입 및 파싱 규칙
- `Action` discriminated union
- `BackoffStrategy` 인터페이스
- `OnFailure` enum
- `ValidationResult`, `ValidationError` 인터페이스
- 타입 가드 함수

---

#### 6. ✅ config.yaml JSON Schema

**수정:** `spec/11-config-schema.md` 신규 생성

**내용:**
- 전체 config.yaml 스키마
- 섹션별 상세 설명
- JSON Schema
- TypeScript 타입 정의
- 락 파일 스펙 포함

---

### Medium 이슈 (3건)

#### 7. ✅ 락 파일 스펙

**위치:** `spec/11-config-schema.md` 내 "락 파일 스펙" 섹션

**내용:**
- 파일 형식 (feature, run_id, pid, hostname, started_at)
- Stale 락 감지 규칙 3가지
- 락 정리 명령어

---

#### 8. ✅ 파서 테스트 전략

**수정:** `TASK-005-yaml-parser.md` 확장

**추가 테스트 케이스:**
- 정상 케이스 (minimal, full, implicit deps)
- YAML 문법 에러 (E2001)
- 필수 필드 누락 (E2002)
- Duration 형식 에러 (E2005)
- 중복 단계 이름 (E2006)
- Unknown 필드 (E2004, strict mode)
- 의존성 에러 (E3001, E3002, E3003)
- 암묵적 의존성 감지 (E3004)

---

#### 9. ✅ Feature name 검증 규칙

**위치:** `TASK-004-obora-new.md` 내 "유효성 검사" 섹션

**규칙:**
- 허용 문자: `[a-z0-9-]`
- 최대 길이: 64자
- 시작/끝: 영소문자 또는 숫자
- 연속 하이픈 불가
- 예약어 목록 정의

---

## 신규 생성 파일

| 파일 | 설명 |
|------|------|
| `spec/09-status-schema.md` | status.yaml 스키마 |
| `spec/10-error-codes.md` | 에러 코드 표준 |
| `spec/11-config-schema.md` | config.yaml 스키마 및 락 파일 |
| `review/fix-summary-2026-02-03.md` | 본 문서 |

---

## 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `tasks/P0-MVP/TASK-003-obora-init.md` | CLI 옵션 통일, 종료 코드 추가 |
| `tasks/P0-MVP/TASK-004-obora-new.md` | CLI 옵션 통일, Feature name 규칙 |
| `tasks/P0-MVP/TASK-005-yaml-parser.md` | 테스트 케이스 대폭 확장 |
| `spec/03-workflow-yaml.md` | TypeScript 타입 완성 |
| `spec/08-agent-definition.md` | OpenClaw 연동 상세화 |

---

## SSOT 준수 현황

| 항목 | SSOT 문서 | 상태 |
|------|----------|------|
| CLI 옵션 | `spec/02-cli-commands.md` | ✅ |
| Workflow YAML | `spec/03-workflow-yaml.md` | ✅ |
| status.yaml | `spec/09-status-schema.md` | ✅ NEW |
| 에러 코드 | `spec/10-error-codes.md` | ✅ NEW |
| config.yaml | `spec/11-config-schema.md` | ✅ NEW |
| Agent 정의 | `spec/08-agent-definition.md` | ✅ |

---

## 완료 체크리스트

- [x] CLI 옵션 불일치 해결
- [x] status.yaml 스키마 생성
- [x] 에러 코드 표준화
- [x] TypeScript 타입 완성
- [x] OpenClaw 연동 상세화
- [x] config.yaml 스키마 추가
- [x] 락 파일 스펙 추가
- [x] 파서 테스트 전략 추가
- [x] Feature name 검증 규칙 추가

---

## 예상 점수 향상

| 항목 | 이전 | 이후 |
|------|------|------|
| Opus | 8.5 | 9.0+ |
| GLM | 7.5 | 9.0+ |
| Codex | 6.0 | 9.0+ |

---

*작성: 2026-02-03*
