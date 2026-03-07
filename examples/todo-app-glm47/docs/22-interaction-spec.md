# TODO 앱 인터랙션 스펙

**작성일**: 2026-03-03  
**버전**: 1.1  
**도메인**: TODO APP  
**참조**: docs/20-ux-strategy.md, docs/21-ui-wireframe.md

---

## 1. 인터랙션 스펙 개요 (Interaction Spec Overview)

### 1.1 목적 (Purpose)

| 항목 | 내용 |
|------|------|
| **목표** | UI 와이어프레임의 상태 전이와 인터랙션을 상세 규정 |
| **대상** | 개발자, QA, 테스터 |
| **범위** | 모든 컴포넌트의 상태 전환, 로딩/에러/빈 상태, 키보드 흐름, 접근성 요구사항 |

### 1.2 컴포넌트 범위 (Component Scope)

| 컴포넌트 | 상태 수 | 인터랙션 수 |
|----------|---------|------------|
| TodoApp | 3 | 1 (초기화) |
| AddTodo | 5 | 3 (입력/추가/에러) |
| TodoList | 3 | 2 (렌더링/빈상태) |
| TodoItem | 4 | 3 (토글/삭제/hover) |
| FilterBar | 3 | 3 (필터 전환) |
| DeleteConfirmDialog | 2 | 3 (열기/확인/취소) (A11Y-P1-006 추가) |

---

## 2. 상태 전환 정의 (State Transitions)

### 2.1 TodoApp 상태 전환 (TodoApp State Transition)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          TodoApp 상태 전환                          │
└─────────────────────────────────────────────────────────────────────┘

    [초기화]
         │
         ├─► loading = true
         │   └─▶ 스피너 표시
         │
         ▼
    [로드 완료]
         │
         ├─► todos.length === 0
         │   └─▶ Empty State 표시
         │
         └─► todos.length > 0
             └─▶ TodoList 렌더링

    [storage 이벤트 수신]
         │
         └─▶ todos 상태 갱신 → UI 재렌더링
```

| 현재 상태 | 트리거 | 다음 상태 | 액션 |
|----------|--------|-----------|------|
| Init | `DOMContentLoaded` | Loading | 스피너 표시 |
| Loading | localStorage 로드 완료 | Loaded | todos 렌더링 |
| Loaded | `storage` 이벤트 | Loaded | todos 재렌더링 |
| Any | `unhandledrejection` | Error | 에러 토스트 표시 |

---

### 2.2 AddTodo 상태 전환 (AddTodo State Transition)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AddTodo 상태 전환                           │
└─────────────────────────────────────────────────────────────────────┘

    [Initial] (입력 필드 포커스, visible label 표시)
         │
         ├─► onInput(text) → [Typing]
         │                     │
         │                     ├─► text.length === 0 → [Initial]
         │                     │
         │                     ├─► 0 < text.length ≤ 200 → [Valid]
         │                     │
         │                     └─► text.length > 200 → [Invalid]
         │
         ├─► onSubmit(text.length === 0) → [Error: Empty]
         │
         └─► onSubmit(valid) → [Submitting]
                                   │
                                   ├─► 저장 성공 → [Initial] + 목록 갱신
                                   │
                                   └─► 저장 실패 → [Error: Storage]
```

| 현재 상태 | 트리거 | 조건 | 다음 상태 | UI 변경 |
|----------|--------|------|-----------|----------|
| Initial | `onFocus` | - | Focus | 파란 테두리 |
| Initial | `onInput(text)` | `text.length > 0` | Typing | 텍스트 표시 |
| Typing | `onInput(text)` | `text.length === 0` | Initial | placeholder 표시 |
| Typing | `onInput(text)` | `text.length > 200` | Invalid | 빨간 테두리 + 에러 메시지 |
| Invalid | `onInput(text)` | `text.length ≤ 200` | Valid | 정상 테두리 |
| Valid | `onSubmit` | 유효 텍스트 | Submitting | 버튼 비활성화 |
| Initial | `onSubmit` | `text.length === 0` | Error: Empty | "Task text is required" |
| Submitting | 저장 성공 | - | Initial | 입력 필드 초기화 |
| Submitting | 저장 실패 | - | Error: Storage | "Failed to save changes" 토스트 |

---

