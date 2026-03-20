# System Design - Cycle 2

## 1. 아키텍처 개요

### 1.1 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Layer (cli.ts)                      │
│  - Command parsing (commander)                               │
│  - User interaction                                          │
│  - Output formatting                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Command Layer (commands/)                  │
│  - AddCommand                                                │
│  - ListCommand                                               │
│  - DoneCommand                                               │
│  - DeleteCommand                                             │
│  - SearchCommand (NEW)                                       │
│  - StatsCommand (NEW)                                        │
│                                                              │
│  Each command:                                               │
│  - Validates input                                           │
│  - Executes business logic                                   │
│  - Returns CommandResult                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Storage Layer (storage.ts)                 │
│  - JSON file management                                      │
│  - Atomic write operations                                   │
│  - Error recovery                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    File System (JSON)                        │
│  - ~/.todo-cli/todos.json                                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 데이터 흐름

```
User Input → CLI Parser → Command Validator → Business Logic → Storage → File System
                                        ↓
                                 CommandResult
                                        ↓
                                   Output Formatter
                                        ↓
                                   User Output
```

---

## 2. 핵심 인터페이스

### 2.1 Storage Interface

```typescript
export interface IStorage {
  initialize(): Promise<void>;
  load(): Promise<Todo[]>;
  save(todos: Todo[]): Promise<void>;
  add(todo: Todo): Promise<void>;
  update(id: string, updates: Partial<Todo>): Promise<Todo>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Todo | undefined>;
  exists(): Promise<boolean>;
}
```

### 2.2 Command Interface

```typescript
export interface ICommand {
  execute(options: any): Promise<CommandResult>;
}
```

### 2.3 Search Interface (NEW)

```typescript
export interface SearchOptions {
  keyword: string;
  regex?: boolean;
  caseSensitive?: boolean;
  status?: 'pending' | 'done';
  json?: boolean;
}

export interface SearchResult {
  todos: Todo[];
  meta: SearchMeta;
}

export interface SearchMeta {
  duration: number;
  totalSearched: number;
  matchedCount: number;
  keyword: string;
  isRegex: boolean;
}
```

### 2.4 Stats Interface (NEW)

```typescript
export interface StatsOptions {
  json?: boolean;
  verbose?: boolean;
}

export interface StatsResult {
  stats: Stats;
  timestamp: string;
}

export interface Stats {
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
  addedToday: number;
  completedToday: number;
  recentCompletions?: Array<{ date: string; count: number }>;
}
```

---

## 3. 검색 기능 설계

### 3.1 검색 알고리즘

```typescript
class SearchCommand {
  execute(options: SearchOptions): Promise<CommandResult> {
    // 1. Validate keyword
    validateSearchKeyword(options.keyword);
    
    // 2. Validate regex if needed
    if (options.regex) {
      validateRegex(options.keyword);
    }
    
    // 3. Load todos
    const todos = await storage.load();
    
    // 4. Filter by status (optimization)
    let results = options.status 
      ? todos.filter(t => t.status === options.status)
      : todos;
    
    // 5. Search by keyword
    results = options.regex
      ? this.regexSearch(results, options.keyword, options.caseSensitive)
      : this.literalSearch(results, options.keyword, options.caseSensitive);
    
    // 6. Return result with metadata
    return {
      success: true,
      data: { todos: results, meta: {...} },
      exitCode: 0
    };
  }
  
  private literalSearch(todos: Todo[], keyword: string, caseSensitive?: boolean): Todo[] {
    const searchTerm = caseSensitive ? keyword : keyword.toLowerCase();
    return todos.filter(t => {
      const content = caseSensitive ? t.content : t.content.toLowerCase();
      return content.includes(searchTerm);
    });
  }
  
  private regexSearch(todos: Todo[], pattern: string, caseSensitive?: boolean): Todo[] {
    const flags = caseSensitive ? '' : 'i';
    const regex = new RegExp(pattern, flags);
    return todos.filter(t => regex.test(t.content));
  }
}
```

### 3.2 검색 최적화 전략

1. **상태 필터링 우선**: 정규식/문자열 검색 전에 상태로 필터링
2. **지연 평가**: 대용량 데이터셋에서 필요시 페이지네이션
3. **인메모리 캐싱**: 자주 검색되는 패턴 캐싱 (향후 고려)

### 3.3 정규식 안전장치

```typescript
function validateRegex(pattern: string): void {
  try {
    new RegExp(pattern);
  } catch (error) {
    throw createUserError(
      ErrorCode.INVALID_REGEX,
      `잘못된 정규표현식입니다: ${error.message}`
    );
  }
  
  // 길이 제한
  if (pattern.length > 500) {
    throw createUserError(
      ErrorCode.KEYWORD_TOO_LONG,
      '정규표현식이 너무 깁니다 (최대 500자)'
    );
  }
}
```

---

## 4. 통계 기능 설계

### 4.1 통계 계산 알고리즘

