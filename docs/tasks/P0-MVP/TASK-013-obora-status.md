# TASK-013: obora status 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 2시간
- 담당: 개발자

## 목표
실행 상태를 조회하고 표시하는 명령어 구현

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora status [options]` 명령어 등록
   - `--feature` 옵션 (특정 기능만 표시)
   - `--format` 옵션 (default | json | minimal)
   - `--watch` 옵션 (실시간 갱신)

2. **상태 조회**
   - DuckDB에서 workflow_runs 조회
   - step_executions 조회
   - 진행률 계산

3. **출력 포맷팅**
   - default: 사람 친화적 테이블 형식
   - json: JSON 형식 (CI/CD 연동용)
   - minimal: 한 줄 요약

4. **실시간 갱신 (watch 모드)**
   - 터미널 클리어 및 재출력
   - 인터럽트 핸들링 (Ctrl+C)

## 완료 조건
- [ ] `obora status` 실행 시 전체 상태 표시
- [ ] `--feature` 옵션으로 특정 기능 필터링
- [ ] JSON 출력 형식 지원
- [ ] 실행 중인 Step 및 진행률 표시

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)
- TASK-010 (DuckDB 설정)

## 출력 예시

### default 형식
```
Feature: user-auth
Status:  running
Started: 2026-02-03 16:30:00
Workflow: standard

Steps:
  ✓ design    (completed, 2m 30s)
  → implement (running, 5m 10s...)
  ○ test      (pending)
  ○ review    (pending)

Progress: 1/4 (25%)
```

### json 형식
```json
{
  "feature": "user-auth",
  "status": "running",
  "started_at": "2026-02-03T16:30:00+09:00",
  "workflow": "standard",
  "current_step": "implement",
  "steps": [
    {"name": "design", "status": "completed", "duration": 150},
    {"name": "implement", "status": "running", "duration": null},
    {"name": "test", "status": "pending"},
    {"name": "review", "status": "pending"}
  ],
  "progress": 0.25
}
```

### minimal 형식
```
user-auth: running (implement, 25%)
```

## 테스트 케이스
```typescript
// 기본 status 조회
const result = await runCommand('obora status');
expect(result.stdout).toContain('Feature:');
expect(result.stdout).toContain('Status:');

// 특정 기능 status
const featureResult = await runCommand('obora status --feature user-auth');
expect(featureResult.stdout).toContain('user-auth');

// JSON 형식
const jsonResult = await runCommand('obora status --format json');
const parsed = JSON.parse(jsonResult.stdout);
expect(parsed).toHaveProperty('feature');
expect(parsed).toHaveProperty('status');

// minimal 형식
const minimalResult = await runCommand('obora status --format minimal');
expect(minimalResult.stdout).toMatch(/\w+: \w+ \(\w+, \d+%\)/);

// 진행 중인 기능 없음
// (빈 상태에서)
const emptyResult = await runCommand('obora status');
expect(emptyResult.stdout).toContain('No active features');
```

## 참고 자료
- [[02-cli-commands.md#obora status]]
- [[07-database-schema.md]]
