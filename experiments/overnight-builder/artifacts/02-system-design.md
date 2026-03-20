# System Design: TaskMaster CLI

작성일: 2026-03-20
Cycle: 1
버전: 1.0.0

---

## 1. 아키텍처 개요

### 1.1 설계 원칙
- **Clean Architecture**: 비즈니스 로직과 인프라스트럭처 분리
- **SOLID 원칙**: 인터페이스 기반 설계로 확장성 확보
- **TDD**: 테스트 주도 개발로 품질 보장
- **Functional Core, Imperative Shell**: 순수 함수와 부작용 분리

### 1.2 레이어 구조

```
┌─────────────────────────────────────────────────────┐
│  CLI Layer (Commander.js)                           │
│  - 명령어 파싱                                       │
│  - 사용자 입출력                                     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  Service Layer                                      │
│  - 비즈니스 로직                                     │
│  - 검증 오케스트레이션                               │
│  - 트랜잭션 관리                                     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  Repository Layer                                   │
│  - 데이터 접근 추상화                                │
│  - 영속성 관리                                       │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  Infrastructure Layer                               │
│  - 파일 시스템 I/O                                   │
│  - 파일 잠금 메커니즘                                │
└─────────────────────────────────────────────────────┘
```

---

## 2. 핵심 컴포넌트

### 2.1 Models (도메인 모델)

