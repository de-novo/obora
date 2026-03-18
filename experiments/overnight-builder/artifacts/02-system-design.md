# 02 - System Design: TaskVault Cycle 3

**작성일**: 2026-03-18  
**아키텍트**: Senior Architect  
**버전**: 0.2.0 (Cycle 3)  
**이전 버전**: 0.1.0 (Cycle 2 완료)

---

## 1. 아키텍처 개요

### 1.1 설계 원칙

| 원칙 | 설명 |
|------|------|
| **확장성** | 새로운 정렬/필터 기준 추가가 용이하도록 전략 패턴 적용 |
| **타입 안전성** | 모든 신규 기능에 strict TypeScript 타입 정의 |
| **하위 호환성** | 기존 데이터 100% 마이그레이션 보장 |
| **테스트 우선** | TDD 방식으로 인터페이스 기반 설계 |
| **단일 책임** | 각 모듈은 하나의 책임만 수행 |

### 1.2 레이어 구조 (확장)

```
┌─────────────────────────────────────────────────────────────┐
│ CLI Layer (index.ts)                                        │
│ - 인자 파싱 (dueDate, priority 옵션 추가)                    │
│ - 명령어 라우팅                                              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Command Layer (commands/*.ts)                               │
│ - AddCommand: --due, --priority 옵션 처리                   │
│ - ListCommand: --overdue, --due-soon, --priority, --sort    │
│ - EditCommand (NEW): --due, --priority 수정                 │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Service Layer (TaskService.ts)                              │
│ - 비즈니스 로직 (마감일 계산, 우선순위 검증)                  │
│ - 정렬 전략 관리                                             │
│ - 필터링 로직                                                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Utils Layer (utils/*.ts)                                    │
│ - date-validator.ts (NEW): 날짜 검증 및 계산                │
│ - priority-validator.ts (NEW): 우선순위 검증 및 변환        │
│ - task-sorter.ts (NEW): 정렬 전략                           │
│ - task-filter.ts (NEW): 필터링 전략                         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Storage Layer (JsonStorage.ts)                              │
│ - 데이터 마이그레이션 (v0.1.0 → v0.2.0)                      │
│ - 영속성 관리                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 데이터 모델 확장

### 2.1 Task 인터페이스 확장

```typescript
// src/types.ts

/**
 * 우선순위 타입
 * - 'high': 높음 (최우선)
 * - 'medium': 보통
 * - 'low': 낮음
 * - null: 우선순위 없음 (기본값)
 */
export type Priority = 'high' | 'medium' | 'low' | null;

/**
 * Task entity (확장 버전)
 */
export interface Task {
  /** Unique identifier (auto-incremented) */
  id: number;
  /** Task content (1-200 characters) */
  content: string;
  /** Creation timestamp in ISO 8601 format */
  createdAt: string;
  /** Completion timestamp in ISO 8601 format, null if not completed */
  completedAt: string | null;
  /** Convenience flag for completion status */
  isCompleted: boolean;
  /** Tags associated with the task (max 5) */
  tags: string[];
  /** Last update timestamp in ISO 8601 format */
  updatedAt: string;
  
  // NEW: Cycle 3 필드
  /** 
   * 마감일 (ISO 8601 Date: YYYY-MM-DD)
   * - null: 마감일 없음 (기본값)
   * - string: YYYY-MM-DD 형식
   */
  dueDate?: string | null;
  
  /**
   * 우선순위
   * - null: 우선순위 없음 (기본값)
   * - 'high': 높음
   * - 'medium': 보통
   * - 'low': 낮음
   */
  priority?: Priority;
}
```

### 2.2 Storage 버전 업데이트

```typescript
// src/types.ts

export interface TaskStorage {
  tasks: Task[];
  lastId: number;
  version: string;  // '0.2.0'으로 업데이트
}
```

### 2.3 마이그레이션 전략

```typescript
// src/storage/migrations.ts

/**
 * 버전별 마이그레이션 매핑
 */
