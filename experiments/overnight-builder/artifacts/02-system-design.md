# System Design: TaskMaster CLI

## 1. 아키텍처 개요

### 1.1 레이어드 아키텍처
```
┌─────────────────────────────────────┐
│  CLI Layer (src/cli)                │  ← 사용자 입력/출력 담당
├─────────────────────────────────────┤
│  Service Layer (src/services)       │  ← 비즈니스 로직
├─────────────────────────────────────┤
│  Repository Layer (src/repositories)│  ← 데이터 영속성
├─────────────────────────────────────┤
│  Models (src/models)                │  ← 타입 정의
└─────────────────────────────────────┘
```

### 1.2 의존성 규칙
- CLI → Service → Repository → Models
- 상위 레이어는 하위 레이어에만 의존
- 역방향 의존성 금지

---

## 2. 모듈 구조

### 2.1 디렉터리 구조
```
workspace/
├── src/
│   ├── index.ts                    # 진입점
│   ├── cli/
│   │   ├── cli.ts                  # CLI 메인 로직
│   │   └── commands/               # 각 명령어 핸들러
│   │       ├── add.ts              # add 명령
│   │       └── list.ts             # list 명령
│   ├── services/
│   │   └── taskService.ts          # 태스크 비즈니스 로직
│   ├── repositories/
│   │   └── taskRepository.ts       # JSON 파일 CRUD
│   ├── models/
│   │   └── task.ts                 # Task 타입 정의
│   └── utils/
│       ├── logger.ts               # 색상 출력
│       ├── storage.ts              # 파일 경로 관리
│       └── validator.ts            # 입력 검증
├── test/
│   ├── unit/                       # 단위 테스트
│   ├── integration/                # 통합 테스트
│   └── edge/                       # 엣지 케이스 테스트
└── dist/                           # 컴파일된 JS
```

---

## 3. 인터페이스 설계

### 3.1 Models (src/models/task.ts)

```typescript
export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;              // timestamp 기반 고유 ID
  title: string;           // 할 일 제목
  priority: Priority;      // 우선순위
  completed: boolean;      // 완료 여부
  createdAt: string;       // ISO 8601 형식
  completedAt?: string;    // 완료 시점 (선택적)
}

export interface TaskFilter {
  showCompleted?: boolean; // 완료된 태스크 포함 여부
}

export interface TaskSortOptions {
  sortByPriority: boolean; // 우선순위 정렬 여부
  sortByDate: boolean;     // 생성일 정렬 여부
}
```

### 3.2 Repository Interface (src/repositories/taskRepository.ts)

```typescript
export interface ITaskRepository {
  // 모든 태스크 조회
  loadAll(): Promise<Task[]>;
  
  // 태스크 저장
  save(task: Task): Promise<void>;
  
  // ID로 태스크 조회
  findById(id: string): Promise<Task | null>;
  
  // 태스크 업데이트
  update(task: Task): Promise<void>;
  
  // 태스크 삭제
  delete(id: string): Promise<void>;
  
  // 파일 존재 여부 확인
  exists(): Promise<boolean>;
  
  // 파일 초기화
  initialize(): Promise<void>;
}
```

### 3.3 Service Interface (src/services/taskService.ts)

```typescript
export interface ITaskService {
  // 태스크 추가
  addTask(title: string, priority?: Priority): Promise<Task>;
  
  // 태스크 목록 조회
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  
  // 태스크 완료 처리
  completeTask(id: string): Promise<void>;
  
  // 태스크 삭제
  deleteTask(id: string): Promise<void>;
}
```

### 3.4 CLI Interface (src/cli/cli.ts)

```typescript
export interface ICLI {
  // 명령어 실행
  run(args: string[]): Promise<void>;
  
  // 도움말 표시
  showHelp(): void;
  
  // 에러 표시
  showError(message: string): void;
  
  // 성공 메시지 표시
  showSuccess(message: string): void;
}
```

---

## 4. 에러 처리 전략

### 4.1 에러 계층 구조
```typescript
// src/utils/errors.ts
export class TaskMasterError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TaskMasterError';
  }
}

export class FileSystemError extends TaskMasterError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = 'FileSystemError';
  }
}

export class ValidationError extends TaskMasterError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = 'ValidationError';
  }
}

export class TaskNotFoundError extends TaskMasterError {
  constructor(id: string) {
    super(`Task not found: ${id}`, 'TASK_NOT_FOUND');
    this.name = 'TaskNotFoundError';
  }
}
```

