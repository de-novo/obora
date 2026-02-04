# TASK-003~014 Full Code Review (Opus)

> 날짜: 2026-02-04  
> 리뷰어: Claude Opus 4.5  
> 대상: obora-kit MVP 전체

---

## 📊 종합 점수표

| TASK | 모듈 | 점수 | Critical | High | Medium |
|------|------|------|----------|------|--------|
| TASK-003 | init.ts | 8.5/10 | 0 | 1 | 2 |
| TASK-004 | new.ts | 9.0/10 | 0 | 0 | 2 |
| TASK-007 | validate.ts | 8.0/10 | 0 | 2 | 1 |
| TASK-011 | plan.ts | 7.5/10 | 0 | 2 | 2 |
| TASK-012 | run.ts | 8.0/10 | 0 | 2 | 2 |
| TASK-013 | status.ts | 8.0/10 | 0 | 1 | 2 |
| TASK-014 | done.ts | 8.0/10 | 0 | 1 | 2 |
| TASK-005 | workflow-parser.ts | 9.0/10 | 0 | 0 | 2 |
| TASK-006 | workflow-validator.ts | 8.5/10 | 0 | 1 | 1 |
| TASK-008 | dependency-resolver.ts | 9.0/10 | 0 | 0 | 1 |
| TASK-009 | feature-manager.ts | 8.0/10 | 0 | 1 | 2 |
| TASK-010 | duckdb-client.ts | 8.5/10 | 0 | 1 | 1 |
| - | graph/index.ts | 9.0/10 | 0 | 0 | 1 |

**평균: 8.4/10** | **Critical: 0** | **High: 12** | **Medium: 21**

---

## TASK-003: init.ts (8.5/10)

### ✅ 스펙 일치 항목
- `--force`, `--workflow`, `--minimal` 옵션 구현 ✓
- `.obora/` 폴더 구조 생성 (workflows/, features/, archive/) ✓
- 기본 워크플로우 템플릿 (simple, standard) ✓
- 종료 코드 (0: 성공, 1: 에러, 2: 이미 초기화됨) ✓

### ❌ 이슈

#### [HIGH] DuckDB 파일 미초기화
```typescript
// 스펙: "DuckDB 파일 초기화 (obora.db)"
// 현재: DuckDB 파일 생성 로직 없음
```
**위치**: init.ts 전체  
**제안**: `@obora/database`의 `OboraDatabase.initialize()` 호출 추가

#### [MEDIUM] agents/ 폴더 누락
```typescript
// 스펙: ".obora/agents/ - 에이전트 정의" 
// 현재: 생성되지 않음
const dirs = [
  oboraDir,
  join(oboraDir, "workflows"),
  join(oboraDir, "features"),
  join(oboraDir, "archive"),
  // join(oboraDir, "agents"),  // 누락
];
```
**위치**: init.ts:116-120  
**제안**: `agents/` 폴더 및 내장 에이전트 파일 생성 추가

#### [MEDIUM] config.yaml 스펙 불일치
```yaml
# 스펙 config.yaml 구조
version: "3"
default_workflow: simple
spec_first:
  required:
    - proposal.md
    - design.md
  on_missing: block
concurrency:
  feature_lock: true
  lock_timeout: 30s

# 현재 구현 - 다른 구조
project:
  name: "my-project"
  version: "0.1.0"
settings:
  workflow: "simple"
```
**위치**: init.ts:7-21  
**제안**: 스펙에 맞는 config.yaml 구조로 변경

---

## TASK-004: new.ts (9.0/10)

### ✅ 스펙 일치 항목
- feature-name 검증 (kebab-case, 64자, 예약어) ✓
- `--workflow`, `--from-existing`, `--template` 옵션 ✓
- proposal.md, design.md, tasks.md 템플릿 생성 ✓
- status.yaml 생성 ✓
- 종료 코드 (0, 1, 3) ✓

### ❌ 이슈