const MIGRATIONS: Record<string, (data: unknown) => TaskStorage> = {
  '0.1.0': migrateFrom010To020,
  '0.2.0': (data) => data as TaskStorage, // 최신 버전
};

/**
 * 0.1.0 → 0.2.0 마이그레이션
 * - dueDate: null 추가
 * - priority: null 추가
 */
function migrateFrom010To020(data: unknown): TaskStorage {
  const oldStorage = data as OldTaskStorage;
  
  return {
    tasks: oldStorage.tasks.map(task => ({
      ...task,
      dueDate: null,
      priority: null,
    })),
    lastId: oldStorage.lastId,
    version: '0.2.0',
  };
}
```

---

## 3. 인터페이스 정의

### 3.1 Date Validator (utils/date-validator.ts)

```typescript
/**
 * 날짜 검증 결과
 */
export interface DateValidation {
  valid: boolean;
  error?: {
    code: 'DUE_001' | 'DUE_002' | 'DUE_003' | 'DUE_004';
    message: string;
  };
  normalizedDate?: string; // YYYY-MM-DD
}

/**
 * 날짜 검증 옵션
 */
export interface DateValidationOptions {
  allowPast?: boolean;      // 과거 날짜 허용 (기본값: false)
  maxFutureYears?: number;  // 최대 미래 연도 (기본값: 1)
}

/**
 * 날짜 검증 함수
 * @param input 사용자 입력 날짜 문자열
 * @param options 검증 옵션
 * @returns 검증 결과
 */
export function validateDueDate(
  input: string,
  options?: DateValidationOptions
): DateValidation;

/**
 * 날짜 계산 유틸리티
 */
export function calculateDaysRemaining(dueDate: string): number;

export function isOverdue(dueDate: string): boolean;

export function isDueSoon(dueDate: string, days?: number): boolean;

export function formatDateForDisplay(dueDate: string): string;
```

### 3.2 Priority Validator (utils/priority-validator.ts)

```typescript
/**
 * 우선순위 검증 결과
 */
export interface PriorityValidation {
  valid: boolean;
  error?: {
    code: 'PRIORITY_001' | 'PRIORITY_002';
    message: string;
  };
  normalizedPriority?: Priority;
}

/**
 * 우선순위 검증 함수
 * @param input 사용자 입력 (high, h, 1, medium, m, 2, low, l, 3)
 * @returns 검증 결과
 */
export function validatePriority(input: string): PriorityValidation;

/**
 * 우선순위 변환 매핑
 */
export const PRIORITY_ALIASES: Record<string, Priority> = {
  'high': 'high', 'h': 'high', '1': 'high',
  'medium': 'medium', 'm': 'medium', '2': 'medium',
  'low': 'low', 'l': 'low', '3': 'low',
};

/**
 * 우선순위 순서 (정렬용)
 */
export const PRIORITY_ORDER: Record<Priority, number> = {
  'high': 1,
  'medium': 2,
  'low': 3,
  null: 4,
};

/**
 * 우선순위 표시 정보
 */
export function getPriorityDisplay(priority: Priority): {
  emoji: string;
  label: string;
  koreanLabel: string;
};
```

### 3.3 Task Sorter (utils/task-sorter.ts)

```typescript
/**
 * 정렬 기준
 */
export type SortCriteria = 'due' | 'priority' | 'created' | 'updated';

/**
 * 정렬 옵션
 */
export interface SortOptions {
  criteria: SortCriteria;
  ascending?: boolean;  // 기본값: false (due, priority는 오름차순)
}

/**
 * 태스크 정렬 함수
 * @param tasks 정렬할 태스크 배열
 * @param options 정렬 옵션
 * @returns 정렬된 태스크 배열
 */
export function sortTasks(tasks: Task[], options: SortOptions): Task[];

/**
 * 복합 정렬 (1차: due, 2차: priority)
 */
export function sortTasksByMultiple(
  tasks: Task[],
  criteria: SortCriteria[]
): Task[];
```

### 3.4 Task Filter (utils/task-filter.ts)

```typescript
/**
 * 필터 옵션 (확장)
 */