### 2.3 TodoList 상태 전환 (TodoList State Transition)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TodoList 상태 전환                           │
└─────────────────────────────────────────────────────────────────────┘

    [Loading] (초기 로드 중)
         │
         └─► todos.length === 0 → [Empty]
         │
         └─► todos.length > 0 → [List]

    [List] (태스크 목록 표시)
         │
         ├─► filter 변경 → [List] (필터링된 항목 재렌더링)
         │                    │
         │                    ├─► filteredTodos.length === 0 → [Empty: Filter] + 포커스 FilterBar로 유지 (A11Y-P1-007)
         │                    │
         │                    └─► filteredTodos.length > 0 → [List]
         │
         ├─► item 추가 → [List] (새 항목 추가)
         │
         ├─► item 삭제 → [List] (항목 제거)
         │
         └─► filteredTodos.length === 0 → [Empty: Filter]

    [Empty] (태스크 없음)
         │
         └─► item 추가 → [List]

    [Empty: Filter] (필터 결과 없음)
         │
         │   포커스: FilterBar에 유지 (A11Y-P1-007)
         │
         └─► filter 변경 → [List] 또는 [Empty]
```

| 현재 상태 | 트리거 | 조건 | 다음 상태 | UI 변경 |
|----------|--------|------|-----------|----------|
| Loading | 로드 완료 | `todos.length === 0` | Empty | 빈 상태 메시지 |
| Loading | 로드 완료 | `todos.length > 0` | List | 목록 렌더링 |
| List | `filter` 변경 | `filteredTodos.length === 0` | Empty: Filter | 필터 빈 상태 메시지 + **포커스 FilterBar 유지** (A11Y-P1-007) |
| List | `filter` 변경 | `filteredTodos.length > 0` | List | 필터링된 목록 |
| List | `todo:added` | - | List | 새 항목 추가 (맨 위) |
| List | `todo:deleted` | `filteredTodos.length === 0` | Empty: Filter | 항목 제거 + 빈 상태 + **포커스 FilterBar로 유지** |
| Empty: Filter | `filter` 변경 | - | List/Empty | 필터 전환 |
| Empty | `todo:added` | - | List | 첫 항목 추가 |

---

### 2.4 TodoItem 상태 전환 (TodoItem State Transition)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TodoItem 상태 전환                            │
└─────────────────────────────────────────────────────────────────────┘

    [Active] (미완료 상태)
         │
         ├─► onMouseEnter → [Hover]
         │                     │
         │                     └─► onMouseLeave → [Active]
         │
         ├─► onSpace(toggle) → [Completed] (A11Y-P2-003: Space만)
         │
         └─► onClick/Space(delete) → [DeleteConfirmDialog] (A11Y-P1-006)

    [Hover] (호버 상태)
         │
         ├─► onSpace(toggle) → [Completed]
         │
         └─► onClick/Space(delete) → [DeleteConfirmDialog]

    [Completed] (완료 상태)
         │
         ├─► onMouseEnter → [Hover: Completed]
         │                     │
         │                     └─► onMouseLeave → [Completed]
         │
         ├─► onSpace(toggle) → [Active]
         │
         └─► onClick/Space(delete) → [DeleteConfirmDialog]

    [Deleting] (삭제 중, 200ms 애니메이션)
         │
         └─► 애니메이션 완료 → [Removed] (DOM 제거)
```

| 현재 상태 | 트리거 | 다음 상태 | UI 변경 |
|----------|--------|-----------|----------|
| Active | `onMouseEnter` | Hover | 삭제 버튼 표시, 배경 #F5F5F5 |
| Hover | `onMouseLeave` | Active | 삭제 버튼 숨김 |
| Active | `onSpace(toggle)` | Completed | 체크 표시, 취소선, 텍스트 회색 |
| Completed | `onSpace(toggle)` | Active | 빈 박스, 텍스트 검정 |
| Any | `onClick/Space(delete)` | DeleteConfirmDialog | 모달 표시 (A11Y-P1-006) |
| Any (modal confirmed) | `onClick(delete)` | Deleting | fade-out 애니메이션 (200ms) |
| Deleting | 애니메이션 완료 | Removed | DOM 제거, 포커스 이동 |

---

