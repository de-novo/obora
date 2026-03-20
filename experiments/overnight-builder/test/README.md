# Test Suite

이 디렉토리는 todo-cli 프로젝트의 테스트 스위트를 포함합니다.

## 테스트 구조

```
test/
├── unit/              # 단위 테스트 (순수 함수, 유틸리티)
│   ├── utils/
│   │   ├── id.test.ts
│   │   ├── formatter.test.ts
│   │   └── validator.test.ts
│   └── types.test.ts
├── integration/       # 통합 테스트 (레이어 간 상호작용)
│   ├── storage.test.ts
│   ├── repository.test.ts
│   └── service.test.ts
├── e2e/              # E2E 테스트 (CLI 전체 플로우)
│   ├── cli.test.ts
│   └── error-scenarios.test.ts
└── helpers/          # 테스트 유틸리티
    ├── fixtures.ts
    ├── storage.ts
    └── assertions.ts
```

## 테스트 실행

```bash
# 모든 테스트 실행
npm test

# 감시 모드
npm run test:watch

# 커버리지 포함
npm run test:coverage
```

## 테스트 작성 가이드라인

### 1. 테스트 네이밍
- `describe` 블록: 테스트 대상 (함수, 클래스, 모듈)
- `it` 블록: 기대하는 동작 (한국어 권장)

### 2. AAA 패턴
```typescript
it('설명', () => {
  // Arrange (준비)
  const input = 'test';
  
  // Act (실행)
  const result = functionUnderTest(input);
  
  // Assert (검증)
  expect(result).toBe(expected);
});
```

### 3. 테스트 격리
- 각 테스트는 독립적으로 실행 가능해야 함
- `beforeEach`/`afterEach`로 상태 초기화
- 임시 파일/디렉토리는 반드시 정리

### 4. 엣지 케이스
- 정상 케이스 (Happy Path)
- 에러 케이스 (Error Path)
- 엣지 케이스 (경계 조건)

## 커버리지 목표

- 전체: 80%+
- 핵심 로직 (Service, Repository): 90%+
- 유틸리티: 100%

## 테스트 헬퍼 사용법

### Fixtures
```typescript
import { createMockTodo, createMockStorage } from '../helpers/fixtures';

const todo = createMockTodo({ text: '커스텀 텍스트' });
const storage = createMockStorage([todo]);
```

### Storage Helpers
```typescript
import { createTempStorage, cleanupTempStorage } from '../helpers/storage';

let tempDir: string;
beforeEach(async () => {
  tempDir = await createTempStorage();
});

afterEach(async () => {
  await cleanupTempStorage(tempDir);
});
```

### Assertions
```typescript
import { assertTodoEqual, assertErrorMessage } from '../helpers/assertions';

assertTodoEqual(actual, expected);
assertErrorMessage(error, '찾을 수 없습니다');
```