export interface TaskFilterOptions {
  includeCompleted?: boolean;
  tag?: string;
  
  // NEW: Cycle 3 필터
  overdue?: boolean;        // 기한 초과만
  dueSoon?: boolean;        // 7일 내 마감만
  dueSoonDays?: number;     // due-soon 기준일 (기본값: 7)
  priority?: Priority;      // 특정 우선순위만
}

/**
 * 태스크 필터링 함수
 * @param tasks 필터링할 태스크 배열
 * @param options 필터 옵션
 * @returns 필터링된 태스크 배열
 */
export function filterTasks(tasks: Task[], options: TaskFilterOptions): Task[];
```

### 3.5 Command Input Types (types.ts)

```typescript
/**
 * Add command input (확장)
 */
export interface AddCommandInput {
  content: string;
  tags?: string;
  dueDate?: string;    // NEW
  priority?: string;   // NEW
}

/**
 * Edit command input (NEW)
 */
export interface EditCommandInput {
  id: number;
  dueDate?: string;
  priority?: string;
  content?: string;
  tags?: string;
}

/**
 * List command input (확장)
 */
export interface ListCommandInput {
  showAll: boolean;
  tag?: string;
  
  // NEW: Cycle 3 필터/정렬
  overdue?: boolean;
  dueSoon?: boolean;
  priority?: string;
  sort?: SortCriteria;
}
```

---

## 4. 에러 핸들링 전략

### 4.1 신규 에러 코드

```typescript
// src/errors.ts

export enum ErrorCode {
  // ... 기존 코드 ...
  
  // Due Date Errors (DUE_XXX)
  INVALID_DUE_DATE_FORMAT = 'DUE_001',
  INVALID_DATE_VALUE = 'DUE_002',
  DUE_DATE_TOO_FAR = 'DUE_003',
  DUE_DATE_IN_PAST = 'DUE_004',
  
  // Priority Errors (PRIORITY_XXX)
  INVALID_PRIORITY_VALUE = 'PRIORITY_001',
  PRIORITY_VALUE_TOO_LONG = 'PRIORITY_002',
}
```

### 4.2 에러 팩토리 함수

```typescript
// src/errors.ts

export const Errors = {
  // ... 기존 함수 ...
  
  // Due Date Errors
  invalidDueDateFormat(input: string): ValidationError {
    return new ValidationError(
      `마감일 형식이 올바르지 않습니다: "${input}". YYYY-MM-DD 형식으로 입력해주세요. 예: --due 2026-03-25`,
      ErrorCode.INVALID_DUE_DATE_FORMAT
    );
  },
  
  invalidDateValue(date: string, reason: string): ValidationError {
    return new ValidationError(
      `유효하지 않은 날짜입니다: "${date}". ${reason}`,
      ErrorCode.INVALID_DATE_VALUE
    );
  },
  
  dueDateTooFar(date: string, maxYears: number): ValidationError {
    return new ValidationError(
      `마감일은 ${maxYears}년 이내로 설정해주세요. (입력: ${date})`,
      ErrorCode.DUE_DATE_TOO_FAR
    );
  },
  
  dueDateInPast(date: string): ValidationError {
    return new ValidationError(
      `이미 지난 날짜는 마감일로 설정할 수 없습니다: ${date}. 오늘 이후의 날짜를 입력해주세요.`,
      ErrorCode.DUE_DATE_IN_PAST
    );
  },
  
  // Priority Errors
  invalidPriorityValue(input: string): ValidationError {
    return new ValidationError(
      `유효하지 않은 우선순위입니다: "${input}". high, medium, low 중 하나를 입력해주세요.`,
      ErrorCode.INVALID_PRIORITY_VALUE
    );
  },
  
  priorityValueTooLong(input: string): ValidationError {
    return new ValidationError(
      `우선순위 값이 너무 깁니다. h, m, l 또는 high, medium, low를 사용해주세요.`,
      ErrorCode.PRIORITY_VALUE_TOO_LONG
    );
  },
};
```

### 4.3 에러 복구 가이드

| 에러 코드 | 사용자 메시지 | 복구 가이드 |
|-----------|---------------|-------------|
| DUE_001 | 마감일 형식이 올바르지 않습니다. | YYYY-MM-DD 형식으로 입력해주세요. 예: --due 2026-03-25 |
| DUE_002 | 유효하지 않은 날짜입니다. | 실제 존재하는 날짜를 입력해주세요. (예: 2월 30일 → 존재하지 않음) |
| DUE_003 | 마감일은 1년 이내로 설정해주세요. | 너무 먼 미래의 날짜는 설정할 수 없습니다. |
| DUE_004 | 이미 지난 날짜는 마감일로 설정할 수 없습니다. | 오늘 이후의 날짜를 입력해주세요. |
| PRIORITY_001 | 유효하지 않은 우선순위입니다. | high, medium, low 중 하나를 입력해주세요. |
| PRIORITY_002 | 우선순위 값이 너무 깁니다. | h, m, l 또는 high, medium, low를 사용해주세요. |

---

## 5. 모듈 설계

### 5.1 date-validator.ts

**책임**: 날짜 형식 검증, 날짜 계산

**공개 API**:
- `validateDueDate(input, options)`: 날짜 검증
- `calculateDaysRemaining(dueDate)`: 남은 일수 계산
- `isOverdue(dueDate)`: 기한 초과 여부
- `isDueSoon(dueDate, days)`: 마감 임박 여부
- `formatDateForDisplay(dueDate)`: 표시용 포맷팅

**구현 세부사항**:
```typescript
// 정규식 기반 형식 검증
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Date 객체 생성 후 유효성 검증
// 윤년, 월별 일수 등 자동 검증

