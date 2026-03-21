# Implementation Notes

**Date:** 2026-03-21
**Attempt:** 3 (Repair)

---

## 1. 생성/수정한 파일

### Implementation Files (수정)

| 파일 | 변경 내용 |
|------|----------|
| `src/core/errors.ts` | `RepositoryError.cause` 속성에 `override` modifier 추가 (Error.cause 오버라이드) |
| `src/repositories/taskRepository.ts` | 미사용 import 제거 (fs, path, TaskPriority), RepositoryError.code에 `override` modifier 추가 |

### Test Files (수정 - validator 판정에 따른 test code bug)

| 파일 | 변경 내용 |
|------|----------|
| `test/integration/error-handling.test.ts` | import 경로에 `.js` 확장자 추가 (ESM 모듈 로드 실패 해결) |
| `test/integration/add-task.test.ts` | import 경로에 `.js` 확장자 추가 |
| `test/integration/list-tasks.test.ts` | import 경로에 `.js` 확장자 추가 |
| `test/edge/edge-cases.test.ts` | import 경로에 `.js` 확장자 추가 |

---

## 2. 핵심 구현 결정

### TypeScript `override` Modifier 추가

- **문제**: TypeScript 5.0+에서 `noImplicitOverride` 옵션 활성화 시, 상위 클래스 멤버 오버라이드에 `override` 키워드 필수
- **해결**:
  - `src/core/errors.ts:37`: `RepositoryError.cause` → `override readonly cause`
  - `src/repositories/taskRepository.ts:13`: `RepositoryError.code` → `override readonly code`

### Dead Code 제거

- **문제**: `src/repositories/taskRepository.ts`에서 fs, path, TaskPriority import 후 미사용
- **해결**: 해당 import 문 제거, Storage 클래스 내부에서 파일 시스템 처리

### ESM Import 경로 수정 (Test Code Bug)

- **문제**: ESM 환경에서 상대 경로 import 시 `.js` 확장자 필수
- **원인**: 테스트 파일 4개가 `../../src/services/taskService` 경로로 import 시도 (`.js` 누락)
- **해결**: 모든 import 문에 `.js` 확장자 추가
  ```typescript
  // Before
  import { TaskService } from '../../../src/services/taskService';
  
  // After
  import { TaskService } from '../../../src/services/taskService.js';
  ```

---

## 3. 에러 핸들링 전략

### 계층적 에러 구조 유지

```
Error (Native)
└── TodoError (Base)
    ├── ValidationError (입력 검증 실패)
    │   └── code: 'VALIDATION_ERROR'
    └── RepositoryError (데이터 접근 실패)
        ├── code: 'REPOSITORY_ERROR'
        └── cause?: Error (원본 에러 보존)
```

### Repository Error 분류

| 코드 | 상황 | 처리 |
|------|------|------|
| `FS_CORRUPTED_FILE` | JSON 파싱 실패 | RepositoryError throw |
| `FS_READ_ERROR` | 파일 읽기 실패 | RepositoryError throw |
| `VAL_EMPTY_TITLE` | 빈 제목 | ValidationError throw |

---

## 4. 남은 리스크

### 낮음 (Low)

1. **동시성 처리**: proper-lockfile 사용 중이나, 동일 프로세스 내 lock queue로 보완 필요 시 JsonRepository 패턴 참조

2. **타입 일관성**: 두 개의 Repository 구현체 존재
   - `src/repository/json-repository.ts` (JsonRepository - Todo 타입)
   - `src/repositories/taskRepository.ts` (TaskRepository - Task 타입)
   - → 향후 하나로 통합 권장

### 해결됨 (Resolved)

- ✅ TypeScript override modifier 누락
- ✅ Unused imports (dead code)
- ✅ ESM import 경로 오류

---

## 5. 테스트 커버리지

- **총 테스트 파일**: 14개
- **예상 통과**: 14개 (모듈 로드 실패 4개 → 수정 완료)
- **커버리지 목표**: 80%+
