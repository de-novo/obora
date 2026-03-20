# Test Report - 2026-03-20

## 1. TypeScript 타입 체크 결과: **FAIL**

### Exit Code: 2

### 에러 목록

**FileLockManager.ts 구문 오류 (62개)**

소스 코드 라인 44에서 구문 오류 발생:
```
private readonly lockQueues = new Map<string, QueueItem<unknown>[]>>();
```

제네릭 타입 선언에 괄호가 하나 더 닫혀 있음 (`[]>>` → `[]>`)

주요 에러들:
- Line 44: `error TS1005: ';' expected` - `QueueItem<unknown>[]>>` 구문 오류
- Line 46-176: 파싱 실패로 인한 연쇄 에러

**Root Cause**: 구현 코드에 타이포(`[]>>` → `[]>`) 존재

---

## 2. 린트 결과: **FAIL**

### Exit Code: 2

### 에러 목록

```
TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions': 
Cannot read properties of undefined (reading 'allowShortCircuit')
```

ESLint 설정 문제: `@typescript-eslint/no-unused-expressions` 규칙 로드 실패

**Root Cause**: TypeScript ESLint 버전 호환성 문제

---

## 3. 테스트 결과: **FAIL**

### Exit Code: 1

### 테스트 요약
- Test Files: 3 failed | 12 passed (15)
- Tests: 10 failed | 126 passed (136)

### 실패한 테스트

**A. 빌드 실패로 인한 테스트 파일 로드 실패 (2개)**
1. `test/integration/repository/FileLockManager.test.ts` - 0 tests loaded
2. `test/integration/repository/TaskRepository.integration.test.ts` - 0 tests loaded

**원인**: FileLockManager.ts 구문 오류로 esbuild transform 실패

**B. E2E 테스트 실패 (10개)**
모든 실패 메시지:
```
error: unknown option '--data-dir'
```

실패한 테스트 케이스:
1. CLI E2E Tests > 기본 흐름 > 새 할 일을 추가하고 목록에서 확인할 수 있어야 함
2. CLI E2E Tests > 기본 흐름 > 할 일을 완료 처리할 수 있어야 함
3. CLI E2E Tests > 기본 흐름 > 완료된 할 일을 미완료로 변경할 수 있어야 함
4. CLI E2E Tests > 기본 흐름 > 할 일을 삭제할 수 있어야 함
5. CLI E2E Tests > 기본 흐름 > 완료된 항목을 일괄 삭제할 수 있어야 함
6. CLI E2E Tests > 데이터 무결성 > 손상된 JSON 파일을 복구해야 함
7. CLI E2E Tests > 데이터 무결성 > 파일이 없으면 자동으로 초기화해야 함
8. CLI E2E Tests > 성능 > 100개 할 일 추가 및 조회가 5초 이내에 완료되어야 함
9. CLI E2E Tests > 특수 케이스 > 특수문자가 포함된 할 일을 처리할 수 있어야 함
10. CLI E2E Tests > 특수 케이스 > 여러 단어로 된 할 일을 처리할 수 있어야 함

**원인 분석**: 
- `add.ts` 명령어에 `--data-dir` 옵션이 정의되어 있음
- 하지만 빌드된 `dist/index.js`에는 반영되지 않음 (빌드 실패로 인해)
- 구버전 dist 파일이 실행되어 `--data-dir` 옵션이 인식되지 않음

---

## 4. 종합 판정: **FAIL**

### 실패 원인 체인
1. `FileLockManager.ts` 라인 44에 구문 오류 (타이포)
2. TypeScript 빌드 실패 → dist 파일 업데이트 안됨
3. 구버전 dist 실행 → E2E 테스트 실패
4. ESLint 규칙 로드 실패

### 최우선 수정 사항

**FileLockManager.ts 라인 44 수정**:
```diff
- private readonly lockQueues = new Map<string, QueueItem<unknown>[]>>();
+ private readonly lockQueues = new Map<string, QueueItem<unknown>[]>();
```

### failedChecks 분류

| name | message |
|------|---------|
| implementation_bug | FileLockManager.ts:44 타입 선언 구문 오류 (`[]>>` → `[]`) |
| implementation_bug | CLI E2E 테스트 10개 실패 (빌드 실패로 인한 구버전 실행) |
| implementation_bug | ESLint 규칙 로드 실패 (@typescript-eslint/no-unused-expressions) |

---

## 통계

| 항목 | 상태 |
|------|------|
| TypeScript | ❌ FAIL (62 errors) |
| ESLint | ❌ FAIL (rule load error) |
| Tests | ❌ FAIL (10/136 failed) |
| **종합** | **❌ FAIL** |