// 타임존 처리: 로컬 타임존 기준
```

### 5.2 priority-validator.ts

**책임**: 우선순위 검증, 변환, 표시

**공개 API**:
- `validatePriority(input)`: 우선순위 검증
- `normalizePriority(input)`: 우선순위 정규화
- `getPriorityDisplay(priority)`: 표시 정보 반환

**구현 세부사항**:
```typescript
// 대소문자 무시, trim 처리
// 축약형 변환 (h → high, m → medium, l → low)
// 숫자 변환 (1 → high, 2 → medium, 3 → low)
```

### 5.3 task-sorter.ts

**책임**: 태스크 정렬 전략

**공개 API**:
- `sortTasks(tasks, options)`: 단일 기준 정렬
- `sortTasksByMultiple(tasks, criteria)`: 복합 정렬

**정렬 우선순위**:
1. **due**: 마감일 없음 → 마감일 오름차순
2. **priority**: null → low → medium → high (내림차순)
3. **created**: 최신순 (내림차순)
4. **updated**: 최신순 (내림차순)

**복합 정렬 예시**:
```
1차: due (오름차순) → 2차: priority (내림차순)
결과: 마감일 빠른 순, 같은 마감일이면 높은 우선순위 순
```

### 5.4 task-filter.ts

**책임**: 태스크 필터링

**공개 API**:
- `filterTasks(tasks, options)`: 다중 조건 필터링

**필터 조건**:
- `overdue`: dueDate < 오늘 && !isCompleted
- `dueSoon`: dueDate <= 오늘 + N일
- `priority`: priority === 지정값
- `tag`: tags.includes(지정값)
- `includeCompleted`: isCompleted 포함 여부

### 5.5 TaskService 확장

**신규 메서드**:
```typescript
class TaskService {
  // 기존 메서드 ...
  
  // NEW: Edit 기능
  async editTask(id: number, updates: EditTaskOptions): Promise<Result<Task, TaskVaultError>>;
  