#### [MEDIUM] 아카이브 이름 충돌 경고만
```typescript
// 현재: 경고만 출력
if (existsSync(archivedFeature)) {
  console.warn(`Warning: An archived feature...`);
}
// 개선: 사용자 확인 프롬프트 또는 더 눈에 띄는 경고 필요
```
**위치**: new.ts:168-171  
**제안**: Chalk로 강조하거나 `--force` 없이는 중단 고려

#### [MEDIUM] context/ 폴더 .gitkeep만 생성
```typescript
// 스펙: "context/ - 에이전트 출력 (자동 생성)"
// 현재: .gitkeep만 생성, README 없음
await fs.writeFile(join(featureDir, "context", ".gitkeep"), "", "utf-8");
```
**위치**: new.ts:189  
**제안**: context/README.md 추가하여 폴더 용도 설명

---

## TASK-007: validate.ts (8.0/10)

### ✅ 스펙 일치 항목
- `--all`, `--file`, `--strict` 옵션 ✓
- 색상 코딩된 출력 (chalk) ✓
- YAML 파일 재귀 탐색 ✓
- 요약 출력 ✓

### ❌ 이슈

#### [HIGH] `--format` 옵션 미구현
```typescript
// 스펙: "--format <type> - 출력 형식 (default, json)"
// 현재: format 옵션 없음
.option("--strict", "Treat warnings as errors")
// .option("-f, --format <type>", "Output format", "default")  // 누락
```
**위치**: validate.ts:127-131  
**제안**: JSON 출력 형식 추가 (CI 통합용)

#### [HIGH] `--verbose` 옵션 미구현
```typescript
// 스펙: "--verbose, -v - 상세 출력"
// 현재: verbose 옵션 없음
```
**위치**: validate.ts:127-131  
**제안**: verbose 모드 추가

#### [MEDIUM] 기본 동작이 help 표시
```typescript
// 스펙: "obora validate" → 모든 워크플로우 검증
// 현재: 옵션 없으면 help 표시
} else {
  cmd.help();  // 스펙과 다름
  return;
}
```
**위치**: validate.ts:155-158  
**제안**: 옵션 없으면 `--all`과 동일하게 동작

---

## TASK-011: plan.ts (7.5/10)

### ✅ 스펙 일치 항목
- `--dry-run`, `--agent`, `--model` 옵션 ✓
- proposal.md, design.md 읽기 ✓
- 기본 흐름 구현 ✓

### ❌ 이슈

#### [HIGH] feature 인자 → 옵션 불일치
```typescript
// 스펙: "obora plan [options]" → --feature 옵션
// 현재: "obora plan <name>" → 필수 인자
.argument("<name>", "Feature name")
```
**위치**: plan.ts:188  
**제안**: 스펙에 맞게 옵션으로 변경, 현재 디렉토리 자동 감지