### 2.5 DeleteConfirmDialog 상태 전환 (DeleteConfirmDialog State Transition)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   DeleteConfirmDialog 상태 전환                      │
└─────────────────────────────────────────────────────────────────────┘

    [Closed]
         │
         ├─► onClick(delete button) → [Open]
         │                         │
         │                         ├─► 포커스: Delete 버튼으로 이동
         │                         ├─► 포커스 트랩 활성화 (A11Y-P1-008)
         │                         └─► backdrop 표시
         │
         └─► [Escape] 또는 onClick(cancel) → [Closed]
                                   │
                                   └─► 포커스: 삭제 버튼으로 복귀

    [Open]
         │
         ├─► onClick(cancel) → [Closed]
         │                       │
         │                       └─► 포커스: 삭제 버튼으로 복귀
         │
         ├─► [Escape] → [Closed]
         │                  │
         │                  └─► 포커스: 삭제 버튼으로 복귀
         │
         └─► onClick(delete) → [Deleting] (TodoItem)
                               │
                               └─► aria-live로 "Task deleted" 알림 (A11Y-P2-008)
```

| 현재 상태 | 트리거 | 다음 상태 | UI 변경 |
|----------|--------|-----------|----------|
| Closed | `onClick(delete button)` | Open | 모달 표시, **포커스 Delete 버튼으로 이동**, **포커스 트랩 활성화** (A11Y-P1-008) |
| Open | `onClick(cancel)` | Closed | 모달 닫기, **포커스 삭제 버튼으로 복귀** |
| Open | `Escape` | Closed | 모달 닫기, **포커스 삭제 버튼으로 복귀** |
| Open | `onClick(delete)` | Deleting | 모달 닫기, TodoItem 삭제 시작, **aria-live로 "Task deleted" 알림** (A11Y-P2-008) |

**포커스 트랩 명세 (A11Y-P1-008):**
- 모달 열린 시 포커스를 모달 내부로 제한
- Tab/Shift+Tab: Cancel ↔ Delete 버튼 간 순환
- Escape: 모달 닫기, 포커스 복귀
- backdrop 클릭: 모달 닫기, 포커스 복귀

---

### 2.6 FilterBar 상태 전환 (FilterBar State Transition)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FilterBar 상태 전환                           │
└─────────────────────────────────────────────────────────────────────┘

    [All: Active]
         │
         ├─► onSpace(Active) → [Active: Active] (A11Y-P2-003: Space만)
         │
         └─► onSpace(Completed) → [Completed: Active]

    [Active: Active]
         │
         ├─► onSpace(All) → [All: Active]
         │
         └─► onSpace(Completed) → [Completed: Active]

    [Completed: Active]
         │
         ├─► onSpace(All) → [All: Active]
         │
         └─► onSpace(Active) → [Active: Active]
```

| 현재 상태 | 트리거 | 다음 상태 | UI 변경 |
|----------|--------|-----------|----------|
| All: Active | `onSpace(Active)` | Active: Active | All 비활성화, Active 활성화, 포커스 유지 |
| All: Active | `onSpace(Completed)` | Completed: Active | All 비활성화, Completed 활성화, 포커스 유지 |
| Active: Active | `onSpace(All)` | All: Active | Active 비활성화, All 활성화, 포커스 유지 |
| Active: Active | `onSpace(Completed)` | Completed: Active | Active 비활성화, Completed 활성화, 포커스 유지 |
| Completed: Active | `onSpace(All)` | All: Active | Completed 비활성화, All 활성화, 포커스 유지 |
| Completed: Active | `onSpace(Active)` | Active: Active | Completed 비활성화, Active 활성화, 포커스 유지 |

---

## 3. 로딩 상태 (Loading States)

### 3.1 초기 로딩 (Initial Load)

| 속성 | 값 |
|------|-----|
| **트리거** | `DOMContentLoaded` |
| **표시 조건** | localStorage 읽기 시간 ≥ 50ms |
| **최대 표시 시간** | 2,000ms |
| **UI 요소** | 스피너 아이콘, "Loading tasks..." 텍스트 |
| **ARIA** | `role="status"`, `aria-live="polite"` |
| **위치** | TodoList 영역 중앙 |

```html
<div class="loading-state" role="status" aria-live="polite">
  <div class="spinner"></div>
  <span>Loading tasks...</span>
</div>
```

### 3.2 추가 로딩 (Add Task Loading)

| 속성 | 값 |
|------|-----|
| **트리거** | `onSubmit` 후 저장 시작 |
| **표시 조건** | 저장 요청 중 |
| **최대 표시 시간** | 500ms |
| **UI 요소** | Add 버튼 스피너 |
| **ARIA** | `aria-busy="true"` |
| **버튼 상태** | 비활성화, 텍스트 "Adding..." |

