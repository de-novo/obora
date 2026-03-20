# 테스트 전략서 (Test Strategy)

## 1. 개요

**제품명:** todo-cli
**버전:** 1.0.0
**작성일:** 2026-03-20

### 1.1 테스트 목표

- **기능 검증**: 모든 기능이 요구사항대로 동작함을 보장
- **회귀 방지**: 코드 변경 시 기존 기능이 깨지지 않음을 보장
- **문서화**: 테스트 코드를 통한 사용 예시 제공
- **품질 보증**: 프로덕션 배포 전 결함 조기 발견

### 1.2 테스트 범위

| 범위 | 포함 | 제외 |
|-----|------|------|
| 기능 | add, list, done, remove | 수정, 검색 (Cycle 2) |
| 에러 | 검증, 저장소, 데이터 손상 | 네트워크 (해당 없음) |
| 통합 | 서비스-저장소 연동 | 외부 API (해당 없음) |
| E2E | CLI 전체 흐름 | GUI (해당 없음) |

---

## 2. 테스트 피라미드

```
            ┌─────────┐
            │   E2E   │  5% - 전체 흐름 검증
            ├─────────┤
            │  통합   │  25% - 모듈 간 연동
            ├─────────┤
            │  유닛   │  70% - 개별 함수/클래스
            └─────────┘
```

### 2.1 유닛 테스트 (70%)

**대상:**
- 순수 함수 (validator, formatter, id-generator)
- 격리된 클래스 (storage, service with mock)

**특징:**
- 빠른 실행 (1초 이내)
- 높은 커버리지 (85%+)
- 외부 의존성 없음 (mock 사용)

**파일 위치:**
```
test/unit/
├── validator.test.ts       # 입력 검증
├── formatter.test.ts       # 출력 포맷팅
├── id-generator.test.ts    # ID 생성
├── storage.test.ts         # 저장소 (격리)
├── todo.service.test.ts    # 서비스 (mock storage)
├── edge-cases.test.ts      # 엣지 케이스
└── ...
```

### 2.2 통합 테스트 (25%)

**대상:**
- 서비스 + 실제 저장소
- 파일 시스템 연동
- 백업/복구 메커니즘
- 잠금 관리

**특징:**
- 실제 파일 시스템 사용 (임시 디렉토리)
- 중간 속도 (5-10초)
- 실제 환경과 유사

**파일 위치:**
```
test/integration/
├── todo-service.test.ts      # 서비스 + 저장소
├── storage.test.ts           # 파일 시스템
├── backup-recovery.test.ts   # 백업/복구
├── lock-management.test.ts   # 잠금
├── full-workflow.test.ts     # 전체 워크플로우
└── ...
```

### 2.3 E2E 테스트 (5%)

**대상:**
- CLI 전체 흐름
- 실제 프로세스 실행
- 사용자 관점

**특징:**
- 가장 느림 (30-60초)
- 실제 사용 환경과 동일
- 중요 경로만 테스트

**파일 위치:**
```
test/e2e/
├── cli.test.ts           # 기본 CLI 테스트
├── cli-commands.test.ts  # 명령어별 테스트
├── cli-stress.test.ts    # 스트레스 테스트
└── ...
```

---

## 3. 테스트 케이스 분류

### 3.1 정상 케이스 (Happy Path)

| 기능 | 테스트 케이스 |
|-----|-------------|
| add | 유효한 내용으로 할 일 추가 |
| add | 1자 내용 추가 |
| add | 500자 내용 추가 |
| list | 빈 목록 조회 |
| list | 할 일 목록 조회 |
| list | --all 옵션으로 전체 조회 |
| done | 할 일 완료 처리 |
| done | 이미 완료된 항목 (멱등성) |
| remove | 할 일 삭제 |

### 3.2 에러 케이스 (Error Cases)