### 4.2 에러 코드 체계
| 코드 | 의미 | 사용자 메시지 |
|------|------|---------------|
| `FS_PERMISSION_DENIED` | 파일 권한 없음 | "❌ Error: Cannot write to ~/.taskmaster/tasks.json. Check permissions." |
| `FS_CORRUPTED_FILE` | JSON 손상 | "❌ Error: Task file corrupted. Run 'taskmaster repair' to fix." |
| `FS_DISK_FULL` | 디스크 가득 참 | "❌ Error: Disk full. Free up space and try again." |
| `VAL_EMPTY_TITLE` | 빈 제목 | "❌ Error: Task title cannot be empty" |
| `VAL_INVALID_PRIORITY` | 잘못된 우선순위 | "❌ Error: Priority must be low, medium, or high" |
| `TASK_NOT_FOUND` | 태스크 없음 | "❌ Error: Task not found: {id}" |

### 4.3 Graceful Degradation
- **파일 없음**: 첫 실행 시 자동 생성
- **디렉터리 없음**: `~/.taskmaster/` 자동 생성
- **JSON 손상**: 사용자에게 명확한 안내 + repair 명령 제안

---

## 5. 데이터 저장 전략

### 5.1 파일 위치
```
~/.taskmaster/
├── tasks.json        # 메인 데이터 파일
├── backup.json       # 자동 백업 (선택적, 향후 구현)
└── config.json       # 설정 파일 (선택적, 향후 구현)
```

### 5.2 JSON 스키마
```json
{
  "version": "1.0.0",
  "tasks": [
    {
      "id": "1710998400000",
      "title": "Fix login bug",
      "priority": "high",
      "completed": false,
      "createdAt": "2026-03-21T09:30:00.000Z"
    }
  ]
}
```

### 5.3 파일 잠금 전략
- 이번 cycle: 미구현 (단순성 우선)
- 향후: `proper-lockfile` 라이브러리로 파일 잠금 추가 가능

---

## 6. 테스트 전략

### 6.1 테스트 피라미드
```
        ┌───────┐
        │  E2E  │  ← CLI 전체 흐름 테스트 (소수)
        └───────┘
      ┌───────────┐
      │Integration│  ← Service + Repository 통합 (중간)
      └───────────┘
    ┌───────────────┐
    │  Unit Tests   │  ← 각 함수/클래스 단위 (다수)
    └───────────────┘
```

### 6.2 테스트 커버리지 목표
| 레이어 | 목표 커버리지 | 비고 |
|--------|---------------|------|
| Models | 100% | 타입이므로 간단 |
| Utils | 100% | 순수 함수 |
| Repository | 90% | 파일 시스템 mock |
| Service | 95% | 핵심 로직 |
| CLI | 80% | 통합 테스트로 보완 |
| **전체** | **≥ 80%** | |

### 6.3 테스트 카테고리

#### 6.3.1 단위 테스트 (test/unit/)
- **Repository**: `loadAll`, `save`, `findById`, `update`, `delete`
- **Service**: `addTask`, `listTasks`, 정렬 로직, 필터링 로직
- **Utils**: `logger`, `validator`, `storage`

#### 6.3.2 통합 테스트 (test/integration/)
- Service → Repository 통합 흐름
- 실제 파일 시스템 사용 (임시 디렉터리)
- Cleanup 필수

#### 6.3.3 엣지 케이스 테스트 (test/edge/)
- 빈 목록
- 매우 긴 제목 (80자 이상)
- 특수문자 포함 제목 (이모지, 유니코드)
- 손상된 JSON 파일
- 동시 실행 (파일 충돌)
- 디스크 가득 참 시뮬레이션

#### 6.3.4 에러 케이스 테스트 (test/integration/)
- 빈 제목 입력
- 잘못된 priority 값
- 존재하지 않는 ID로 complete/delete
- 파일 권한 없음
- JSON 파싱 에러

### 6.4 테스트 도구 설정

#### 6.4.1 Vitest 설정 (vitest.config.ts)
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'test/'],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    }
  }
});
```

#### 6.4.2 Mock 전략
- 파일 시스템: `memfs` 또는 임시 디렉터리 사용
- 콘솔 출력: `console.log` spy
- 날짜: `Date.now()` mock (ID 생성용)

---

## 7. 테스트 파일 구조

### 7.1 Unit Tests
```
test/unit/
├── models/
│   └── task.test.ts          # Task 타입 테스트
├── repositories/
│   └── taskRepository.test.ts # Repository 단위 테스트
├── services/
│   └── taskService.test.ts   # Service 단위 테스트
└── utils/
    ├── logger.test.ts        # 로거 테스트
    ├── validator.test.ts     # 검증 테스트
    └── storage.test.ts       # 저장소 경로 테스트
