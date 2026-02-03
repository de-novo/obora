# Opus 리뷰 결과

> 리뷰일: 2026-02-03
> 리뷰어: Claude Opus (via OpenClaw)

---

## 요약

- **전체 평가: 중상**
- **문서 품질: 7.5/10**

스펙 문서는 전반적으로 잘 작성되었으나, **스펙과 태스크 문서 간 불일치**가 가장 큰 문제입니다. MVP에 필요한 핵심 태스크(plan, run, done, status)가 누락되어 있습니다.

---

## 스펙 문서 리뷰 (docs/spec/)

### 잘 된 부분 ✅

1. **8원칙 명확한 정의** (01-overview)
   - Fluid, Iterative, Easy, Brownfield, Scalable, Traceable, SSOT, Spec-First
   - 각 원칙이 어디에 적용되는지 명시

2. **CLI 명령어 상세 스펙** (02-cli-commands)
   - 옵션, 에러 코드, 종료 코드가 체계적
   - 예시와 동작 설명이 풍부

3. **YAML 스키마 완성도** (03-workflow-yaml, 06-yaml-validation)
   - JSON Schema 정의가 상세
   - 다양한 예시 워크플로우 포함

4. **알고리즘 문서화** (05-dependency-resolver)
   - Kahn's Algorithm, DFS 순환 감지 의사코드 및 TypeScript 구현
   - 엣지 케이스 7가지 명시

5. **DB 스키마 설계** (07-database-schema)
   - ERD, 테이블 정의, 인덱스, 쿼리 예시 완비
   - 마이그레이션 전략 포함

6. **에이전트 정의 체계** (08-agent-definition)
   - 마크다운 기반 에이전트 정의 형식 명확
   - 내장 에이전트 5개 전체 프롬프트 포함

### 개선 필요 ⚠️

| 문제 | 위치 | 설명 |
|------|------|------|
| **용어 불일치** | 전체 | 스펙에서는 `step`, 태스크에서는 `stage`/`task` 혼용 |
| **폴더 구조 불일치** | 04 vs TASK-004 | 스펙: `context/`, 태스크: `proposals/`, `designs/`, `evidence/` |
| **에러 코드 체계 분산** | 02, 06 | CLI 종료 코드와 검증 에러 코드가 다른 네임스페이스 |
| **타입 정의 분산** | 03~08 | TypeScript 인터페이스가 각 문서에 흩어져 있음 |
| **상호 참조 부족** | 전체 | 문서 링크는 있으나 섹션별 정확한 참조 없음 |

### 누락 사항 ❌

1. **config.yaml 전체 스키마** - 예시만 있고 JSON Schema 없음
2. **로깅 스펙** - 로그 레벨, 포맷, 저장 위치 미정의
3. **보안 스펙** - API 키, 민감 정보 처리 방법 없음
4. **테스트 전략** - 단위/통합/E2E 테스트 범위 미정의
5. **CI/CD 연동** - GitHub Actions 등 통합 방법 없음
6. **에러 복구 시나리오** - resume 명령어 상세 동작 미정의

---

## 태스크 문서 리뷰 (docs/tasks/P0-MVP/)

### 잘 된 부분 ✅

1. **명확한 메타데이터**
   - 우선순위(P0), 예상 소요시간, 담당자 명시

2. **의존성 정의**
   - 태스크 간 선후 관계 명확 (예: TASK-003 → TASK-002 → TASK-001)

3. **테스트 케이스 포함**
   - bash 또는 TypeScript로 검증 방법 제시

4. **참고 자료 링크**
   - 관련 공식 문서, 라이브러리 URL 포함

### 개선 필요 ⚠️

| 문제 | 위치 | 설명 |
|------|------|------|
| **스펙과 타입 불일치** | TASK-005 | `Stage`, `ExecutionLevel` enum이 스펙(03)과 다름 |
| **폴더 구조 불일치** | TASK-004, 009 | `proposals/`, `designs/`, `evidence/` vs 스펙의 `context/` |
| **상태 enum 불일치** | TASK-009 | `FeatureStatus`가 스펙(07)의 `workflow_runs.status`와 다름 |
| **완료 조건 형식 혼재** | 전체 | 체크박스 `- [ ]`와 단순 목록 혼용 |
| **테스트 형식 혼재** | 전체 | bash와 TypeScript가 태스크별로 다름 |

### 누락 사항 ❌ (치명적)

**MVP 범위에 포함된 명령어 중 태스크 미생성:**

| 명령어 | 스펙 위치 | 태스크 | 상태 |
|--------|----------|--------|------|
| `obora plan` | 02-cli-commands | ❌ 없음 | **누락** |
| `obora run` | 02-cli-commands | ❌ 없음 | **누락** |
| `obora done` | 02-cli-commands | ❌ 없음 | **누락** |
| `obora status` | 02-cli-commands | ❌ 없음 | **누락** |