```html
<button class="add-todo__button" disabled aria-busy="true">
  <span class="spinner--small"></span>
  Adding...
</button>
```

---

## 4. 에러 상태 (Error States)

### 4.1 Empty Input Error (빈 입력 에러)

| 속성 | 값 |
|------|-----|
| **트리거** | 빈 텍스트로 `onSubmit` |
| **표시 위치** | 입력 필드 바로 아래 |
| **메시지** | "Task text is required" |
| **색상** | #991B1B (빨간, WCAG AA 준수) (A11Y-P1-001) |
| **ARIA** | `role="alert"`, `aria-live="assertive"` |
| **해제 조건** | 유효 텍스트 입력 시 |

```html
<div class="add-todo__error" role="alert" aria-live="assertive">
  ⚠️ Task text is required
</div>
```

### 4.2 Length Limit Error (길이 초과 에러)

| 속성 | 값 |
|------|-----|
| **트리거** | `text.length > 200` |
| **표시 위치** | 입력 필드 바로 아래 |
| **메시지** | "Maximum 200 characters. Delete some characters." (A11Y-P2-012) |
| **카운터** | "X/200" 실시간 표시 |
| **색상** | #991B1B (빨간) |
| **ARIA** | `role="alert"`, `aria-live="assertive"` |
| **해제 조건** | `text.length ≤ 200` |

```html
<div class="add-todo__error" role="alert" aria-live="assertive">
  ⚠️ Maximum 200 characters. Delete some characters.
  <span class="add-todo__counter">213/200</span>
</div>
```

### 4.3 Storage Error (저장 실패 에러)

| 속성 | 값 |
|------|-----|
| **트리거** | `localStorage.setItem` 실패 (quota exceeded) |
| **표시 위치** | 화면 하단 Toast |
| **메시지** | "Failed to save changes. Storage quota exceeded." |
| **버튼** | "Retry", "Close" |
| **색상** | #991B1B (빨간) |
| **ARIA** | `role="alert"`, `aria-live="assertive"` |
| **자동 닫기** | 5,000ms |

```html
<div class="toast toast--error" role="alert" aria-live="assertive">
  <span>⚠️ Failed to save changes. Storage quota exceeded.</span>
  <button class="toast__retry">Retry</button>
  <button class="toast__close" aria-label="Close">×</button>
</div>
```

---

## 5. 빈 상태 (Empty States)

### 5.1 No Tasks (태스크 없음)

| 속성 | 값 |
|------|-----|
| **조건** | `todos.length === 0` |
| **아이콘** | 📋 또는 SVG 아이콘 |
| **메시지** | "No tasks found" |
| **서브 메시지** | "Add your first task above" |
| **ARIA** | `role="status"`, `aria-live="polite"` |

```html
<div class="empty-state" role="status" aria-live="polite">
  <div class="empty-state__icon">📋</div>
  <h3 class="empty-state__message">No tasks found</h3>
  <p class="empty-state__sub-message">Add your first task above</p>
</div>
```

### 5.2 Empty Filter Result (필터 결과 없음)

| 필터 | 메시지 | 서브 메시지 | 포커스 위치 (A11Y-P1-007) |
|------|--------|-------------|---------------------------|
| All | "No tasks found" | "Add your first task above" | AddTodo input |
| Active | "No active tasks" | "Great job! All tasks completed" | FilterBar.Active |
| Completed | "No completed tasks" | "Complete a task to see it here" | FilterBar.Completed |

| 속성 | 값 |
|------|-----|
| **조건** | `filteredTodos.length === 0 && todos.length > 0` |
| **아이콘** | ✓ 또는 SVG 아이콘 |
| **ARIA** | `role="status"`, `aria-live="polite"` |

```html
<div class="empty-state" role="status" aria-live="polite">
  <div class="empty-state__icon">✓</div>
  <h3 class="empty-state__message" id="empty-message">No active tasks</h3>
  <p class="empty-state__sub-message">Great job! All tasks completed</p>
</div>
```

---

## 6. 키보드 흐름 (Keyboard Flow)

### 6.1 Tab 순서 (Tab Order)