```typescript
class StatsCommand {
  execute(options: StatsOptions): Promise<CommandResult> {
    const todos = await storage.load();
    const stats = this.calculateStats(todos, options.verbose);
    
    return {
      success: true,
      data: { stats, timestamp: new Date().toISOString() },
      exitCode: 0
    };
  }
  
  private calculateStats(todos: Todo[], verbose?: boolean): Stats {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return {
      total: todos.length,
      completed: todos.filter(t => t.status === 'done').length,
      pending: todos.filter(t => t.status === 'pending').length,
      completionRate: this.calcRate(todos),
      addedToday: this.countAddedToday(todos, todayStart),
      completedToday: this.countCompletedToday(todos, todayStart),
      recentCompletions: verbose ? this.calcRecentCompletions(todos) : undefined
    };
  }
  
  private calcRate(todos: Todo[]): number {
    if (todos.length === 0) return 0;
    const completed = todos.filter(t => t.status === 'done').length;
    return Math.round((completed / todos.length) * 100);
  }
  
  private countAddedToday(todos: Todo[], todayStart: Date): number {
    return todos.filter(t => new Date(t.createdAt) >= todayStart).length;
  }
  
  private countCompletedToday(todos: Todo[], todayStart: Date): number {
    return todos.filter(t => {
      if (t.status !== 'done') return false;
      const completionTime = t.completedAt || t.updatedAt;
      return new Date(completionTime) >= todayStart;
    }).length;
  }
  
  private calcRecentCompletions(todos: Todo[]): Array<{date: string, count: number}> {
    // 지난 7일 (오늘 포함) 완료 추이 계산
    const result = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      const count = todos.filter(t => {
        if (t.status !== 'done') return false;
        const completionTime = t.completedAt || t.updatedAt;
        const completedDate = new Date(completionTime);
        return completedDate >= dayStart && completedDate < dayEnd;
      }).length;
      
      result.push({
        date: dayStart.toISOString().split('T')[0],
        count
      });
    }
    
    return result.reverse(); // 오름차순
  }
}
```

### 4.2 성능 고려사항

- **단일 패스**: 모든 통계를 한 번의 배열 순회로 계산 가능
- **지연 계산**: verbose 모드가 아닐 때 recentCompletions 계산 생략
- **캐싱**: 향후 계산된 통계 캐싱 고려 (TTL 기반)

---

## 5. 에러 처리 전략

### 5.1 에러 분류

| 카테고리 | Exit Code | 예시 | 처리 방식 |
|---------|-----------|------|----------|
| 사용자 에러 | 1 | 빈 검색어, 잘못된 정규식 | 명확한 안내 메시지 |
| 시스템 에러 | 2 | 파일 권한, 디스크 full | 복구 시도 + 에러 로깅 |

### 5.2 에러 코드 체계

```typescript
enum ErrorCode {
  // 사용자 에러 (exit code 1)
  EMPTY_KEYWORD = 'EMPTY_KEYWORD',
  INVALID_REGEX = 'INVALID_REGEX',
  KEYWORD_TOO_LONG = 'KEYWORD_TOO_LONG',
  INVALID_SEARCH_KEYWORD = 'INVALID_SEARCH_KEYWORD',
  
  // 시스템 에러 (exit code 2)
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  STORAGE_CORRUPTED = 'STORAGE_CORRUPTED',
}
```

### 5.3 에러 메시지 가이드라인

1. **명확성**: 무엇이 잘못되었는지 명시
2. **해결책**: 어떻게 고칠 수 있는지 안내
3. **일관성**: 동일한 유형의 에러는 동일한 포맷
4. **현지화**: 한국어 메시지 사용

예시:
```
❌ 빈 검색어입니다.
   사용법: todo search <키워드>
   예시: todo search "우유"

❌ 잘못된 정규표현식입니다: Unexpected token *
   팁: 특수문자는 이스케이프가 필요할 수 있습니다.
   예시: todo search "\\d+" --regex
```

---

## 6. 테스트 전략

### 6.1 테스트 피라미드

```
        ┌───────────┐
        │   E2E     │  - CLI 통합 테스트
        │   (10%)   │  - 실제 사용 시나리오
        ├───────────┤
        │Integration│  - 명령어 + 스토리지
        │   (20%)   │  - 검색/통계 워크플로우
        ├───────────┤
        │   Unit    │  - 개별 함수/클래스
        │   (70%)   │  - 엣지 케이스 집중
        └───────────┘
```

### 6.2 테스트 카테고리

#### Unit Tests (70%)
- **검색 기능** (30개)
  - 기본 검색: 키워드, 대소문자, 빈 결과
  - 정규식: 단순 패턴, 복잡한 패턴, 잘못된 문법
  - 필터링: 상태 조합, JSON 출력
  - 특수문자: 한글, 이모지, 개행문자
  - 성능: 1000개 항목 검색

- **통계 기능** (25개)
  - 빈 저장소
  - 기본 통계: 총계, 완료/미완료, 완료율
  - 완료율 반올림
  - 오늘 추가/완료 항목
  - 7일 추세 (verbose 모드)
  - 데이터 무결성
  - 큰 데이터셋 (10000개)

#### Integration Tests (20%)
- CLI 검색 명령어 실행
- CLI 통계 명령어 실행
- 검색 + 통계 워크플로우
- 성능 벤치마크