**기타 누락 태스크:**

1. **Agent Registry 구현** - 08-agent-definition의 AgentRegistry 인터페이스 구현
2. **내장 에이전트/워크플로우 파일 생성** - 실제 .md/.yaml 파일 생성
3. **OpenClaw 연동** - sessions_spawn 호출 래퍼
4. **Tracker 구현** - File + DB 이중 기록 (01-overview 언급)
5. **통합 테스트 태스크** - E2E 시나리오 검증
6. **문서화 태스크** - README, CONTRIBUTING 등

---

## 우선 수정 권장 (Top 5)

### 1. 🔴 누락된 MVP 태스크 추가 (Critical)

```
TASK-011: obora plan 명령어 구현
TASK-012: obora run 명령어 구현
TASK-013: obora status 명령어 구현
TASK-014: obora done 명령어 구현
TASK-015: Agent Registry 구현
TASK-016: OpenClaw 연동 (Executor)
```

**이유:** 스펙 02-cli-commands에서 MVP 범위로 명시된 명령어들의 구현 태스크가 없음

---

### 2. 🟠 용어 및 폴더 구조 통일 (High)

**현재:**
- 스펙 03: `step` (YAML 단위)
- 스펙 04: `context/` (에이전트 출력)
- 태스크: `stage`, `task`, `proposals/`, `designs/`, `evidence/`

**권장:**
- 스펙 기준으로 태스크 문서 수정
- 또는 스펙을 태스크에 맞게 업데이트 (결정 필요)

**영향 범위:** TASK-004, TASK-005, TASK-009

---

### 3. 🟠 타입 정의 통합 문서 생성 (High)

**현재:** 8개 스펙 문서에 TypeScript 인터페이스 분산

**권장:**
```
docs/spec/09-types.md  (또는)
packages/core/src/types/index.ts
```

**포함 내용:**
- Workflow, Step, Agent, ExecutionPlan 등 모든 인터페이스
- 상태 enum (WorkflowStatus, StepStatus, FeatureStatus)
- 에러 타입

---

### 4. 🟡 config.yaml 전체 스키마 추가 (Medium)

**현재:** 04-folder-structure에 예시만 있음

**권장:** 06-yaml-validation처럼 JSON Schema 정의

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Obora Config",
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "default_workflow": { "type": "string" },
    "spec_first": { ... },
    "concurrency": { ... },
    "notifications": { ... },
    "openclaw": { ... }
  }
}
```

---

### 5. 🟡 테스트 전략 문서 추가 (Medium)

**권장 위치:** `docs/spec/10-testing-strategy.md`

**포함 내용:**
- 단위 테스트 범위 (packages별)
- 통합 테스트 시나리오
- E2E 테스트 (CLI → Core → DB 흐름)
- 테스트 도구 (Vitest, Playwright 등)
- 커버리지 목표

---

## 부록: 상세 불일치 목록

### A. 타입 정의 불일치

| 스펙 문서 | 태스크 문서 | 불일치 내용 |
|----------|-----------|------------|
| 03-workflow.md: `Step` | TASK-005: `Stage`, `Task` | 용어 및 구조 다름 |
| 03-workflow.md: `mode` (auto/supervised/gated) | TASK-005: 없음 | 태스크에 mode 개념 없음 |
| 07-database.md: `status` (pending/running/...) | TASK-009: `FeatureStatus` | enum 값 다름 |

### B. 폴더 구조 불일치

| 스펙 04-folder-structure | TASK-004, TASK-009 |
|-------------------------|-------------------|
| `.obora/features/<name>/context/` | `.obora/features/<name>/proposals/`, `designs/`, `evidence/` |
| `proposal.md`, `design.md` (루트) | 하위 폴더에 분산 |

### C. 누락된 스펙 참조

| 태스크 | 참조해야 할 스펙 | 현재 |
|-------|---------------|------|
| TASK-005 | 03-workflow-yaml | 일부만 반영 |
| TASK-006 | 06-yaml-validation | 일부만 반영 |
| TASK-010 | 07-database-schema | 테이블 구조 다름 |

---

## 결론

문서 품질은 양호하나, **스펙-태스크 동기화**가 핵심 과제입니다.

**즉시 조치:**
1. 누락된 4개 MVP 명령어 태스크 생성
2. 용어/폴더 구조 결정 및 통일

**이후 조치:**
3. 타입 통합 문서
4. config.yaml 스키마
5. 테스트 전략

---

*리뷰 완료: 2026-02-03 20:31 KST*