```
순서  요소                      ARIA 속성
────  ───────────────────────  ─────────────────────────────────────
 1    visible label             for="todo-input", tabindex="-1"
 2    AddTodo input             (aria-label 제거), tabindex="0"
 3    AddTodo button            aria-label="Add task", tabindex="0"
 4    TodoItem[0].toggle        aria-pressed="false/true", tabindex="0"
 5    TodoItem[0].delete        aria-label="Delete: {text}", tabindex="0"
 6    TodoItem[1].toggle        aria-pressed="false/true", tabindex="0"
 7    TodoItem[1].delete        aria-label="Delete: {text}", tabindex="0"
 ...   (반복)
 N    FilterBar.All             aria-pressed="false/true", tabindex="0"
 N+1  FilterBar.Active         aria-pressed="false/true", tabindex="0"
 N+2  FilterBar.Completed       aria-pressed="false/true", tabindex="0"
 ────  ───────────────────────  ─────────────────────────────────────
 1    (처음으로 순환)

[DeleteConfirmDialog 열린 시]
 ────  ───────────────────────  ─────────────────────────────────────
 1    Delete button             (초기 포커스)
 2    Cancel button
 ────  ───────────────────────  ─────────────────────────────────────
```

### 6.2 키 조합별 동작 (Key Combination Actions)

| 키 조합 | 컨텍스트 | 동작 | 포커스 이동 |
|---------|----------|------|------------|
| `Tab` | 전체 | 다음 포커스 가능 요소 | 다음 요소 |
| `Shift + Tab` | 전체 | 이전 포커스 가능 요소 | 이전 요소 |
| `Enter` | AddTodo input | 태스크 추가 | 입력 필드 유지 |
| **`Space`** | TodoItem toggle | 완료 상태 토글 (A11Y-P2-003: Space만) | toggle 버튼 유지 |
| `Enter/Space` | TodoItem delete | 삭제 확인 다이얼로그 표시 (A11Y-P1-006) | 모달 Delete 버튼 |
| **`Space`** | FilterBar 버튼 | 필터 전환 (A11Y-P2-003: Space만) | 해당 버튼 유지 |
| `Escape` | AddTodo input | 입력 취소 (초기화) | 입력 필드 |
| `Escape` | DeleteConfirmDialog | 모달 닫기 | 삭제 버튼으로 복귀 |
| `Escape` | Toast 닫기 | 토스트 닫기 | 이전 포커스 요소 |
| `Tab` | DeleteConfirmDialog (open) | Delete ↔ Cancel 순환 (포커스 트랩) | A11Y-P1-008 |
| `Shift + Tab` | DeleteConfirmDialog (open) | Cancel ↔ Delete 순환 (포커스 트랩) | A11Y-P1-008 |

### 6.3 포커스 관리 (Focus Management)

#### 삭제 후 포커스 이동

```
삭제 전: [TodoItem[2].delete] 포커스
         │
         ▼ (삭제 액션 → 모달 확인)
삭제 후: [TodoItem[2].toggle] 포커스 (삭제된 항목의 다음 항목)
         또는
         [AddTodo input] 포커스 (유일한 항목 삭제 시)

         aria-live: "Task deleted" (A11Y-P2-008)
```

| 상황 | 포커스 이동 규칙 |
|------|------------------|
| 마지막 항목 삭제 | 이전 항목의 toggle로 포커스 이동 |
| 유일한 항목 삭제 | AddTodo input으로 포커스 이동 |
| 항목 추가 후 | 새 항목의 toggle로 포커스 이동 (선택사항) |

#### 필터 전환 후 포커스 이동

```
필터 전환: [FilterBar.Active] 클릭
           │
           ▼
포커스 유지: [FilterBar.Active] 포커스 유지
```

#### 필터링 결과 없음 시 포커스 위치 (A11Y-P1-007)

```
필터링 결과 없음: FilterBar.Active 클릭 → 빈 상태
                  │
                  ▼
포커스 유지: [FilterBar.Active] 포커스 유지 (이후 동작 가능)
```

#### 포커스 트랩 명세 (A11Y-P1-008)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Focus Trap Flow                          │
└─────────────────────────────────────────────────────────────────┘

[DeleteConfirmDialog Open]
     │
     ├─▶ 포커스: Delete 버튼 (초기)
     │
     ├─▶ Tab: Delete → Cancel → Delete (순환)
     │
     ├─▶ Shift+Tab: Cancel → Delete → Cancel (순환)
     │
     └─▶ Escape: 모달 닫기, 포커스 삭제 버튼으로 복귀
