# System Design: todo-cli

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Layer (index.ts)                 │
│  - Command parsing (Commander.js)                      │
│  - User I/O (chalk for colors)                         │
│  - Error handling & exit codes                         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Service Layer (core/todo-service.ts)       │
│  - Business logic validation                           │
│  - Domain rules enforcement                            │
│  - Orchestration of repository calls                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│          Repository Layer (repository/*.ts)             │
│  - Data persistence abstraction                        │
│  - JSON file I/O with locking                          │
│  - UUID generation & timestamp management              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                Storage Layer (JSON File)                │
│  - ~/.taskmaster/tasks.json                            │
│  - Atomic writes with file locking                     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 디렉터리 구조

```
workspace/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── core/
│   │   ├── types.ts                # Domain interfaces (Todo, Repository, Service)
│   │   ├── todo-service.ts         # Business logic implementation
│   │   └── errors.ts               # Error classes (TodoError, ValidationError, etc.)
│   ├── models/
│   │   └── task.ts                 # Task entity & priority enum
│   ├── repositories/
│   │   └── taskRepository.ts       # Repository interface
│   ├── repository/
│   │   └── json-repository.ts      # JSON file-based implementation
│   ├── services/
│   │   ├── services.ts             # Service interfaces
│   │   └── taskService.ts          # Task service implementation
│   └── utils/
│       ├── storage.ts              # File I/O utilities
│       ├── logger.ts               # Console output formatting
│       └── validator.ts            # Input validation utilities
├── test/
│   ├── unit/
│   │   ├── todo-service.test.ts    # Service layer unit tests
│   │   ├── json-repository.test.ts # Repository layer unit tests
│   │   └── ...                     # Other unit tests
│   ├── integration/
│   │   └── cli.test.ts             # End-to-end CLI tests
│   └── edge/
│       └── edge-cases.test.ts      # Edge case tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 기술 스택

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Language | TypeScript | ^5.3.2 | Type safety, better DX |
| Runtime | Node.js | >=18.0.0 | JavaScript runtime |
| CLI Framework | Commander.js | ^11.1.0 | Command parsing |
| Colors | Chalk | ^5.3.0 | Terminal colors |
| UUID | uuid | ^9.0.1 | Unique ID generation |
| File Locking | proper-lockfile | ^4.1.2 | Concurrent access safety |
| Testing | Vitest | ^1.0.4 | Unit & integration tests |
| Linting | ESLint | ^8.54.0 | Code quality |

---

## 4. 핵심 인터페이스 설계

### 4.1 Domain Types (core/types.ts)

```typescript
interface Todo {
  id: string;              // UUID v4
  title: string;           // User-provided title (trimmed)
  completed: boolean;      // Default: false
  createdAt: string;       // ISO 8601 timestamp
  updatedAt?: string;      // Optional update timestamp
}

interface AddTodoInput {
  title: string;
}

interface ListTodoOptions {
  all: boolean;            // true = all todos, false = incomplete only
}
```

### 4.2 Repository Interface

```typescript
interface TodoRepository {
  getAll(): Promise<Todo[]>;
  findById(id: string): Promise<Todo | null>;
  add(todo: Omit<Todo, 'id' | 'createdAt'>): Promise<Todo>;
  update(id: string, updates: Partial<Todo>): Promise<Todo | null>;
  delete(id: string): Promise<boolean>;
  exists(): Promise<boolean>;
}
```

### 4.3 Service Interface

```typescript
interface TodoService {
  addTodo(input: AddTodoInput): Promise<Todo>;
  listTodos(options: ListTodoOptions): Promise<Todo[]>;
}
```

---

## 5. 에러 처리 전략

### 5.1 Error Hierarchy

```
TodoError (base)
├── ValidationError (exit code: 1)
│   └── User input errors (empty title, invalid format)
└── RepositoryError (exit code: 2)
    └── System errors (file I/O, JSON parse, permissions)
```

### 5.2 Exit Codes

| Code | Category | Description | Example |
|------|----------|-------------|---------|
| 0 | Success | Operation completed successfully | todo add "Task" |
| 1 | User Error | Invalid input or usage | Empty title, invalid ID |
| 2 | System Error | File system or runtime error | Permission denied, disk full |

### 5.3 Error Messages

- **User-friendly**: Korean messages for end users
- **Actionable**: Clear guidance on how to fix
- **Contextual**: Include relevant details (e.g., file path)

```typescript
// Example error messages
throw new ValidationError('제목을 입력해주세요');
throw new RepositoryError('데이터 파일을 읽을 수 없습니다', cause);
```

---

## 6. 데이터 저장 전략

### 6.1 File Location

- **Default**: `~/.taskmaster/tasks.json`
- **Override**: `TODO_DATA_DIR` environment variable

### 6.2 File Format

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Buy groceries",
    "completed": false,
    "createdAt": "2026-03-21T10:00:00Z",
    "updatedAt": "2026-03-21T11:30:00Z"
  }
]
```

### 6.3 File Locking

- Use `proper-lockfile` for concurrent access safety
- Retry strategy: 3 retries with 100ms delay
- Lock timeout: 5 seconds

### 6.4 Atomic Writes

1. Write to temporary file
2. Rename to final destination (atomic on POSIX systems)
3. Fallback to direct write if rename fails

---

## 7. 테스트 전략

### 7.1 Test Pyramid

```
        ┌───────────┐
        │   E2E     │  (CLI integration tests)
        │   10%     │
        ├───────────┤
        │Integration│  (Service + Repository)
        │   20%     │
        ├───────────┤
        │   Unit    │  (Pure functions, isolated logic)
        │   70%     │
        └───────────┘
```

### 7.2 Test Categories

#### Unit Tests (test/unit/)
- **Service Layer**: Mock repository, test business logic
- **Repository Layer**: Use temp directories, test file I/O
- **Coverage Target**: ≥80% for core logic

#### Integration Tests (test/integration/)
- **CLI Tests**: Execute actual commands via child_process
- **End-to-End**: Add → List → Complete → Delete flow
- **Environment**: Isolated temp directories

#### Edge Case Tests (test/edge/)
- Empty/whitespace input
- Unicode and special characters
- Very long strings (1000+ chars)
- Malformed JSON recovery
- Permission denied scenarios
- Concurrent access (multiple processes)

### 7.3 Test Coverage Requirements

| Layer | Lines | Functions | Branches | Statements |
|-------|-------|-----------|----------|------------|
| Core Services | ≥80% | ≥80% | ≥80% | ≥80% |
| Repository | ≥80% | ≥80% | ≥70% | ≥80% |
| CLI | ≥60% | ≥60% | ≥50% | ≥60% |

### 7.4 Test Data Strategy

- Use `mkdtempSync` for isolated temp directories
- Clean up after each test (afterEach hooks)
- Mock time-dependent values (UUID, timestamps) when needed

---

## 8. 보안 고려사항

### 8.1 Input Validation

- Trim whitespace from titles
- Reject empty or whitespace-only titles
- No length limit (let users decide)
- Accept all Unicode characters

### 8.2 File Permissions

- Create files with 0o644 (rw-r--r--)
- Create directories with 0o755 (rwxr-xr-x)
- Handle permission errors gracefully

### 8.3 Path Traversal

- Validate data directory path
- Prevent `../` in user input (not applicable for current scope)
- Use path.join() for path construction

---

## 9. 성능 고려사항

### 9.1 File I/O Optimization

- Read file once per operation (cache in memory)
- Write immediately on changes (no batching yet)
- Use streams for large files (future enhancement)

### 9.2 Scalability

- Current design supports ~10,000 todos efficiently
- For larger datasets, consider:
  - Indexing by ID
  - Pagination for list command
  - Database instead of JSON

---

## 10. 의존성 주입 (Dependency Injection)

### 10.1 Pattern

```typescript
// Service depends on Repository interface
class TodoServiceImpl {
  constructor(private readonly repository: TodoRepository) {}
}

// Repository is injected at runtime
const repository = new JsonRepository(dataDir);
const service = new TodoServiceImpl(repository);
```

### 10.2 Benefits

- Easy testing with mock repositories
- Flexible implementation swapping
- Clear separation of concerns

---

## 11. 우선순위 지원 (Priority Feature)

### 11.1 Priority Enum

```typescript
enum TaskPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}
```

### 11.2 CLI Usage

```bash
todo add "Urgent task" --priority HIGH
todo add "Normal task" --priority MEDIUM  # default
todo add "Later task" --priority LOW
```

### 11.3 Sorting Strategy

- Sort by priority first (HIGH > MEDIUM > LOW)
- Then by creation date (newest first)
- Completed tasks at the bottom (when --all)

---

## 12. 로깅 및 디버깅

### 12.1 Output Format

```
[1] [ ] Buy groceries (2026-03-21)          # Incomplete
[2] [✓] Complete project (2026-03-20)       # Completed
[3] [ ] Urgent task (HIGH) (2026-03-21)     # With priority
```

### 12.2 Color Coding

- **Green**: Success messages, completed tasks
- **Yellow**: Warnings, high priority
- **Red**: Errors, urgent items
- **Blue**: Information, medium priority
- **Gray**: Low priority, metadata

---

## 13. 향후 확장 포인트

### 13.1 Phase 2 (Next Cycle)

- `complete` command
- `delete` command
- Batch operations

### 13.2 Phase 3 (Future)

- Search/filter by keyword
- Sort by date/priority
- Tags and categories
- Due dates

### 13.3 Phase 4 (Advanced)

- Data migration (versioning)
- Backup/restore
- Cloud sync
- Multi-device support

---

## 14. 리스크 및 완화 전략

| Risk | Impact | Mitigation |
|------|--------|------------|
| File corruption | High | Atomic writes, backup before write |
| Concurrent access | Medium | File locking, retry logic |
| Permission errors | Low | Graceful error messages |
| Large datasets | Medium | Pagination, indexing (future) |
| Unicode issues | Low | Comprehensive test cases |

---

## 15. 결론

이 설계는 다음 원칙을 따릅니다:

1. **단순성**: 최소한의 의존성, 명확한 구조
2. **테스트 가능성**: 모든 계층이 테스트 가능하도록 설계
3. **확장성**: 향후 기능 추가가 용이한 구조
4. **안정성**: 에러 처리와 파일 잠금으로 데이터 보호
5. **사용자 경험**: 명확한 메시지와 직관적인 CLI

이번 Cycle 1에서는 **add**와 **list** 기능에 집중하여 프로덕션 품질의 기반을 마련합니다.