| 기능 | 에러 시나리오 | 예상 결과 |
|-----|-------------|----------|
| add | 빈 내용 | exit code 1 + 메시지 |
| add | 공백만 있는 내용 | exit code 1 + 메시지 |
| add | 501자 내용 | exit code 1 + 메시지 |
| done | 존재하지 않는 ID | exit code 1 + 메시지 |
| done | 숫자가 아닌 ID | exit code 1 + 메시지 |
| remove | 존재하지 않는 ID | exit code 1 + 메시지 |
| - | 알 수 없는 명령어 | exit code 1 + 메시지 |

### 3.3 엣지 케이스 (Edge Cases)

| 카테고리 | 테스트 케이스 |
|---------|-------------|
| 입력 | 이모지 포함 내용 |
| 입력 | 특수문자 포함 내용 |
| 입력 | 줄바꿈 포함 내용 |
| 입력 | 유니코드 문자 |
| ID | 매우 긴 ID |
| ID | ID 앞뒤 공백 |
| 상태 | done → done (멱등성) |
| 상태 | done 상태에서 삭제 |
| 데이터 | 1000개 할 일 |
| 동시성 | 동시 add 명령 |
| 복구 | 손상된 파일 복구 |

---

## 4. 테스트 데이터 전략

### 4.1 고정 데이터 (Fixtures)

```typescript
// 샘플 Todo 생성 헬퍼
function createSampleTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '1712345678901',
    content: '테스트 할 일',
    status: 'pending',
    createdAt: '2024-01-01T12:00:00.000Z',
    updatedAt: '2024-01-01T12:00:00.000Z',
    ...overrides
  };
}
```

### 4.2 랜덤 데이터 (Fuzzing)

```typescript
// 랜덤 문자열 생성
const randomContent = Math.random().toString(36).slice(2);

// 랜덤 ID 생성
const randomId = Date.now().toString();
```

### 4.3 경계값 데이터

```typescript
// 최소값
const minContent = 'a';

// 최대값
const maxContent = 'a'.repeat(500);

// 초과값
const overContent = 'a'.repeat(501);
```

---

## 5. Mock 전략

### 5.1 Mock Storage

```typescript
function createMockStorage(initialTodos: Todo[] = []): JsonStorage {
  let data: StorageSchema = {
    version: 1,
    todos: initialTodos,
    metadata: {
      lastModified: new Date().toISOString(),
      backupCreated: true
    }
  };
  
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(data),
    save: vi.fn().mockImplementation(async (newData) => {
      data = newData;
    }),
    // ...
  } as unknown as JsonStorage;
}
```

### 5.2 Mock 사용 원칙

- **유닛 테스트**: 모든 외부 의존성은 mock
- **통합 테스트**: 실제 파일 시스템 사용 (임시 디렉토리)
- **E2E 테스트**: 실제 환경 사용

---

## 6. 테스트 환경

### 6.1 임시 디렉토리 관리

```typescript
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'todo-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});
```

### 6.2 시간 제어

```typescript
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});
```

### 6.3 ID 생성기 초기화

```typescript
beforeEach(async () => {
  const { resetIdGenerator } = await import('../../src/utils/id-generator');
  resetIdGenerator();
});
```

---

## 7. 커버리지 목표

### 7.1 모듈별 목표

| 모듈 | 목표 | 이유 |
|-----|------|------|
| validator.ts | 100% | 순수 함수, 중요도 높음 |
| id-generator.ts | 100% | 순수 함수, 중요도 높음 |
| formatter.ts | 100% | 순수 함수, UX 직접 영향 |
| storage.ts | 90% | 파일 I/O, 에러 처리 복잡 |
| todo.service.ts | 90% | 비즈니스 로직 핵심 |
| cli.ts | 80% | 통합적 특성 |
| **전체** | **85%+** | |

### 7.2 커버리지 측정

```bash
npm run test:coverage
```

### 7.3 제외 항목

- `index.ts` (진입점만)
- 타입 정의 파일
- 테스트 파일 자체

---

## 8. 테스트 실행 전략

### 8.1 개발 중

```bash
# 변경된 파일만 테스트
npm run test:watch

# 특정 테스트만 실행
npm run test -- validator.test.ts
```