```

---

## 7. 포커스 인디케이터 (Focus Indicator)

| 속성 | 값 |
|------|-----|
| **테두리** | 2px solid #3B82F6 (파란, 대비비 4.52:1) |
| **테두리 오프셋** | 2px |
| **테두리 반경** | 4px |
| **적용 요소** | 모든 포커스 가능 요소 |
| **예외** | hover 시 마우스 사용자 |
| **폴리필** | `:focus-visible` 폴리필 필요 (Safari < 15.4, A11Y-P2-009) |

```css
:focus-visible {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}

/* 마우스 사용자에게는 hover 시에만 표시 */
:focus:not(:focus-visible) {
  outline: none;
}
```

---

## 8. 애니메이션 명세 (Animation Specification)

### 8.1 삭제 애니메이션 (Delete Animation)

| 속성 | 값 |
|------|-----|
| **대상** | TodoItem DOM 요소 |
| **속성** | `opacity`, `transform: translateY` |
| **지속 시간** | 200ms |
| **이징** | `ease-in-out` |
| **최종 상태** | `opacity: 0`, `transform: translateY(-10px)` |

```css
.todo-item--deleting {
  opacity: 0;
  transform: translateY(-10px);
  transition: opacity 200ms ease-in-out, transform 200ms ease-in-out;
}
```

### 8.2 토글 애니메이션 (Toggle Animation)

| 속성 | 값 |
|------|-----|
| **대상** | TodoItem 텍스트, 체크박스 |
| **속성** | `color`, `text-decoration` |
| **지속 시간** | 0ms (즉시 반영) |
| **이유** | 사용자 피드백 즉시성 우선 |

### 8.3 필터 전환 애니메이션 (Filter Transition Animation)

| 속성 | 값 |
|------|-----|
| **대상** | TodoList 내 TodoItem들 |
| **속성** | `opacity`, `transform` |
| **지속 시간** | 150ms |
| **이징** | `ease-out` |
| **순서** | 사라지는 항목 → 나타나는 항목 |

```css
.todo-item--fade-out {
  opacity: 0;
  transform: translateX(-10px);
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}

.todo-item--fade-in {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}
```

### 8.4 스피너 애니메이션 (Spinner Animation)

| 속성 | 값 |
|------|-----|
| **대상** | 스피너 요소 |
| **속성** | `transform: rotate` |
| **지속 시간** | 1,000ms (무한 반복) |
| **이징** | `linear` |

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1000ms linear infinite;
}
```

---

## 9. 이벤트 흐름 (Event Flow)

### 9.1 태스크 추가 이벤트 흐름 (Add Task Event Flow)

```
사용자 액션: AddTodo input에 텍스트 입력 후 Enter
     │
     ▼
[1] onInput 이벤트 → 상태: Typing → UI: 텍스트 표시
     │
     ▼
[2] onSubmit 이벤트 → 검증: 길이 체크
     │
     ├─► 유효함 → [3] 계속
     │
     └─► 유효하지 않음 → [Error] 표시 → 종료
     │
     ▼
[3] 상태: Submitting → UI: 버튼 비활성화 + 스피너
     │
     ▼
[4] localStorage.setItem 저장
     │
     ├─► 성공 → [5] 계속
     │
     └─► 실패 → [Error: Storage] 토스트 → 종료
     │
     ▼
[5] dispatchEvent('todo:added') → TodoList 수신
     │
     ▼
[6] TodoList: 새 항목 렌더링 → 상태: Initial
     │
     ▼
[7] 입력 필드 초기화 + 포커스 유지
```

### 9.2 태스크 토글 이벤트 흐름 (Toggle Task Event Flow)

```
사용자 액션: TodoItem toggle 클릭 또는 Space (A11Y-P2-003)
     │
     ▼
[1] onClick/onSpace 이벤트 → 상태: Active ↔ Completed
     │
     ▼
[2] localStorage.setItem 저장
     │
     ├─► 성공 → [3] 계속
     │
     └─► 실패 → [Error: Storage] 토스트 → 상태 복구
     │
     ▼
[3] dispatchEvent('todo:toggled') → TodoList 수신
     │
     ▼
[4] UI 갱신: 취소선, 색상 변경, ARIA 속성 업데이트
     │
     ▼
[5] FilterBar: 카운터 업데이트
```

### 9.3 태스크 삭제 이벤트 흐름 (Delete Task Event Flow)

