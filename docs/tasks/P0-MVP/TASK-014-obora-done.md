# TASK-014: obora done 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 2.5시간
- 담당: 개발자

## 목표
기능을 완료 처리하고 archive 폴더로 이동하는 명령어 구현

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora done [options]` 명령어 등록
   - `--feature` 옵션 (대상 기능 이름)
   - `--commit` 옵션 (Git commit 생성, 기본 true)
   - `--message` 옵션 (커밋 메시지)
   - `--no-archive` 옵션 (아카이브 건너뛰기)

2. **완료 검증**
   - workflow_runs 상태 확인 (completed 여부)
   - 필수 Step 완료 확인
   - 미완료 시 경고 또는 에러

3. **아카이브 처리**
   - `features/<name>/` → `archive/<YYYY-MM>-<name>/`로 이동
   - 동일 이름 충돌 시 suffix 추가 (`-2`, `-3`)
   - `execution.log` 생성 (실행 요약)

4. **DuckDB 업데이트**
   - workflow_runs 상태 업데이트
   - completed_at 기록

5. **Git commit (선택)**
   - 변경 파일 스테이징
   - 커밋 메시지 자동 생성 또는 사용자 지정
   - commit 실패 시 경고 (에러 아님)

## 완료 조건
- [ ] `obora done` 실행 시 기능 아카이브
- [ ] 워크플로우 미완료 시 적절한 에러/경고
- [ ] `execution.log` 생성
- [ ] Git commit 옵션 동작
- [ ] DuckDB 상태 업데이트

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)
- TASK-009 (폴더 구조 관리)
- TASK-010 (DuckDB 설정)
- TASK-012 (obora run - 상태 기록)

## execution.log 형식
```
# Execution Log: user-auth
# Generated: 2026-02-03T18:30:00+09:00

## Summary
- Workflow: standard
- Mode: auto
- Started: 2026-02-03T16:30:00+09:00
- Completed: 2026-02-03T18:30:00+09:00
- Duration: 2h 0m
- Status: success

## Steps
| Step | Agent | Status | Duration | Retries |
|------|-------|--------|----------|---------|
| design | architect | success | 15m | 0 |
| implement | developer | success | 1h 20m | 1 |
| test | tester | success | 20m | 0 |
| review | reviewer | success | 5m | 0 |

## Metrics
- Total retries: 1
```

## 테스트 케이스
```typescript
// 기본 done 실행 (워크플로우 완료 상태에서)
await runCommand('obora done --feature user-auth');
expect(fs.existsSync('.obora/features/user-auth')).toBe(false);
expect(fs.existsSync('.obora/archive/2026-02-user-auth')).toBe(true);
expect(fs.existsSync('.obora/archive/2026-02-user-auth/execution.log')).toBe(true);

// 워크플로우 미완료 시 에러
await expect(runCommand('obora done --feature incomplete-feature'))
  .rejects.toThrow('Workflow not completed');

// 아카이브 없이 완료
await runCommand('obora done --feature user-auth --no-archive');
// 상태만 업데이트, 폴더 이동 없음

// Git commit 포함
await runCommand('obora done --feature user-auth --message "feat: 사용자 인증 기능"');
const gitLog = execSync('git log -1 --oneline').toString();
expect(gitLog).toContain('사용자 인증 기능');

// 동일 이름 아카이브 충돌
// 이미 archive/2026-02-user-auth 있는 상태에서
await runCommand('obora done --feature user-auth');
expect(fs.existsSync('.obora/archive/2026-02-user-auth-2')).toBe(true);

// DuckDB 상태 확인
const runs = await db.query('SELECT status FROM workflow_runs WHERE feature = ?', ['user-auth']);
expect(runs[0].status).toBe('completed');
```

## 참고 자료
- [[02-cli-commands.md#obora done]]
- [[04-folder-structure.md#archive]]
- [[07-database-schema.md]]