### 8.2 커밋 전

```bash
# 전체 테스트 실행
npm run test

# 타입 체크
npm run typecheck

# 린트
npm run lint
```

### 8.3 CI/CD

```bash
# 1. 의존성 설치
npm ci

# 2. 빌드
npm run build

# 3. 린트
npm run lint

# 4. 타입 체크
npm run typecheck

# 5. 테스트 (커버리지 포함)
npm run test:coverage

# 6. 커버리지 검증
# 85% 미만 시 실패
```

---

## 9. 성능 테스트

### 9.1 기준

| 작업 | 기준 |
|-----|------|
| add 1회 | 100ms 이내 |
| list 100개 | 100ms 이내 |
| add 100개 연속 | 5초 이내 |
| list 1000개 | 500ms 이내 |

### 9.2 테스트 방법

```typescript
it('성능 기준 만족', () => {
  const start = Date.now();
  
  // 작업 수행
  
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(100);
});
```

---

## 10. 테스트 유지보수

### 10.1 원칙

1. **DRY (Don't Repeat Yourself)**: 헬퍼 함수 활용
2. **명확한 이름**: 테스트 의도가 드러나는 이름
3. **단순함**: 복잡한 로직 피하기
4. **독립성**: 각 테스트는 독립적으로 실행 가능

### 10.2 리팩토링 시

- 테스트 코드도 프로덕션 코드와 동일한 품질
- 중복 제거
- 가독성 향상

### 10.3 실패 시 대응

1. 실패 원인 분석
2. 버그 수정 또는 테스트 업데이트
3. 회귀 방지를 위한 추가 테스트 작성

---

## 11. 테스트 체크리스트

### 11.1 새 기능 추가 시

- [ ] 유닛 테스트 작성 (정상 + 에러 + 엣지)
- [ ] 통합 테스트 작성 (필요 시)
- [ ] E2E 테스트 작성 (중요 기능만)
- [ ] 커버리지 목표 달성 확인

### 11.2 버그 수정 시

- [ ] 버그 재현 테스트 작성
- [ ] 수정 후 테스트 통과 확인
- [ ] 관련 테스트 추가 검토

### 11.3 릴리스 전

- [ ] 전체 테스트 통과
- [ ] 커버리지 85% 이상
- [ ] 타입 체크 통과
- [ ] 린트 통과
- [ ] 빌드 성공

---

## 12. 테스트 파일 목록

### 12.1 유닛 테스트

| 파일 | 테스트 수 | 대상 |
|-----|----------|------|
| validator.test.ts | 10+ | validator.ts |
| formatter.test.ts | 10+ | formatter.ts |
| id-generator.test.ts | 5+ | id-generator.ts |
| storage.test.ts | 15+ | storage.ts |
| todo.service.test.ts | 25+ | todo.service.ts |
| edge-cases.test.ts | 20+ | 전체 |
| command-result.test.ts | 5+ | types.ts |
| performance.test.ts | 5+ | 성능 |

### 12.2 통합 테스트

| 파일 | 테스트 수 | 대상 |
|-----|----------|------|
| todo-service.test.ts | 10+ | 서비스 + 저장소 |
| storage.test.ts | 10+ | 파일 시스템 |
| backup-recovery.test.ts | 10+ | 백업/복구 |
| lock-management.test.ts | 5+ | 잠금 |
| full-workflow.test.ts | 15+ | 전체 흐름 |
| advanced-scenarios.test.ts | 15+ | 고급 시나리오 |

### 12.3 E2E 테스트

| 파일 | 테스트 수 | 대상 |
|-----|----------|------|
| cli.test.ts | 20+ | 기본 CLI |
| cli-commands.test.ts | 15+ | 명령어별 |
| cli-stress.test.ts | 15+ | 스트레스 |
| edge-cases.test.ts | 10+ | 엣지 케이스 |
| error-recovery.test.ts | 10+ | 에러 복구 |

---

**문서 버전:** 1.0
**마지막 업데이트:** 2026-03-20
