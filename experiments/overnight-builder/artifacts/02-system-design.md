# System Design: Todo CLI

## 1. 아키텍처 개요

### 1.1 레이어드 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Layer (cli.ts)                      │
│  - 명령어 파싱                                               │
│  - 옵션 처리                                                 │
│  - 사용자 출력 포맷팅                                        │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                    Service Layer (services/)                 │
│  - TodoService: 비즈니스 로직                                │
│  - 트랜잭션 관리 (잠금 획득/해제)                            │
│  - 에러 복구 전략                                            │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                   Storage Layer (storage.ts)                 │
│  - JsonStorage: JSON 파일 영속성                            │
│  - 백업/복구 관리                                            │
│  - 잠금 메커니즘                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 핵심 모듈 구조

```
workspace/
├── src/
│   ├── index.ts              # 진입점
│   ├── cli.ts                # CLI 인터페이스
│   ├── types.ts              # 타입 정의
│   ├── errors.ts             # 에러 클래스
│   ├── storage.ts            # 저장소 구현
│   ├── services/
│   │   └── todo.service.ts   # 비즈니스 로직
│   └── utils/
│       ├── formatter.ts      # 출력 포맷팅
│       ├── id-generator.ts   # ID 생성
│       └── validator.ts      # 입력 검증
├── test/
│   ├── unit/                 # 유닛 테스트
│   ├── integration/          # 통합 테스트
│   └── e2e/                  # E2E 테스트
└── dist/                     # 컴파일된 JS
```

## 2. 인터페이스 정의

### 2.1 Todo 엔티티

```typescript
interface Todo {
  id: string;           // 타임스탬프 기반 (16자리)
  content: string;      // 1-500자
  status: TodoStatus;   // 'pending' | 'done'
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

### 2.2 저장소 스키마

```typescript
interface StorageSchema {
  version: number;      // 현재: 1
  todos: Todo[];
  metadata: {
    lastModified: string;
    backupCreated: boolean;
  };
}
```

### 2.3 서비스 인터페이스

```typescript
interface ITodoService {
  add(content: string): Promise<CommandResult>;
  list(options: ListOptions): Promise<CommandResult>;
  done(id: string): Promise<CommandResult>;
  remove(id: string): Promise<CommandResult>;
}
```

### 2.4 명령어 결과

```typescript
interface CommandResult {
  success: boolean;
  message: string;
  data?: Todo | Todo[];
  exitCode: 0 | 1 | 2 | 3;
}
```

## 3. 에러 전략

### 3.1 에러 계층 구조

```
TodoError (base)
├── ValidationError (exit code 1) - 사용자 입력 오류
├── NotFoundError (exit code 1) - 리소스 미발견
├── StorageError (exit code 2) - 저장소 I/O 오류
├── LockAcquisitionError (exit code 2) - 동시성 충돌
└── DataCorruptionError (exit code 3) - 데이터 손상
```

### 3.2 종료 코드 표준

| 코드 | 의미 | 예시 |
|------|------|------|
| 0 | 성공 | 정상 완료 |
| 1 | 사용자 오류 | 잘못된 입력, 리소스 없음 |
| 2 | 시스템 오류 | 파일 I/O 실패, 잠금 획득 실패 |
| 3 | 데이터 오류 | 파일 손상, 복구 불가 |

### 3.3 에러 복구 전략

```
1. 데이터 손상 감지
   ↓
2. 백업 파일 존재 확인
   ↓ (있음)
3a. 백업에서 복구 시도
   ↓ (성공)
4a. 정상 동작 계속
   ↓ (실패)
3b. 사용자 알림 + 종료 코드 3
```

## 4. 동시성 제어

### 4.1 파일 잠금 메커니즘

```
┌─────────────┐     ┌─────────────┐
│  Process A  │     │  Process B  │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │ acquireLock()     │ acquireLock()
       ▼                   ▼
   ┌───────┐           ┌───────┐
   │ Lock  │ ◄─────────│ Wait  │
   │ Active│           │ Retry │
   └───┬───┘           └───────┘
       │                   
   │                   │
       ▼                   
   │ Release            │
   └───────────────►   ▼
                   ┌───────┐
                   │ Lock  │
                   │Active │
                   └───────┘
```

### 4.2 잠금 파라미터

- 최대 재시도: 10회
- 재시도 간격: 50ms
- 최대 대기: 500ms
- 잠금 파일: `todos.json.lock`

## 5. 백업 전략

### 5.1 백업 정책

```
┌─────────────────────────────────────────┐
│            저장 요청                     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│    기존 데이터 파일 존재 확인            │
└─────────────────┬───────────────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
      [있음]          [없음]
          │               │
          ▼               │
┌─────────────────┐       │
│ 백업 파일 생성  │       │
│ (.bak)          │       │
└────────┬────────┘       │
         │                │
         └────────┬───────┘
                  ▼