#### Task
```typescript
interface Task {
  id: string;           // UUID v4
  content: string;      // 1-500자
  completed: boolean;   // 완료 여부
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

#### TaskStore
```typescript
interface TaskStore {
  version: string;      // 스키마 버전 ("1.0.0")
  tasks: Task[];
}
```

### 2.2 Interfaces (추상화)

#### ITaskRepository
```typescript
interface ITaskRepository {
  getAll(): Promise<Task[]>;
  getById(id: string): Promise<Task | null>;
  add(input: CreateTaskInput): Promise<Task>;
  update(id: string, updates: UpdateTaskInput): Promise<Task>;
  delete(id: string): Promise<void>;
  deleteCompleted(): Promise<number>;
  count(): Promise<{ total: number; completed: number }>;
}
```

#### ITaskService
```typescript
interface ITaskService {
  addTask(content: string): Promise<Task>;
  listTasks(includeCompleted: boolean): Promise<Task[]>;
  completeTask(id: string): Promise<Task>;
  uncompleteTask(id: string): Promise<Task>;
  removeTask(id: string): Promise<void>;
  clearCompleted(): Promise<number>;
  getProgress(): Promise<Progress>;
}
```

#### IValidationService
```typescript
interface IValidationService {
  validateContent(content: string): ValidationResult;
  validateId(id: string): ValidationResult;
}
```

#### IFileSystem
```typescript
interface IFileSystem {
  exists(path: string): Promise<boolean>;
  readJSON<T>(path: string): Promise<T>;
  writeJSON<T>(path: string, data: T): Promise<void>;
  ensureDir(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}
```

#### IFileLockManager
```typescript
interface IFileLockManager {
  withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T>;
}
```

### 2.3 Services (비즈니스 로직)

#### TaskServiceImpl
- **책임**: 할 일 관리의 핵심 비즈니스 로직
- **의존성**: ITaskRepository, IValidationService
- **주요 메서드**:
  - `addTask()`: 검증 → Repository 저장
  - `completeTask()`: 상태 확인 → 완료 처리
  - `uncompleteTask()`: 상태 확인 → 미완료 처리
  - `removeTask()`: 존재 확인 → 삭제
  - `clearCompleted()`: 완료된 항목 일괄 삭제
  - `getProgress()`: 진행률 계산

#### ValidationServiceImpl
- **책임**: 입력 데이터 검증
- **검증 규칙**:
  - content: 1-500자, trim 적용
  - id: non-empty string

### 2.4 Repository (데이터 접근)

#### TaskRepositoryImpl
- **책임**: Task 영속성 관리
- **의존성**: IFileSystem, IFileLockManager
- **파일 위치**: `~/.taskmaster/data/tasks.json`
- **잠금 전략**: 모든 쓰기 작업에 파일 잠금 적용

### 2.5 Infrastructure (인프라)

#### FileSystemImpl
- **책임**: Node.js fs 모듈 래핑
- **에러 처리**: 모든 I/O 작업을 try-catch로 보호
- **테스트 가능성**: 인터페이스를 통한 mock 가능

#### FileLockManagerImpl
- **책임**: 동시성 제어
- **구현**: proper-lockfile 라이브러리 사용
- **잠금 범위**: 파일 단위
- **타임아웃**: 5초

---

## 3. 에러 전략

### 3.1 에러 분류 체계

| 코드 범위 | 카테고리 | 예시 |
|----------|---------|------|
| TASK-001~099 | 검증 에러 | 내용 길이, 형식 오류 |
| TASK-100~199 | 리소스 에러 | 태스크 없음, 파일 없음 |
| TASK-200~299 | I/O 에러 | 파일 읽기/쓰기 실패 |
| TASK-300~399 | 동시성 에러 | 잠금 획득 실패 |
| TASK-500~599 | 비즈니스 로직 에러 | 이미 완료된 항목 |

### 3.2 에러 클래스 계층

```
TaskError (base)
├── ValidationError
│   ├── 내용 길이 에러 (TASK-001, TASK-002)
│   └── ID 형식 에러 (TASK-003)
├── TaskNotFoundError (TASK-100)
├── FileIOError (TASK-200~299)
│   ├── 읽기 에러 (TASK-201, TASK-202)
│   └── 쓰기 에러 (TASK-203~206)
├── ConcurrencyError (TASK-300~399)
│   └── 잠금 에러 (TASK-301, TASK-302)
└── BusinessLogicError (TASK-500~599)
    ├── 이미 완료됨 (TASK-500)
    └── 이미 미완료임 (TASK-501)
```

### 3.3 에러 메시지 가이드라인

**사용자 친화적 메시지**:
- 기술 용어 지양
- 해결 방법 포함
- 한국어로 명확하게 표현

**예시**:
```
✗ BAD: "ENOENT: no such file or directory"
✓ GOOD: "할 일 데이터가 없습니다. 'taskmaster add'로 새 할 일을 추가하세요."
```

---

## 4. 파일 구조

```
workspace/
├── src/
│   ├── index.ts                    # 진입점
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── add.ts             # add 명령어
│   │   │   ├── list.ts            # list 명령어
│   │   │   ├── done.ts            # done 명령어
│   │   │   ├── undone.ts          # undone 명령어
│   │   │   ├── remove.ts          # remove 명령어
│   │   │   └── clear.ts           # clear 명령어
│   │   └── output.ts              # 출력 포맷팅
│   ├── models/
│   │   ├── Task.ts                # Task 인터페이스
│   │   └── TaskStore.ts           # TaskStore 인터페이스
│   ├── services/
│   │   ├── TaskService.ts         # 할 일 관리 서비스
│   │   └── ValidationService.ts   # 검증 서비스
│   ├── repository/
│   │   ├── TaskRepository.ts      # 저장소 구현
│   │   └── FileLockManager.ts     # 파일 잠금
│   ├── infrastructure/
│   │   └── IFileSystem.ts         # 파일 시스템 인터페이스
│   ├── errors/
│   │   ├── TaskError.ts           # 에러 클래스들
│   │   └── ErrorCodes.ts          # 에러 코드 정의
│   └── utils/
│       └── formatter.ts           # 포맷팅 유틸리티
├── test/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── TaskService.test.ts
│   │   │   └── ValidationService.test.ts
│   │   ├── repository/
│   │   │   └── TaskRepository.test.ts
│   │   └── utils/
│   │       └── formatter.test.ts
│   ├── integration/
│   │   ├── commands/
│   │   │   ├── add.test.ts
│   │   │   ├── list.test.ts
│   │   │   ├── done.test.ts
│   │   │   ├── undone.test.ts
│   │   │   ├── remove.test.ts
│   │   │   └── clear.test.ts
│   │   └── repository/
│   │       └── TaskRepository.integration.test.ts
│   ├── e2e/
│   │   └── cli.e2e.test.ts
│   └── fixtures/
│       ├── testData.ts            # 테스트 데이터 팩토리
│       └── mockFileSystem.ts      # 파일 시스템 mock
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .eslintrc.json
```

---

## 5. 데이터 흐름

### 5.1 할 일 추가 (add)

```
User Input → CLI (add.ts)
    ↓
TaskService.addTask(content)
    ↓
ValidationService.validateContent(content)
    ↓ (유효하면)
TaskRepository.add(input)
    ↓
FileLockManager.withLock()
    ↓
FileSystem.writeJSON(tasks.json)
    ↓
Return Task
    ↓
CLI 출력 (성공 메시지)
```

### 5.2 완료 처리 (done)

```
User Input → CLI (done.ts)
    ↓
TaskService.completeTask(id)
    ↓
ValidationService.validateId(id)
    ↓
TaskRepository.getById(id)
    ↓ (존재하면)
상태 확인 (completed === false?)
    ↓ (미완료면)
TaskRepository.update(id, { completed: true })
    ↓
Return Task
    ↓
CLI 출력 (성공 메시지)
```

### 5.3 목록 조회 (list)

```
User Input → CLI (list.ts)
    ↓
TaskService.listTasks(includeCompleted)
    ↓
TaskRepository.getAll()
    ↓
Filter (if !includeCompleted)
    ↓
Return Task[]
    ↓
CLI 출력 (테이블 + 진행률)
```

---

## 6. 테스트 전략

### 6.1 테스트 피라미드

```
        ╱ ╲
       ╱ E2E╲        - CLI 전체 흐름 테스트
      ╱──────╲       - 실제 파일 시스템 사용
     ╱        ╲
    ╱Integration╲    - Repository + Service 통합
   ╱────────────╲    - 인메모리 파일 시스템
  ╱              ╲
 ╱   Unit Tests   ╲  - Service, Validator 로직
╱──────────────────╲ - Mock 의존성
```

### 6.2 테스트 커버리지 목표

| 레이어 | 목표 커버리지 | 이유 |
|-------|------------|------|
| Services | 100% | 핵심 비즈니스 로직 |
| Repository | 95% | 데이터 무결성 중요 |
| CLI | 90% | 사용자 경험 보장 |
| Utils | 100% | 순수 함수 |

### 6.3 테스트 카테고리

#### Unit Tests
- **Service Layer**: Mock Repository로 비즈니스 로직 검증
- **Validation**: 경계값 분석, 동등 분할
- **Utils**: 순수 함수 테스트

#### Integration Tests
- **Repository + FileSystem**: 실제 파일 I/O 시뮬레이션
- **Service + Repository**: 레이어 간 통합 검증

#### E2E Tests
- **CLI Commands**: 전체 흐름 테스트
- **에러 시나리오**: 파일 손상, 권한 문제 등

### 6.4 테스트 시나리오

#### 정상 케이스 (Happy Path)
- 할 일 추가/조회/수정/삭제
- 완료 처리/취소
- 완료된 항목 일괄 삭제
- 진행률 계산

#### 에러 케이스
- 빈 내용 입력
- 내용 500자 초과
- 존재하지 않는 ID
- 이미 완료/미완료된 항목
- 파일 I/O 실패
- 파일 잠금 실패

#### 엣지 케이스
- 빈 목록
- 0%, 100% 진행률
- 특수문자, 이모지
- 매우 긴 ID
- 동시 수정 (lock test)

### 6.5 Mock 전략

**In-Memory FileSystem**:
```typescript
class MockFileSystem implements IFileSystem {
  private files = new Map<string, string>();
  