  // NEW: 정렬/필터링 지원
  async listTasksWithFilter(options: ListCommandInput): Promise<Result<Task[], TaskVaultError>>;
}
```

### 5.6 Command Handlers 확장

#### AddCommand (수정)
```typescript
class AddCommand {
  async execute(input: AddCommandInput): Promise<CommandResult> {
    // 1. content 검증 (기존)
    // 2. tags 파싱 (기존)
    // 3. dueDate 검증 (NEW)
    // 4. priority 검증 (NEW)
    // 5. taskService.addTask 호출
  }
}
```

#### EditCommand (신규)
```typescript
class EditCommand {
  async execute(input: EditCommandInput): Promise<CommandResult> {
    // 1. id 검증
    // 2. dueDate 검증 (있는 경우)
    // 3. priority 검증 (있는 경우)
    // 4. taskService.editTask 호출
  }
}
```

#### ListCommand (수정)
```typescript
class ListCommand {
  async execute(input: ListCommandInput): Promise<CommandResult> {
    // 1. 필터링 (overdue, dueSoon, priority, tag)
    // 2. 정렬 (due, priority, created, updated)
    // 3. 포맷팅 (이모지, 남은 일수, 기한 초과 표시)
  }
}
```

---

## 6. 테스트 전략

### 6.1 테스트 레이어 구조

```
test/
├── unit/
│   ├── date-validator.test.ts      (NEW)
│   ├── priority-validator.test.ts  (NEW)
│   ├── task-sorter.test.ts         (NEW)
│   ├── task-filter.test.ts         (NEW)
│   └── task-service.test.ts        (확장)
├── integration/
│   ├── add-with-due-priority.test.ts  (NEW)
│   ├── edit-command.test.ts           (NEW)
│   ├── list-filter-sort.test.ts       (NEW)
│   └── migration-0.1-to-0.2.test.ts   (NEW)
├── edge-cases/
│   ├── date-edge-cases.test.ts     (NEW)
│   ├── priority-edge-cases.test.ts (NEW)
│   ├── sort-edge-cases.test.ts     (NEW)
│   └── filter-edge-cases.test.ts   (NEW)
└── fixtures/
    ├── tasks-with-due.ts           (NEW)
    └── tasks-with-priority.ts      (NEW)