┌─────────────────────────────────────────┐
│           새 데이터 저장                 │
└─────────────────────────────────────────┘
```

### 5.2 복구 우선순위

1. 메인 파일 정상 → 그대로 사용
2. 메인 파일 손상 + 백업 정상 → 백업으로 복구
3. 둘 다 손상 → DataCorruptionError

## 6. 테스트 전략

### 6.1 테스트 피라미드

```
          ╱╲
         ╱  ╲
        ╱ E2E╲          - CLI 전체 흐름
       ╱──────╲         - 실제 프로세스 실행
      ╱        ╲
     ╱Integration╲      - 서비스+저장소
    ╱────────────╲      - 파일 시스템 포함
   ╱              ╲
  ╱   Unit Tests   ╲    - 순수 함수
 ╱──────────────────╲   - Mock 의존성
```

### 6.2 테스트 커버리지 목표

| 레이어 | 목표 | 범위 |
|--------|------|------|
| Utils | 100% | 모든 함수/분기 |
| Service | 95%+ | 모든 성공/실패 경로 |
| Storage | 90%+ | 정상/에러/복구 |
| CLI | 85%+ | 명령어/옵션/에러 |

### 6.3 테스트 카테고리

#### 유닛 테스트 (test/unit/)
- `validator.test.ts` - 입력 검증
- `id-generator.test.ts` - ID 생성
- `formatter.test.ts` - 출력 포맷팅
- `storage.test.ts` - 저장소 동작
- `todo.service.test.ts` - 비즈니스 로직
- `service-errors.test.ts` - 에러 처리
- `edge-cases.test.ts` - 엣지 케이스

#### 통합 테스트 (test/integration/)
- `todo-service.test.ts` - 서비스 통합
- `storage.test.ts` - 파일 시스템 통합
- `full-workflow.test.ts` - 전체 워크플로우
- `error-recovery.test.ts` - 에러 복구
- `lock-management.test.ts` - 동시성

#### E2E 테스트 (test/e2e/)
- `cli-commands.test.ts` - CLI 명령어
- `edge-cases.test.ts` - 엣지 케이스
- `error-recovery.test.ts` - 에러 시나리오

### 6.4 테스트 원칙

1. **격리성**: 각 테스트는 독립적 (temp dir 사용)
2. **결정성**: 동일 입력 → 동일 결과
3. **속도**: 유닛 < 100ms, 통합 < 1s, E2E < 5s
4. **가독성**: Given-When-Then 패턴
5. **커버리지**: 모든 분기/예외 경로

### 6.5 테스트 데이터 전략

```typescript
// 픽스처 팩토리
function createTestTodo(overrides?: Partial<Todo>): Todo {
  return {
    id: '1712345678901001',
    content: '테스트 할 일',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}
```

## 7. 기술 스택

### 7.1 런타임 & 언어

- **Node.js**: >= 20.0.0
- **TypeScript**: 5.3.3 (strict mode)
- **Target**: ES2022

### 7.2 의존성

**프로덕션**: 외부 의존성 없음 (순수 Node.js API)

**개발**:
- vitest: 테스트 프레임워크
- typescript: 컴파일러
- eslint: 린터
- @types/node: 타입 정의

### 7.3 Node.js API 사용

- `fs/promises`: 비동기 파일 I/O
- `path`: 경로 조작
- `os`: 홈 디렉토리
- `process`: argv, exit

## 8. 성능 고려사항

### 8.1 메모리

- 전체 파일을 메모리에 로드
- 예상 최대: 10,000개 할 일 ≈ 1MB
- O(n) 필터링/정렬

### 8.2 I/O

- 읽기: 명령어 실행 시 1회
- 쓰기: 변경 시 1회 + 백업 1회
- 잠금: 빈 파일 생성/삭제

### 8.3 동시성

- 파일 기반 잠금 (다중 프로세스)
- 재시도 기반 대기
- 타임아웃: 500ms

## 9. 보안 고려사항

### 9.1 파일 권한

- 저장 디렉토리: 사용자 홈 (~/.todo-cli)
- 파일 권한: 시스템 기본값
- 민감 정보: 저장하지 않음

### 9.2 입력 검증

- 길이 제한: 500자
- 타입 검증: 문자열만
- 특수문자: 모두 허용 (UTF-8)

## 10. 확장성

### 10.1 향후 기능 (Cycle 2+)

- 수정 (edit)
- 필터링 (list --completed)
- 검색 (search)
- 태그 (tag)
- 우선순위 (priority)
- 마감일 (due)

### 10.2 스키마 진화

```typescript
// 버전 마이그레이션 전략
interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate(data: any): StorageSchema;
}
```

---

## A. 부록: 의존성 다이어그램

```
cli.ts
  └─► todo.service.ts
        └─► storage.ts
              └─► (fs/promises)
        └─► validator.ts
        └─► id-generator.ts
  └─► formatter.ts
  └─► types.ts
  └─► errors.ts
```

## B. 부록: 상태 다이어그램

```
      ┌─────────┐
      │ pending │
      └────┬────┘
           │ done()
           ▼
      ┌─────────┐
      │  done   │
      └────┬────┘
           │ remove()
           ▼
      [삭제됨]
```
