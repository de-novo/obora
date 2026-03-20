# Implementation Notes - Repair Attempt 7

## 1. 생성/수정한 파일

### Modified Files
| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `workspace/src/storage.ts` | 수정 | 백업 생성 로직 타이밍 수정 |
| `workspace/src/services/todo.service.ts` | 수정 | 에러 처리 로직 개선 |

## 2. 핵심 구현 결정

### 2.1 백업 생성 타이밍 수정 (storage.ts)

**문제점**:
- `initialize()`가 빈 파일(`todos: []`)을 생성
- 첫 번째 `save()` 호출 시 파일 존재 여부만 체크하고 백업 생성
- 테스트 기대: 첫 번째 저장은 백업 없음, 두 번째 저장부터 백업 생성

**수정 내용**:
```typescript
// save() 메서드에서 기존 데이터의 todo 개수 확인 후 백업 생성
if (!backupExists) {
  try {
    const existingData = await this.load();
    if (existingData.todos.length > 0) {
      await this.backup();
      backupExists = true;
    }
  } catch {
    // 파일 없음 또는 읽기 실패 시 백업 없음
  }
}
```

**동작**:
- 첫 번째 저장 (빈 → 1개): `todos.length = 0` → 백업 없음, `backupCreated: false`
- 두 번째 저장 (1개 → 2개): `todos.length = 1` → 백업 생성, `backupCreated: true`

### 2.2 isFileNotFoundError 정확한 매칭 (todo.service.ts)

**문제점**:
- 기존: `error.message.includes('찾을 수 없습니다')` 사용
- '저장소를 읽을 수 없습니다'도 '찾을 수 없습니다' 포함
- 결과적으로 모든 StorageError를 파일 없음으로 오인
- 빈 스키마 생성 후 `exitCode: 0` 반환 (버그)

**수정 내용**:
```typescript
function isFileNotFoundError(error: unknown): boolean {
  if (error instanceof StorageError) {
    return error.message === '저장소 파일을 찾을 수 없습니다';
  }
  return false;
}
```

**동작**:
- `StorageError('저장소 파일을 찾을 수 없습니다')` → 파일 없음 처리 (빈 스키마 생성)
- `StorageError('저장소를 읽을 수 없습니다')` → StorageError 처리 (`exitCode: 2`)

### 2.3 NotFoundError 직접 반환 (todo.service.ts)

**문제점**:
- `throw new NotFoundError()` 사용 시 예외 전파 과정에서 상태 누락 가능
- mock 테스트에서 예외 처리가 복잡해짐

**수정 내용**:
```typescript
// done(), remove() 메서드에서 직접 반환
const todoIndex = data.todos.findIndex(t => t.id === validatedId);
if (todoIndex === -1) {
  return {
    success: false,
    message: `할 일 '${validatedId}'를 찾을 수 없습니다`,
    exitCode: 1
  };
}
```

**동작**:
- 일관된 에러 처리
- mock 테스트에서도 정확한 결과 반환 보장

## 3. 에러 핸들링 전략

### 3.1 에러 타입별 처리

| 에러 타입 | exitCode | success | 처리 방식 |
|----------|----------|---------|----------|
| ValidationError | 1 | false | 검증 실패 시 즉시 반환 |
| NotFoundError | 1 | false | 리소스 없음 시 즉시 반환 |
| StorageError | 2 | false | 저장소 오류 시 즉시 반환 |
| DataCorruptionError | 3 | false | 복구 실패 시 반환 |
| LockAcquisitionError | 2 | false | 잠금 실패 시 즉시 반환 |

### 3.2 백업 복구 흐름
```
데이터 로드 시도
    ↓
실패 (DataCorruptionError)
    ↓
백업 복구 시도 (restore)
    ↓
성공 → 복구된 데이터 사용
실패 → exitCode 3 반환
```

## 4. 테스트 영향 분석

### 4.1 수정될 것으로 예상되는 테스트 (8개)

| 테스트 파일 | 테스트 케이스 | 수정 사유 |
|------------|--------------|----------|
| `data-persistence.test.ts` | 저장 시 백업 생성 | 백업 타이밍 수정 |
| `data-persistence.test.ts` | backupCreated 플래그 관리 | 플래그 설정 수정 |
| `storage.test.ts` | should create empty storage with correct schema | 초기화 시 플래그 확인 |
| `edge-cases.test.ts` | should create backup before save | 백업 타이밍 수정 |
| `service-errors.test.ts` | 저장소 로드 실패 시 에러 처리 | exitCode 수정 |
| `service-errors.test.ts` | 저장소 에러 시 종료 코드 2 | exitCode 수정 |
| `service-errors.test.ts` | 삭제된 ID로 다시 접근 시 NotFound 에러 | success 플래그 수정 |
| `error-recovery.test.ts` | 저장소 에러 종료 코드 2 | exitCode 수정 |

## 5. 코드 품질

### 5.1 프로덕션 수준 준수 사항
- ✅ 에러 처리: 모든 예외 경로에 적절한 처리
- ✅ 입력 검증: ID, content 검증 유지
- ✅ 타입 안전성: TypeScript strict mode 준수
- ✅ JSDoc: 모든 public 메서드에 문서화
- ✅ console.log 금지: 사용하지 않음

### 5.2 변경된 Import
- `NotFoundError` import 제거 (직접 반환으로 변경)

## 6. 남은 리스크

### 6.1 E2E 백업 복구 테스트
- `initialize()`와 `list()` 양쪽 모두 복구 로직 존재
- 실제 파일 시스템에서 복구가 정상 작동하는지 확인 필요

### 6.2 동시성 테스트
- 잠금 메커니즘이 다중 프로세스 환경에서 올바르게 작동하는지 확인 필요

## 7. 요약

| 항목 | 내용 |
|------|------|
| 수정 파일 | 2개 |
| 수정 라인 | ~35줄 |
| 예상 수정 테스트 | 8개 |
| 핵심 수정 | 백업 타이밍, 에러 매칭, 직접 반환 |