```

### 6.2 단위 테스트 (Unit Tests)

#### date-validator.test.ts (25+ 케이스)

**정상 케이스**:
- ✅ 유효한 날짜 형식 (YYYY-MM-DD)
- ✅ 오늘 날짜
- ✅ 윤년 2월 29일 (2024-02-29)
- ✅ 연말 연초 (2026-12-31, 2027-01-01)
- ✅ 364일 후 날짜

**에러 케이스**:
- ❌ 빈 문자열 → DUE_001
- ❌ 공백만 → DUE_001
- ❌ 잘못된 형식 (2026/03/25) → DUE_001
- ❌ 존재하지 않는 날짜 (2026-02-30) → DUE_002
- ❌ 2월 29일 (비윤년, 2025-02-29) → DUE_002
- ❌ 13월 (2026-13-01) → DUE_002
- ❌ 0월 (2026-00-01) → DUE_002
- ❌ 32일 (2026-01-32) → DUE_002
- ❌ 과거 날짜 (2020-01-01) → DUE_004
- ❌ 1년+ 미래 (2030-01-01) → DUE_003

**엣지 케이스**:
- 🔄 타임존 경계 (23:59 vs 00:00)
- 🔄 말일 계산 (1/31, 2/28, 3/31)
- 🔄 윤년 경계 (2/28 → 2/29)
- 🔄 9999-12-31 (극단적 미래)
- 🔄 0001-01-01 (극단적 과거)

**유틸리티 함수**:
- ✅ calculateDaysRemaining (양수, 0, 음수)
- ✅ isOverdue (true/false)
- ✅ isDueSoon (7일 기준)
- ✅ formatDateForDisplay (한국어)

#### priority-validator.test.ts (20+ 케이스)

**정상 케이스**:
- ✅ 'high' → 'high'
- ✅ 'HIGH' → 'high' (대소문자 무시)
- ✅ 'h' → 'high' (축약형)
- ✅ '1' → 'high' (숫자)
- ✅ 'medium' → 'medium'
- ✅ 'm' → 'medium'
- ✅ '2' → 'medium'
- ✅ 'low' → 'low'
- ✅ 'l' → 'low'
- ✅ '3' → 'low'

**에러 케이스**:
- ❌ 빈 문자열 → PRIORITY_001
- ❌ 'urgent' → PRIORITY_001
- ❌ 'critical' → PRIORITY_001
- ❌ '4' → PRIORITY_001
- ❌ '0' → PRIORITY_001
- ❌ 20자 초과 → PRIORITY_002

**엣지 케이스**:
- 🔄 ' high ' (공백 trim)
- 🔄 'HIGH' (대문자)
- 🔄 'HiGh' (혼합)
- 🔄 null/undefined → 기본값 null

#### task-sorter.test.ts (15+ 케이스)

**정상 케이스**:
- ✅ due 기준 정렬 (오름차순)
- ✅ priority 기준 정렬 (내림차순)
- ✅ created 기준 정렬 (내림차순)
- ✅ updated 기준 정렬 (내림차순)

**엣지 케이스**:
- 🔄 마감일 없는 태스크는 하단
- 🔄 우선순위 없는 태스크는 하단
- 🔄 복합 정렬 (due + priority)
- 🔄 모든 태스크가 같은 마감일
- 🔄 모든 태스크가 마감일 없음
- 🔄 빈 배열

#### task-filter.test.ts (20+ 케이스)

**정상 케이스**:
- ✅ overdue 필터 (기한 초과만)
- ✅ dueSoon 필터 (7일 내만)
- ✅ priority 필터 (high만)
- ✅ tag 필터 (기존)
- ✅ 복합 필터 (overdue + high)

**엣지 케이스**:
- 🔄 완료된 태스크는 overdue에서 제외
- 🔄 마감일 없는 태스크는 overdue/dueSoon에서 제외
- 🔄 빈 결과
- 🔄 모든 태스크가 조건에 매칭
- 🔄 dueSoonDays 커스텀 (3일, 14일)

### 6.3 통합 테스트 (Integration Tests)

#### add-with-due-priority.test.ts (10+ 케이스)

- ✅ add --due 정상 동작
- ✅ add --priority 정상 동작
- ✅ add --due --priority 동시 설정
- ✅ add --due 과거 날짜 에러
- ✅ add --priority 잘못된 값 에러

#### edit-command.test.ts (10+ 케이스)

- ✅ edit --due 마감일 수정
- ✅ edit --priority 우선순위 수정
- ✅ edit --due --priority 동시 수정
- ✅ edit 존재하지 않는 ID 에러
- ✅ edit 마감일 제거 (null로 설정)

#### list-filter-sort.test.ts (15+ 케이스)

- ✅ list --overdue 기한 초과 표시
- ✅ list --due-soon 7일 내 마감 표시
- ✅ list --priority high 높은 우선순위만
- ✅ list --sort due 마감일 정렬
- ✅ list --sort priority 우선순위 정렬
- ✅ list --overdue --sort priority 복합

#### migration-0.1-to-0.2.test.ts (5+ 케이스)

- ✅ 0.1.0 데이터 자동 마이그레이션
- ✅ dueDate: null 자동 추가
- ✅ priority: null 자동 추가
- ✅ 버전 필드 0.2.0으로 업데이트
- ✅ 손상된 데이터 처리

### 6.4 엣지 케이스 테스트 (Edge Cases)

#### date-edge-cases.test.ts (15+ 케이스)

- 🔄 2월 28일 vs 2월 29일 (윤년)
- 🔄 12월 31일 23:59 → 1월 1일 00:00
- 🔄 말일 계산 (1/31, 4/30, 2/28)
- 🔄 365일 후, 366일 후 (윤년)
- 🔄 타임존 경계 케이스

#### priority-edge-cases.test.ts (10+ 케이스)

- 🔄 대소문자 혼합 (HIGH, high, High)
- 🔄 공백 포함 (' high ', 'medium ')
- 🔄 축약형과 전체 혼용
- 🔄 null → undefined → null 변환

### 6.5 테스트 커버리지 목표

| 모듈 | 목표 커버리지 | 현재 예상 |
|------|---------------|-----------|
| date-validator.ts | 95%+ | 신규 |
| priority-validator.ts | 95%+ | 신규 |
| task-sorter.ts | 90%+ | 신규 |
| task-filter.ts | 90%+ | 신규 |
| TaskService (확장) | 85%+ | 기존 85% |
| **전체** | **85%+** | **기존 85% 유지** |

### 6.6 테스트 데이터 (Fixtures)

```typescript
// test/fixtures/tasks-with-due.ts
export const tasksWithDueDates: Task[] = [
  { id: 1, content: '과거 태스크', dueDate: '2020-01-01', ... },
  { id: 2, content: '오늘 태스크', dueDate: '2026-03-18', ... },
  { id: 3, content: '내일 태스크', dueDate: '2026-03-19', ... },
  { id: 4, content: '7일 내 태스크', dueDate: '2026-03-25', ... },
  { id: 5, content: '미래 태스크', dueDate: '2026-12-31', ... },
  { id: 6, content: '마감일 없음', dueDate: null, ... },
];