#### [HIGH] AI 통합이 Placeholder
```typescript
// 현재: 하드코딩된 시뮬레이션
const simulatedPlan = `# Implementation Plan: ${featureName}...`;
return simulatedPlan;
```
**위치**: plan.ts:95-136  
**제안**: OpenClaw API 통합 또는 명확한 TODO 주석

#### [MEDIUM] `--interactive` 옵션 누락
```typescript
// 스펙: "--interactive, -i - 대화형 모드"
// 현재: 미구현
```
**위치**: plan.ts:188-195  
**제안**: MVP 범위 외 명시 또는 구현

#### [MEDIUM] status 업데이트 "planned"
```typescript
// status.yaml status enum: pending | running | completed | failed | blocked | paused | cancelled
// 현재: "planned" 사용 - enum에 없음
await updateStatus(featureDir, {
  status: "planned",  // 스펙에 없는 값
```
**위치**: plan.ts:175  
**제안**: "pending" 유지하거나 스펙에 "planned" 추가

---

## TASK-012: run.ts (8.0/10)

### ✅ 스펙 일치 항목
- `--dry-run`, `--from-step`, `--verbose`, `--continue-on-error` 옵션 ✓
- 워크플로우 파싱 및 실행 ✓
- 재시도 로직 ✓
- DuckDB 기록 플레이스홀더 ✓

### ❌ 이슈

#### [HIGH] feature 인자 vs 옵션 불일치
```typescript
// 스펙: "--feature, -f - 대상 기능 이름"
// 현재: .argument("<name>")
.argument("<name>", "Feature name")
```
**위치**: run.ts:357  
**제안**: 스펙과 일치시키거나 스펙 업데이트

#### [HIGH] mode 옵션 미구현
```typescript
// 스펙: "--mode, -m - 실행 모드 (auto, supervised, gated)"
// 현재: 옵션 없음, auto만 지원
```
**위치**: run.ts:357-363  
**제안**: mode 옵션 추가 (MVP에서는 auto만 동작해도 옵션은 추가)

#### [MEDIUM] 미사용 변수
```typescript
const _levelGroups = groupByLevel(workflow.steps);  // 사용 안 됨
```
**위치**: run.ts:250  
**제안**: 병렬 실행 시각화에 활용하거나 제거

#### [MEDIUM] 실제 에이전트 호출 누락
```typescript
// 플레이스홀더만 존재
async function executeStep(...): Promise<...> {
  // Placeholder: In production, this would call OpenClaw API
  const simulatedOutput = `# Output from step...`;
```
**위치**: run.ts:170-200  
**제안**: 명확한 TODO 또는 OpenClaw 통합

---

## TASK-013: status.ts (8.0/10)

### ✅ 스펙 일치 항목
- `--format`, `--feature`, `--verbose` 옵션 ✓
- default/json/minimal 출력 형식 ✓
- 진행률 계산 ✓
- 이모지 상태 표시 ✓

### ❌ 이슈

#### [HIGH] `--watch` 옵션 미구현
```typescript
// 스펙: "--watch, -w - 실시간 갱신"
// 현재: 옵션 없음
```
**위치**: status.ts:289-293  
**제안**: MVP 범위 외 명시 또는 기본 구현 추가

#### [MEDIUM] DuckDB 조회가 Mock 데이터
```typescript
async function getWorkflowRuns(featureName?: string): Promise<WorkflowRun[]> {
  // Placeholder: Returns mock data for demonstration
  return [{
    id: "run-1738617600000",
    ...
  }];
}
```
**위치**: status.ts:90-105  
**제안**: 실제 DB 조회로 교체

#### [MEDIUM] feature 옵션 이름 불일치
```typescript
// 스펙: "-f, --feature"
// 현재: "--feature" (단축 옵션 없음)
.option("--feature <name>", "Show status for a specific feature")
```
**위치**: status.ts:290  
**제안**: `-f` 단축 옵션 추가

---

## TASK-014: done.ts (8.0/10)

### ✅ 스펙 일치 항목
- `--commit`, `--message`, `--no-archive`, `--dry-run` 옵션 ✓
- 검증 로직 (running/failed 상태 체크) ✓
- execution.log 생성 ✓
- archive 이동 (타임스탬프 충돌 처리) ✓

### ❌ 이슈

#### [HIGH] feature 인자 vs 옵션
```typescript
// 스펙: "--feature, -f"
// 현재: .argument("<name>")
.argument("<name>", "Feature name")
```
**위치**: done.ts:237  
**제안**: 스펙 일치 또는 스펙 업데이트

#### [MEDIUM] Git 커밋이 플레이스홀더
```typescript
async function createGitCommit(featureName: string, message?: string): Promise<void> {
  log(`  [Git] Creating commit for ${featureName}...`);
  // Placeholder: In production, this would:
  // 1. git add the feature directory
  return;
}
```
**위치**: done.ts:138-152  
**제안**: simple-git 또는 exec 기반 구현

#### [MEDIUM] 아카이브 날짜 형식 불일치
```typescript
// 스펙: "YYYY-MM-feature-name" (예: 2026-02-user-auth)
// 현재: 타임스탬프 사용
const timestampedPath = join(archiveDir, `${featureName}-${timestamp}`);
```
**위치**: done.ts:162-163  
**제안**: 스펙 형식(`YYYY-MM-feature-name`)으로 변경

---

## TASK-005: workflow-parser.ts (9.0/10)

### ✅ 스펙 일치 항목
- name, steps 필수 필드 검증 ✓
- mode enum (auto, gated, manual) 검증 ✓
- duration 형식 검증 (`/^[1-9]\d*[smhd]$/`) ✓
- 순환 의존성 검사 ✓
- 암묵적 의존성 (inputs/outputs) 해석 ✓
- strict 모드 지원 ✓

### ❌ 이슈

#### [MEDIUM] mode "supervised" 누락
```typescript
// 스펙: mode: auto | supervised | gated
// 현재: auto | gated | manual
const validModes: WorkflowMode[] = ["auto", "gated", "manual"];
```
**위치**: workflow-parser.ts:171  
**제안**: "supervised" 추가, "manual" 검토

#### [MEDIUM] config.continue_on_error 누락
```typescript
// KNOWN_CONFIG_FIELDS에 있지만 스펙 대비 불완전
const KNOWN_CONFIG_FIELDS = ["retry", "retry_delay", "continue_on_error", "max_parallel"];
// timeout 누락
```
**위치**: workflow-parser.ts:21  
**제안**: `timeout` 필드 추가

---

## TASK-006: workflow-validator.ts (8.5/10)

### ✅ 스펙 일치 항목
- JSON Schema 검증 ✓
- 순환 의존성 검사 (graph 모듈 활용) ✓
- 자기 참조 검사 ✓
- 누락 참조 검사 ✓
- 입력 파일 검증 (경고) ✓
- parseAndValidate 통합 함수 ✓

### ❌ 이슈

#### [HIGH] JSON Schema duration 패턴 불일치
```typescript
// 스펙 & parser: /^[1-9]\d*[smhd]$/  (양수만)
// validator: /^\d+[smhd]$/  (0 허용)
"retry_delay": { "type": "string", "pattern": "^[1-9]\\d*[smhd]$" },
// timeout에는 잘못된 패턴
"timeout": { "type": "string", "pattern": "^[1-9]\\d*[smhd]$" },  // OK
```
**위치**: workflow-validator.ts:43  
**제안**: 패턴 일관성 확인

#### [MEDIUM] AJV 초기화 방식
```typescript
// ESM 환경에서 default import 이슈 가능
const ajv = new Ajv.default({ allErrors: true });
addFormats.default(ajv);
```
**위치**: workflow-validator.ts:64-65  
**제안**: 명시적 import 또는 주석 추가

---

## TASK-008: dependency-resolver.ts (9.0/10)

### ✅ 스펙 일치 항목
- Kahn's Algorithm 기반 토폴로지 정렬 ✓
- DFS 순환 감지 ✓
- 레벨 기반 그룹화 ✓
- ExecutionPlan 인터페이스 ✓
- getNextSteps 함수 ✓
- validateExecutionOrder 함수 ✓

### ❌ 이슈

#### [MEDIUM] graph 모듈 재사용 부족
```typescript
// 대부분 graph/index.ts 함수를 래핑
export function detectCyclesDFS(steps: Step[]): CycleResult {
  const graph = buildGraph(steps);
  return detectCycles(graph);
}
```
**위치**: dependency-resolver.ts 전체  
**제안**: 단순 래퍼는 re-export로 변경 고려

---

## TASK-009: feature-manager.ts (8.0/10)

### ✅ 스펙 일치 항목
- FeatureStatus enum ✓
- createFeature, archiveFeature, deleteFeature ✓
- 이름 검증 (kebab-case) ✓
- status 히스토리 추적 ✓
- restoreFeature ✓

### ❌ 이슈

#### [HIGH] 경로 상수가 상대 경로
```typescript
export const FOLDER_STRUCTURE = {
  ROOT: ".obora",
  FEATURES: ".obora/features",  // cwd 기준
  ...
};
```
**위치**: feature-manager.ts:76-80  
**제안**: 절대 경로 변환 함수 추가 또는 사용처에서 resolve

#### [MEDIUM] status.yaml 파서 취약
```typescript
// 간단한 YAML 파서 - 복잡한 구조 처리 불가
const colonIndex = trimmed.indexOf(":");
```
**위치**: feature-manager.ts:111-145  
**제안**: `yaml` 패키지 사용 또는 js-yaml 활용

#### [MEDIUM] 미사용 상수
```typescript
const _FEATURE_FILES = ["proposal.md", "design.md", "tasks.md"] as const;
```
**위치**: feature-manager.ts:70  
**제안**: 활용하거나 제거

---

## TASK-010: duckdb-client.ts (8.5/10)

### ✅ 스펙 일치 항목
- 4개 테이블 (projects, workflow_runs, step_executions, metrics) ✓
- 스키마 정의 일치 ✓
- CRUD 함수 제공 ✓
- 싱글톤 패턴 ✓
- 타입 정의 (Project, WorkflowRun, StepExecution, Metric) ✓

### ❌ 이슈

#### [HIGH] 인덱스 생성 누락
```typescript
// 스펙: 9개 인덱스 정의
// 현재: CREATE TABLE만, 인덱스 없음
await this.run(`CREATE TABLE IF NOT EXISTS projects...`);
// CREATE INDEX 문 없음
```
**위치**: duckdb-client.ts:69-120  
**제안**: initialize()에 인덱스 생성 추가

#### [MEDIUM] 마이그레이션 시스템 없음
```typescript
// 스펙: schema_versions 테이블 및 마이그레이션 전략
// 현재: 마이그레이션 지원 없음
```
**위치**: duckdb-client.ts 전체  
**제안**: 버전 테이블 및 마이그레이션 로직 추가

---

## graph/index.ts (9.0/10)

### ✅ 스펙 일치 항목
- buildGraph (명시적 + 암묵적 의존성) ✓
- detectCycles (DFS 기반) ✓
- topologicalSort (Kahn's Algorithm) ✓
- computeLevels (BFS 기반 레벨 계산) ✓
- groupByLevel ✓

### ❌ 이슈

#### [MEDIUM] 순환 경로 재구성 정확도
```typescript
// 복잡한 순환에서 경로가 정확하지 않을 수 있음
const cycleStart = path.indexOf(dep);
const cyclePath = [...path.slice(cycleStart), node, dep];
```
**위치**: graph/index.ts:73-75  
**제안**: 순환 경로 테스트 케이스 추가

---

## 🎯 우선순위별 수정 권고

### P0 (즉시)
없음 - Critical 이슈 없음

### P1 (금일 내)
1. **init.ts**: DuckDB 초기화 추가
2. **init.ts**: agents/ 폴더 생성
3. **validate.ts**: --format json 옵션
4. **duckdb-client.ts**: 인덱스 생성

### P2 (이번 주)
1. CLI 명령어 argument vs option 통일
2. Mock 데이터 → 실제 DB 조회 연결
3. Git 커밋 기능 구현
4. status.yaml 파서 개선

### P3 (MVP 이후)
1. --watch 옵션
2. --interactive 모드
3. 마이그레이션 시스템
4. OpenClaw API 통합

---

## 📝 결론

**전체적으로 MVP 기능이 잘 구현되어 있습니다.**

강점:
- 타입 안전성이 높음 (TypeScript 활용 우수)
- 에러 처리가 일관적
- 스펙 문서와 대부분 일치
- 모듈 분리가 명확

개선 필요:
- CLI argument vs option 일관성
- Placeholder 코드 정리 (TODO 주석 또는 구현)
- 일부 스펙 불일치 수정

**평균 8.4점으로 목표 9점에 근접합니다. High 이슈 12개 해결 시 9+ 달성 가능합니다.**