```
사용자 액션: TodoItem delete 클릭 또는 Space
     │
     ▼
[1] onClick/onSpace 이벤트 → DeleteConfirmDialog 열기 (A11Y-P1-006)
     │
     ▼
[2] 모달 표시, 포커스 Delete 버튼으로 이동, 포커스 트랩 활성화 (A11Y-P1-008)
     │
     ├─► Cancel 버튼 또는 Escape → 모달 닫기, 포커스 복귀 → 종료
     │
     └─► Delete 버튼 → [3] 계속
     │
     ▼
[3] 상태: Deleting, 모달 닫기
     │
     ▼
[4] 애니메이션 시작 (200ms)
     │
     ▼
[5] localStorage.setItem 저장
     │
     ├─► 성공 → [6] 계속
     │
     └─► 실패 → [Error: Storage] 토스트 → 상태 복구
     │
     ▼
[6] 애니메이션 완료 → DOM 제거
     │
     ▼
[7] dispatchEvent('todo:deleted') → TodoList 수신
     │
     ▼
[8] 포커스 이동: 다음 항목 toggle 또는 AddTodo input
     │
     ▼
[9] FilterBar: 카운터 업데이트
     │
     ▼
[10] aria-live: "Task deleted" 알림 (A11Y-P2-008)
```

### 9.4 필터 전환 이벤트 흐름 (Filter Change Event Flow)

```
사용자 액션: FilterBar 버튼 클릭 또는 Space (A11Y-P2-003)
     │
     ▼
[1] onClick/onSpace 이벤트 → 현재 필터 비활성화, 클릭 필터 활성화
     │
     ▼
[2] dispatchEvent('filter:changed', { filter: 'active' })
     │
     ▼
[3] TodoList 수신 → filteredTodos 계산
     │
     ├─► filteredTodos.length === 0 → [4] Empty: Filter 표시 + **포커스 FilterBar 유지** (A11Y-P1-007)
     │
     └─► filteredTodos.length > 0 → [5] 목록 렌더링
     │
     ▼
[4] 빈 상태 메시지 표시
     │
     ▼
[5] 목록 애니메이션 (fade-out/fade-in)
```

---

## 10. 상태 검증 규칙 (State Validation Rules)

### 10.1 입력 검증 (Input Validation)

| 규칙 | 설명 | 에러 메시지 |
|------|------|-------------|
| `text.length === 0` | 빈 입력 불가 | "Task text is required" |
| `text.length > 200` | 200자 초과 불가 | "Maximum 200 characters. Delete some characters." (A11Y-P2-012) |
| `text.trim() === ''` | 공백만 입력 불가 | "Task text is required" |

### 10.2 상태 검증 (State Validation)

| 규칙 | 설명 |
|------|------|
| `todos.length <= 1000` | 권장 최대 개수 초과 시 경고 |
| `filter ∈ ['all', 'active', 'completed']` | 유효한 필터 값만 허용 |
| `todo.completed ∈ [true, false]` | 불리언만 허용 |

---

## 11. 스크린 리더 지원 (Screen Reader Support)

### 11.1 상태 변경 알림 (State Change Announcements)

| 이벤트 | 스크린 리더 출력 |
|--------|------------------|
| 태스크 추가 | "Task added: [텍스트]" |
| 태스크 토글 (완료) | "Task completed" |
| 태스크 토글 (미완료) | "Task not completed" |
| 태스크 삭제 | "Task deleted" (A11Y-P2-008: aria-live로 전달) |
| 필터 전환 | "Showing [filter] tasks" |
| 빈 상태 | "No tasks found" |
| 에러 발생 | "Alert: [에러 메시지]" |

### 11.2 ARIA 라이브 리전 (ARIA Live Regions)

| 요소 | 속성 | 설명 |
|------|------|------|
| AddTodo 에러 메시지 | `aria-live="assertive"` | 즉시 알림 |
| Toast 에러 | `aria-live="assertive"` | 즉시 알림 |
| 빈 상태 메시지 | `aria-live="polite"` | 여유 있는 알림 |
| TodoList | `aria-live="polite"` | 목록 변경 알림 |
| **삭제 후 알림** | `aria-live="polite"` | "Task deleted" 알림 (A11Y-P2-008) |

### 11.3 ARIA 속성 매핑 (ARIA Attribute Mapping)