  async readJSON<T>(path: string): Promise<T> {
    const content = this.files.get(path);
    if (!content) throw new Error('File not found');
    return JSON.parse(content);
  }
  
  async writeJSON<T>(path: string, data: T): Promise<void> {
    this.files.set(path, JSON.stringify(data, null, 2));
  }
}
```

**Test Data Factory**:
```typescript
export function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-id',
    content: '테스트 할 일',
    completed: false,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}
```

---

## 7. 성능 고려사항

### 7.1 응답 시간 목표
- 모든 명령어: 200ms 이내
- 1000개 할 일 조회: 100ms 이내

### 7.2 최적화 전략
- **지연 로딩**: 필요 시에만 파일 읽기
- **캐싱**: 메모리에 TaskStore 캐시 (선택적)
- **배치 작업**: clear 명령어 최적화

### 7.3 리소스 관리
- **파일 핸들**: 사용 후 즉시 해제
- **잠금 타임아웃**: 5초 후 자동 해제
- **메모리**: 대용량 데이터 스트리밍 처리

---

## 8. 보안 고려사항

### 8.1 데이터 보호
- **파일 권한**: tasks.json은 사용자만 읽기/쓰기 (0600)
- **민감 정보**: 할 일 내용에 비밀번호 저장 경고

### 8.2 입력 검증
- **Injection 방지**: JSON stringify로 이스케이프
- **길이 제한**: DoS 방지를 위한 500자 제한

---

## 9. 확장성

### 9.1 향후 기능 확장
- **태그 시스템**: Task 모델에 tags 필드 추가
- **우선순위**: priority 필드 추가
- **마감일**: dueDate 필드 추가
- **카테고리**: category 필드 추가

### 9.2 아키텍처 확장
- **플러그인 시스템**: 커맨드 플러그인 지원
- **백엔드 교체**: Repository 교체로 DB 사용 가능
- **다국어**: 에러 메시지 i18n 지원

---

## 10. 의존성

### 10.1 프로덕션 의존성
```json
{
  "chalk": "^5.3.0",        // 터미널 색상
  "cli-table3": "^0.6.3",   // 테이블 출력
  "commander": "^12.0.0",   // CLI 프레임워크
  "uuid": "^9.0.0"          // UUID 생성
}
```

### 10.2 개발 의존성
```json
{
  "@types/node": "^20.11.0",
  "@types/uuid": "^9.0.0",
  "@typescript-eslint/eslint-plugin": "^7.0.0",
  "@typescript-eslint/parser": "^7.0.0",
  "@vitest/coverage-v8": "^1.3.0",
  "eslint": "^8.57.0",
  "prettier": "^3.2.0",
  "typescript": "^5.4.0",
  "vitest": "^1.3.0"
}
```

---

## 11. 배포

### 11.1 빌드 프로세스
```bash
npm run typecheck    # 타입 검사
npm run lint         # 린트 검사
npm run test         # 테스트 실행
npm run build        # TypeScript 컴파일
```

### 11.2 npm 패키지
```json
{
  "name": "taskmaster",
  "version": "1.0.0",
  "bin": {
    "taskmaster": "./dist/index.js"
  },
  "files": ["dist/**/*"],
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

## 12. 모니터링 & 로깅

### 12.1 로그 레벨
- **ERROR**: 파일 I/O 실패, 데이터 손상
- **WARN**: 검증 실패, 비정상 상태
- **INFO**: 명령어 실행 (verbose 모드)
- **DEBUG**: 상세 실행 정보 (debug 모드)

### 12.2 로그 파일
- **위치**: `~/.taskmaster/logs/taskmaster.log`
- **회전**: 10MB 단위
- **보관**: 30일

---

## 13. 완료 기준

### 13.1 기능 완료
- [x] 6개 핵심 명령어 구현
- [x] JSON 파일 저장/로드
- [x] 에러 핸들링

### 13.2 품질 완료
- [x] 테스트 커버리지 90% 이상
- [x] TypeScript strict mode
- [x] ESLint 통과

### 13.3 문서화 완료
- [x] 시스템 설계 문서
- [x] API 문서 (인터페이스 주석)
- [ ] README.md
- [ ] CHANGELOG.md

---

**다음 단계**: 구현 완료 및 문서화