#### Edge Cases (10%)
- 동시 실행 (파일 락킹)
- 특수 문자 경계 조건
- 파일 시스템 에러
- 메모리 제한

### 6.3 테스트 데이터 팩토리

```typescript
// tests/utils/test-helpers.ts
export function createTestTodo(overrides: Partial<Todo> = {}): Todo {
  const now = new Date().toISOString();
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content: 'Test todo',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function generateLargeDataset(count: number): Todo[] {
  // 대용량 테스트 데이터 생성
}
```

### 6.4 테스트 커버리지 목표

| 카테고리 | 목표 커버리지 |
|---------|-------------|
| Statements | ≥ 95% |
| Branches | ≥ 90% |
| Functions | 100% |
| Lines | ≥ 95% |

### 6.5 테스트 명명 규칙

```typescript
describe('SearchCommand', () => {
  describe('기본 검색', () => {
    it('should_find_todo_by_keyword', async () => {...})
    it('should_return_empty_array_when_no_match', async () => {...})
  })
  
  describe('에러 처리', () => {
    it('should_throw_error_on_empty_keyword', async () => {...})
    it('should_throw_error_on_invalid_regex', async () => {...})
  })
})
```

---

## 7. 성능 요구사항

### 7.1 응답 시간 목표

| 작업 | 데이터 크기 | 목표 시간 |
|------|-----------|----------|
| 검색 (일반) | 1,000개 | < 100ms |
| 검색 (정규식) | 1,000개 | < 150ms |
| 통계 계산 | 5,000개 | < 20ms |
| 통계 (verbose) | 5,000개 | < 50ms |

### 7.2 메모리 사용량

- **기본**: < 50MB (10,000개 항목)
- **최대**: < 100MB (50,000개 항목)

---

## 8. 확장성 고려사항

### 8.1 향후 기능 확장

1. **마감일/우선순위** (Cycle 3)
   - Todo 인터페이스 확장
   - 정렬/필터링 옵션 추가

2. **태그 시스템** (Cycle 3)
   - 다중 태그 지원
   - 태그별 검색/통계

3. **내보내기/가져오기** (Cycle 4)
   - CSV, Markdown 형식 지원
   - 백업/복원 기능

### 8.2 아키텍처 유연성

- **플러그인 구조**: 새 명령어 쉽게 추가 가능
- **저장소 추상화**: JSON → Database 전환 가능
- **포맷터 패턴**: 출력 형식 쉽게 확장

---

## 9. 보안 고려사항

### 9.1 입력 검증

```typescript
// 길이 제한
const MAX_KEYWORD_LENGTH = 1000;
const MAX_CONTENT_LENGTH = 1000;

// 정규식 복잡도 제한
const MAX_REGEX_LENGTH = 500;
```

### 9.2 파일 권한

```typescript
// 저장소 파일 권한 설정
fs.chmod(filePath, 0o600); // 소유자만 읽기/쓰기
```

### 9.3 인젝션 방지

- 정규식 검증으로 ReDoS 방지
- 파일 경로 검증으로 Path Traversal 방지

---

## 10. 의존성 관리

### 10.1 프로덕션 의존성

```json
{
  "dependencies": {
    "commander": "^11.1.0",  // CLI 프레임워크
    "uuid": "^9.0.1"         // UUID 생성
  }
}
```

### 10.2 개발 의존성

```json
{
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.11.0",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0"
  }
}
```

### 10.3 의존성 업데이트 정책

- **Security patches**: 즉시 적용
- **Minor versions**: 월 1회 검토
- **Major versions**: Cycle 단위로 검토

---

## 11. 배포 파이프라인

### 11.1 빌드 단계

```bash
# 1. 타입 체크
npm run typecheck

# 2. 린트
npm run lint

# 3. 테스트
npm test

# 4. 빌드
npm run build

# 5. 패키지 생성
npm pack
```

### 11.2 품질 게이트

- [ ] TypeScript strict mode 통과
- [ ] ESLint 에러 0개
- [ ] 테스트 100% 통과
- [ ] 커버리지 ≥ 90%
- [ ] 수동 테스트 시나리오 통과

---

## 12. 모니터링 및 로깅

### 12.1 로그 레벨

```typescript
enum LogLevel {
  ERROR = 'error',   // 시스템 에러
  WARN = 'warn',     // 사용자 경고
  INFO = 'info',     // 일반 정보
  DEBUG = 'debug'    // 디버깅 정보
}
```

### 12.2 로그 형식

```
[2026-03-19T10:30:45.123Z] [ERROR] [SearchCommand] Invalid regex: Unexpected token *
[2026-03-19T10:30:50.456Z] [INFO] [StatsCommand] Calculated stats for 1000 todos in 15ms
```

### 12.3 성능 메트릭

- 명령어 실행 시간
- 검색/통계 연산 시간
- 파일 I/O 시간
- 에러 발생 빈도

---

**작성일:** 2026-03-19  
**버전:** 1.0  
**다음 리뷰:** Cycle 3 시작 시