| 요소 | ARIA 속성 (수정됨) |
|------|---------------------|
| AddTodo form | `role="group"`, `aria-label="Add new task"` (A11Y-P2-006) |
| 입력 필드 | `aria-label` 제거 (visible label 사용, A11Y-P2-005) |
| TodoItem | `role="group"`, `aria-label="Task: {text}"` (A11Y-P2-006) |
| FilterBar | `role="navigation"`, `aria-label="Filter tasks"` (A11Y-P2-011) |
| FilterBar div | `role="group"`, `aria-label="Filter tasks"` (A11Y-P2-007) |
| DeleteConfirmDialog | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="dialog-title"` (A11Y-P1-006) |

---

## 12. 성능 요구사항 (Performance Requirements)

| 지표 | 목표값 | 설명 |
|------|--------|------|
| 초기 로드 시간 | < 100ms | localStorage 읽기 |
| 태스크 추가 시간 | < 50ms | 저장 + UI 갱신 |
| 토글 응답 시간 | < 30ms | 즉시 반영 |
| 삭제 애니메이션 | 200ms | 사용자 경험 |
| 필터 전환 시간 | < 100ms | 목록 재렌더링 |
| focus-visible 폴리필 | < 5KB | 추가 번들 크기 (A11Y-P2-009) |

---

## 13. HTML 시맨틱 구조 (HTML Semantic Structure)

### 13.1 HTML 구조 예시

```html
<div class="todo-app">
  <!-- AddTodo (HTML 시맨틱, A11Y-P2-010) -->
  <form class="add-todo" role="group" aria-label="Add new task">
    <label for="todo-input">What needs to be done?</label>
    <div class="add-todo__input-group">
      <button class="add-todo__icon" aria-label="Add task">+</button>
      <input
        id="todo-input"
        type="text"
        class="add-todo__input"
        placeholder="Add a new task"
        aria-required="false"
      />
      <button type="submit" class="add-todo__button">Add Task</button>
    </div>
  </form>

  <!-- TodoList -->
  <ul class="todo-list" role="list" aria-live="polite" aria-atomic="false">
    <!-- TodoItem -->
    <li class="todo-item" role="listitem">
      <div class="todo-item__content" role="group" aria-label="Task: Buy groceries">
        <button
          class="todo-item__toggle"
          aria-pressed="false"
          aria-label="Toggle: Buy groceries"
        >
          <span class="todo-item__checkbox"></span>
        </button>
        <span class="todo-item__text">Buy groceries</span>
        <button
          class="todo-item__delete"
          aria-label="Delete: Buy groceries"
        >
          ×
        </button>
      </div>
    </li>
  </ul>

  <!-- FilterBar (HTML 시맨틱, A11Y-P2-011) -->
  <nav class="filter-bar" role="navigation" aria-label="Filter tasks">
    <div class="filter-bar__group" role="group" aria-label="Filter tasks">
      <button
        class="filter-bar__button filter-bar__button--active"
        aria-pressed="true"
        data-filter="all"
      >
        All <span class="filter-bar__count">3</span>
      </button>
      <button
        class="filter-bar__button"
        aria-pressed="false"
        data-filter="active"
      >
        Active <span class="filter-bar__count">2</span>
      </button>
      <button
        class="filter-bar__button"
        aria-pressed="false"
        data-filter="completed"
      >
        Completed <span class="filter-bar__count">1</span>
      </button>
    </div>
  </nav>
</div>

<!-- DeleteConfirmDialog (A11Y-P1-006) -->
<div class="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" hidden>
  <div class="delete-dialog__backdrop"></div>
  <div class="delete-dialog__content">
    <h2 id="dialog-title">Delete task?</h2>
    <p class="delete-dialog__task-text">"Buy groceries"</p>
    <p class="delete-dialog__warning">This action cannot be undone.</p>
    <div class="delete-dialog__actions">
      <button class="delete-dialog__button delete-dialog__button--cancel">Cancel</button>
      <button class="delete-dialog__button delete-dialog__button--delete">Delete</button>
    </div>
  </div>
</div>
```

---

## 14. 다음 단계 (Next Steps)

| 단계 | 산출물 | 설명 |
|------|--------|------|
| 1 | docs/21-ui-wireframe.md | 와이어프레임 (v1.1) |
| 2 | docs/22-interaction-spec.md | 인터랙션 스펙 (현재 문서, v1.1) |
| 3 | docs/23-accessibility-review.md | 접근성 검토 |
| 4 | docs/25-design-revision-log.md | 설계 수정 로그 |

---

**문서 종료**
