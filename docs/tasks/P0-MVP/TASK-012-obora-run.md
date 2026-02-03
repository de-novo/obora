# TASK-012: obora run 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 4시간
- 담당: 개발자

## 목표
워크플로우를 실행하여 각 Step을 순차적으로 처리하는 명령어 구현

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora run [options]` 명령어 등록
   - `--feature` 옵션 (대상 기능 이름)
   - `--workflow` 옵션 (사용할 워크플로우)
   - `--mode` 옵션 (auto | supervised | gated) - MVP는 auto만
   - `--step` 옵션 (특정 Step부터 시작)
   - `--dry-run` 옵션 (실행 계획만 확인)
   - `--verbose` 옵션 (상세 출력)

2. **실행 전 검증**
   - 스펙 파일 존재 확인 (spec_first 설정에 따라)
   - 워크플로우 파일 파싱 및 검증
   - 의존성 분석 (Dependency Resolver)
   - 순환 의존성 체크

3. **Step 실행 루프**
   - ExecutionPlan 기반 순차 실행
   - 각 Step에 맞는 에이전트 호출
   - 출력 파일 저장 (`context/<step-name>-output.md`)
   - DuckDB에 실행 기록 저장

4. **진행 상황 표시**
   - 현재 실행 중인 Step 표시
   - 예상 남은 시간 (선택)
   - 에러 발생 시 상세 정보

5. **에러 처리 및 복구**
   - Step 실패 시 재시도 로직
   - 실패 지점 기록 (resume 가능하도록)
   - 락 파일 관리

## 완료 조건
- [ ] `obora run` 실행 시 워크플로우 Step 순차 실행
- [ ] 각 Step 출력이 `context/` 폴더에 저장
- [ ] DuckDB에 실행 기록 저장
- [ ] 스펙 검증 실패 시 적절한 에러 메시지
- [ ] `--dry-run` 시 실행 계획만 표시

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)
- TASK-005 (YAML 파서)
- TASK-006 (YAML 검증기)
- TASK-008 (의존성 해석기)
- TASK-010 (DuckDB 설정)

## 타입 정의 예시
```typescript
interface RunOptions {
  feature?: string;
  workflow?: string;
  mode?: 'auto' | 'supervised' | 'gated';
  step?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

interface RunContext {
  feature: string;
  workflow: Workflow;
  plan: ExecutionPlan;
  runId: number;
  currentStep?: string;
}
```

## 테스트 케이스
```typescript
// 기본 run 실행
await runCommand('obora run --feature login-feature');
// 모든 Step 완료 확인
expect(fs.existsSync('.obora/features/login-feature/context/design-output.md')).toBe(true);

// dry-run 모드
const result = await runCommand('obora run --feature login-feature --dry-run');
expect(result.stdout).toContain('Execution Plan:');
expect(result.stdout).toContain('design → implement → test');

// 특정 Step부터 시작
await runCommand('obora run --feature login-feature --step implement');
// implement부터 시작 확인

// 스펙 검증 실패
// proposal.md 없는 상태에서
await expect(runCommand('obora run --feature no-spec-feature'))
  .rejects.toThrow('Spec validation failed');

// 순환 의존성 에러
await expect(runCommand('obora run --workflow circular.yaml'))
  .rejects.toThrow('Circular dependency');

// DuckDB 기록 확인
const runs = await db.query('SELECT * FROM workflow_runs WHERE feature = ?', ['login-feature']);
expect(runs).toHaveLength(1);
expect(runs[0].status).toBe('completed');
```

## 참고 자료
- [[02-cli-commands.md#obora run]]
- [[05-dependency-resolver.md]]
- [[07-database-schema.md]]