```

### 7.2 Integration Tests
```
test/integration/
├── add-task.test.ts          # add 명령 통합 테스트
├── list-tasks.test.ts        # list 명령 통합 테스트
├── file-operations.test.ts   # 파일 CRUD 통합 테스트
└── error-handling.test.ts    # 에러 처리 통합 테스트
```

### 7.3 Edge Case Tests
```
test/edge/
├── empty-list.test.ts        # 빈 목록 처리
├── long-title.test.ts        # 긴 제목 처리
├── special-characters.test.ts # 특수문자 처리
├── corrupted-file.test.ts    # 손상된 파일 복구
└── concurrency.test.ts       # 동시 실행 테스트
```

---

## 8. 의존성 주입 전략

### 8.1 팩토리 패턴 사용
```typescript
// src/factory.ts
export function createTaskService(repository?: ITaskRepository): ITaskService {
  const repo = repository || new TaskRepository();
  return new TaskService(repo);
}

export function createCLI(service?: ITaskService): ICLI {
  const svc = service || createTaskService();
  return new CLI(svc);
}
```

### 8.2 테스트에서의 DI
```typescript
// 테스트에서 mock repository 주입
const mockRepo = {
  loadAll: vi.fn(),
  save: vi.fn(),
  // ...
};
const service = new TaskService(mockRepo);
```

---

## 9. 성능 고려사항

### 9.1 현재 단계 (Cycle 1)
- 태스크 수: < 1000개 예상
- 파일 크기: < 100KB 예상
- 성능 이슈 없음

### 9.2 향후 최적화 (필요 시)
- 대량 데이터: 스트리밍 JSON 파서 사용
- 빠른 검색: 인메모리 인덱스 구축
- 캐싱: Repository 레벨에서 캐시 적용

---

## 10. 보안 고려사항

### 10.1 현재 단계
- 로컬 파일 시스템만 사용 (네트워크 없음)
- 민감 정보 저장 없음
- 보안 이슈 최소화

### 10.2 향후 고려사항
- 파일 권한 검증 (0600)
- 민감한 메타데이터 암호화 (필요 시)

---

## 11. 확장성

### 11.1 향후 기능 추가 용이성
- 새 명령어 추가: `src/cli/commands/`에 파일 추가
- 새 필터/정렬: Service 레이어에 메서드 추가
- 다른 저장소: Repository 인터페이스 구현체 추가 (예: SQLite)

### 11.2 플러그인 아키텍처 (장기 계획)
- 명령어 플러그인 시스템
- 커스텀 포매터/필터 플러그인

---

## 12. 구현 우선순위 (Cycle 1)

### Phase 1: 기본 구조 (TDD)
1. ✅ Models 정의 (`Task` 타입)
2. ✅ Utils 구현 (`logger`, `validator`, `storage`)
3. ✅ Repository 구현 (`TaskRepository`)
4. ✅ Service 구현 (`TaskService`)
5. ✅ CLI 구현 (`add`, `list` 명령)

### Phase 2: 품질 향상
1. ✅ 에러 처리 강화
2. ✅ 엣지 케이스 대응
3. ✅ 색상 코딩
4. ✅ 도움말 구현

### Phase 3: 문서화
1. ✅ README.md 작성
2. ✅ JSDoc 주석 완료
3. ✅ 사용 예시 추가

---

## 13. 다음 Cycle 예고

### Cycle 2: CRUD 완성
- `complete` 명령 구현
- `delete` 명령 구현
- 통합 테스트 보강

### Cycle 3: 고급 기능
- `edit` 명령
- `filter` 명령
- `search` 명령

---

## 14. 리스크 및 완화 전략

| 리스크 | 영향 | 완화 전략 |
|--------|------|-----------|
| JSON 손상 | 데이터 손실 | 자동 백업, repair 명령 제공 |
| 동시성 문제 | 데이터 손실 | 향후 파일 잠금 구현 |
| 플랫폼 호환성 | Windows 경로 문제 | `path` 모듈 사용으로 크로스 플랫폼 지원 |
| 성능 저하 | 대량 데이터 시 느림 | 스트리밍 파서, 인덱싱 (향후) |

---

## 15. 품질 체크리스트

### 코드 품질
- [ ] TypeScript strict mode 통과
- [ ] ESLint 에러 0개
- [ ] 모든 함수에 JSDoc 주석
- [ ] 불변성 보장 (readonly 사용)

### 테스트 품질
- [ ] 커버리지 ≥ 80%
- [ ] 모든 에러 케이스 테스트
- [ ] 엣지 케이스 테스트
- [ ] 통합 테스트 포함

### 사용자 품질
- [ ] 명확한 에러 메시지
- [ ] 직관적인 UX
- [ ] 색상 코딩
- [ ] 도움말 제공

---

**작성 완료일**: 2026-03-21
**작성자**: Senior Architect & TDD Expert
**버전**: 1.0