// test/fixtures/tasks-with-priority.ts
export const tasksWithPriorities: Task[] = [
  { id: 1, content: '긴급', priority: 'high', ... },
  { id: 2, content: '보통', priority: 'medium', ... },
  { id: 3, content: '낮음', priority: 'low', ... },
  { id: 4, content: '우선순위 없음', priority: null, ... },
];
```

---

## 7. 성능 고려사항

### 7.1 성능 목표

| 작업 | 목표 시간 | 측정 조건 |
|------|-----------|-----------|
| add --due --priority | < 50ms | 1000회 평균 |
| list --sort due | < 100ms | 1000 태스크 |
| list --overdue | < 50ms | 1000 태스크 |
| 마이그레이션 | < 200ms | 1000 태스크 |

### 7.2 최적화 전략

1. **정렬 캐싱**: 동일한 정렬 조건 재사용 시 캐시 활용
2. **지연 계산**: 필터링 → 정렬 순서로 불필요한 계산 방지
3. **인덱싱**: (향후) dueDate, priority 인덱스 고려

---

## 8. 구현 로드맵

### 8.1 Phase 1: 유틸리티 구현

1. `date-validator.ts` 구현 + 테스트
2. `priority-validator.ts` 구현 + 테스트
3. `task-sorter.ts` 구현 + 테스트
4. `task-filter.ts` 구현 + 테스트

### 8.2 Phase 2: 데이터 모델 확장

1. `types.ts` 확장 (dueDate, priority)
2. 마이그레이션 로직 구현
3. `TaskStorage` 버전 업데이트

### 8.3 Phase 3: 서비스 레이어 확장

1. `TaskService` 확장 (editTask, listTasksWithFilter)
2. 통합 테스트 작성

### 8.4 Phase 4: 커맨드 레이어 확장

1. `AddCommand` 확장
2. `EditCommand` 구현
3. `ListCommand` 확장
4. CLI 인자 파싱 업데이트

### 8.5 Phase 5: 통합 및 검증

1. 전체 회귀 테스트
2. 성능 벤치마크
3. 문서화 업데이트

---

## 9. 리스크 및 완화

| 리스크 | 확률 | 영향 | 완화 전략 |
|--------|------|------|-----------|
| 날짜 계산 버그 (윤년, 타임존) | 중간 | 높음 | 라이브러리 검토 + 엣지 케이스 테스트 30+ |
| 마이그레이션 실패 | 낮음 | 높음 | 자동 백업 + 롤백 메커니즘 |
| 정렬 로직 복잡도 증가 | 낮음 | 중간 | 명확한 우선순위 정의 + 복합 정렬 테스트 |
| 기존 기능 영향 | 낮음 | 높음 | 회귀 테스트 100% 통과 조건 |

---

## 10. 다음 단계

1. ✅ **시스템 설계 완료** (본 문서)
2. 🔄 **테스트 작성** (TDD)
3. ⏳ **구현** (다음 step)
4. ⏳ **리뷰 및 릴리스**

---

**작성 완료**: 2026-03-18  
**다음 단계**: 테스트 작성  
**예상 소요**: 1 Step
