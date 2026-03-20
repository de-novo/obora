# 구현 노트

**작성일**: 2026-03-20
**버전**: 1.0.0

---

## 1. 생성/수정한 파일

### 신규 생성
- 없음

### 수정한 파일
1. **src/cli/commands/add.ts**
   - `--data-dir` 옵션 추가

2. **src/cli/commands/list.ts**
   - `--data-dir` 옵션 추가

3. **src/cli/commands/done.ts**
   - `--data-dir` 옵션 추가

4. **src/cli/commands/undone.ts**
   - `--data-dir` 옵션 추가

5. **src/cli/commands/remove.ts**
   - `--data-dir` 옵션 추가

6. **src/cli/commands/clear.ts**
   - `--data-dir` 옵션 추가

7. **src/repository/FileLockManager.ts**
   - 동시성 제어 로직 재작성
   - 파일별 대기열(Queue) 기반 순차 처리 구현

8. **.eslintrc.json**
   - `@typescript-eslint/no-unused-expressions` 규칙 제거

---

## 2. 핵심 구현 결정

### 2.1 CLI --data-dir 옵션 전달

**문제**: Commander.js의 글로벌 옵션이 서브커맨드에 전달되지 않아 E2E 테스트 10개 실패

**해결책**: 각 서브커맨드에 `--data-dir` 옵션 명시적 추가
```typescript
.option('--data-dir <path>', '데이터 디렉터리 경로')
```

**이유**:
- `src/index.ts`에서 이미 `--data-dir`을 pre-parse하여 dataDir을 결정함
- 서브커맨드에서는 옵션이 인식되지 않으면 `unknown option` 에러 발생
- 각 서브커맨드에 옵션을 추가하여 Commander.js가 에러를 내지 않도록 함

### 2.2 파일 잠금 동시성 제어

**문제**: 동시에 여러 태스크 추가 시 10개 중 1개만 저장되는 데이터 손실

**원인 분석**:
1. 기존 `activeLocks` Map은 Promise만 저장하고 실제 대기열 관리 안 됨
2. 동시 호출 시 파일 잠금 획득 전에 여러 작업이 동시에 실행됨
3. 파일 읽기-수정-쓰기 과정에서 race condition 발생

**해결책**: 큐(Queue) 기반 순차 처리 구현
```typescript
interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

private readonly lockQueues = new Map<string, QueueItem<unknown>[]>();
private readonly processing = new Map<string, boolean>();
```

**작동 방식**:
1. `withLock()` 호출 시 큐에 작업 추가
2. `processQueue()`가 순차적으로 작업 처리
3. 각 작업은 파일 잠금 획득 → 실행 → 잠금 해제 후 완료
4. 다음 작업은 이전 작업 완료 후 시작

### 2.3 updatedAt 필드 갱신

**상태**: 이미 구현됨 (이전 시도에서 수정 완료)

`TaskRepository.update()` 메서드에서 `updatedAt: new Date().toISOString()` 사용 중

### 2.4 ESLint 설정

**문제**: `@typescript-eslint/no-unused-expressions` 규칙 로드 실패

**원인**: 
- `@typescript-eslint/no-unused-expressions` 규칙은 TypeScript ESLint 7.x에서 deprecated
- 설정에서 `off`로 지정했으나 규칙 자체가 로드되지 않음

**해결책**: 규칙 자체를 `.eslintrc.json`에서 제거

---

## 3. 에러 핸들링 전략

### 3.1 파일 잠금 에러
- **Timeout**: 5초 후 `ConcurrencyError` (TASK-301)
- **잠금 해제 실패**: 무시하고 계속 진행 (다음 시도에서 정리)

### 3.2 큐 처리 에러
- 각 작업의 에러는 해당 작업의 reject로 전파
- 다른 작업에는 영향 없음

### 3.3 CLI 옵션 에러
- 인식되지 않는 옵션은 Commander.js가 자동으로 에러 처리

---

## 4. 남은 리스크

### 4.1 다중 프로세스 동시성 (낮음)
- 현재 구현은 단일 프로세스 내 동시성만 보장
- 여러 Node.js 프로세스가 동시에 실행되면 여전히 race condition 가능
- **완화책**: 파일 기반 잠금(.lock 파일)으로 다중 프로세스도 부분적으로 보호됨

### 4.2 잠금 파일 정리 (낮음)
- 프로세스 강제 종료 시 .lock 파일이 남을 수 있음
- **완화책**: 잠금 획득 시 타임아웃 후 재시도 가능

### 4.3 대량 데이터 성능 (낮음)
- 1000개+ 태스크에서 직렬화/역직렬화 오버헤드
- **완화책**: 현재 요구사항(100개)에서는 문제없음

---

## 5. 테스트 검증 항목

### 통과 예상 테스트
- ✅ TypeScript 타입 체크
- ✅ ESLint 린트
- ✅ CLI E2E 테스트 10개 (--data-dir 옵션 인식)
- ✅ 동시성 테스트 3개 (큐 기반 순차 처리)
- ✅ 전체 159개 테스트

---

## 6. 의존성 버전

| 패키지 | 버전 | 비고 |
|--------|------|------|
| TypeScript | 5.4.0 | |
| ESLint | 8.57.0 | |
| @typescript-eslint/eslint-plugin | 7.0.0 | |
| @typescript-eslint/parser | 7.0.0 | |
| Commander | 12.0.0 | |
| Vitest | 1.3.0 | |
| Node.js | >=20.0.0 | |
