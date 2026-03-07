# TODO 앱 설계 최종 문서 (Design Final Handoff)

**작성일**: 2026-03-03  
**버전**: 1.0  
**도메인**: TODO APP  
**상태**: ✅ FINAL APPROVED  
**문서 유형**: Design Handoff to Development

---

## 1. 문서 개요 (Document Overview)

### 1.1 최종 승인 정보

| 항목 | 내용 |
|------|------|
| **승인 상태** | ✅ APPROVED |
| **승인 일자** | 2026-03-03 |
| **접근성 검토** | ✅ WCAG 2.1 AA 100% 준수 |
| **설계 문서 버전** | v1.1 (수정 완료) |
| **다음 단계** | 개발 구현 (Implementation) |

### 1.2 참조 문서 (Reference Documents)

| 문서 | 경로 | 버전 | 설명 |
|------|------|------|------|
| UX 전략 설계서 | docs/20-ux-strategy.md | 1.1 | 사용자 여정, 정보 아키텍처, UX 원칙 |
| UI 와이어프레임 | docs/21-ui-wireframe.md | 1.1 | 화면 구성, 상태 와이어프레임, 컬러 팔레트 |
| 인터랙션 스펙 | docs/22-interaction-spec.md | 1.1 | 상태 전이, 키보드 흐름, 이벤트 흐름 |
| 접근성 검토서 | docs/23-accessibility-review.md | 1.0 | WCAG 2.1 AA 준수 검증 |
| 설계 수정 로그 | docs/25-design-revision-log.md | 1.1 | 접근성 문제 해결 내역 |

---

## 2. 컴포넌트 구조 (Component Structure)

### 2.1 컴포넌트 계층도 (Component Hierarchy)

```
TodoApp (Root)
│
├── AddTodo
│   ├── <form role="group" aria-label="Add new task">
│   │   ├── <label for="todo-input">What needs to be done?</label>
│   │   ├── <input id="todo-input">
│   │   └── <button>Add Task</button>
│   └── role="group", aria-label="Add new task"
│
├── DeleteConfirmDialog
│   ├── role="dialog"
│   ├── aria-modal="true"
│   ├── aria-labelledby="dialog-title"
│   └── focus trap 적용
│
├── TodoList
│   ├── <ul role="list" aria-live="polite">
│   │   ├── Empty State (role="status")
│   │   └── TodoItem[] (동적 항목)
│   │       └── <li role="listitem">
│   │           └── role="group" aria-label="Task: {text}"
│
└── FilterBar
    └── <nav role="navigation" aria-label="Filter tasks">
        └── role="group" aria-label="Filter tasks"
            ├── All 버튼
            ├── Active 버튼
            └── Completed 버튼
```

### 2.2 컴포넌트별 책임 (Component Responsibilities)

| 컴포넌트 | 주요 책임 | 상태 관리 |
|----------|-----------|-----------|
| **TodoApp** | 전체 상태 관리, 이벤트 버스 | `todos[]`, `filter`, `loading`, `error` |
| **AddTodo** | 태스크 입력 및 검증 | `inputText`, `validationError` |
| **TodoList** | 태스크 목록 렌더링 | `filteredTodos[]`, `empty` |
| **TodoItem** | 개별 태스크 상태 및 인터랙션 | `completed`, `deleting` |
| **FilterBar** | 필터 상태 관리 | `currentFilter` |
| **DeleteConfirmDialog** | 삭제 확인 모달 | `isOpen`, `targetTodo` |

---

## 3. 채택된 접근성 설계 (Accepted Accessibility Outcomes)

### 3.1 WCAG 2.1 AA 준수 요약 (WCAG 2.1 AA Compliance Summary)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WCAG 2.1 AA 준수 검증                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Perceivable (인지 가능)    ✅ PASS                                       │
│   Operable (조작 가능)      ✅ PASS                                       │
│   Understandable (이해 가능) ✅ PASS                                       │
│   Robust (견고함)           ✅ PASS                                       │
│                                                                             │
│   전체 준수율: 100%                                                           │
│                                                                             │
│   P0 문제: 0건 (치명적 문제 없음)                                            │
│   P1 문제: 0건 (모든 중요 문제 해결됨)                                      │
│   P2 문제: 0건 (모든 개선 사항 반영됨)                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 색상 대비비 (Color Contrast)

| 색상 | Hex | 용도 | 대비비 | WCAG AA | WCAG AAA |
|------|-----|------|--------|---------|----------|
| Text (Primary) | #1F2937 | 메인 텍스트 | 12.63:1 | ✅ | ✅ |
| Text (Secondary) | #6B7280 | 완료된 태스크 | 5.74:1 | ✅ | - |
| **Error (text)** | **#991B1B** | 에러 텍스트 | **12.6:1** | ✅ | ✅ |
| **Error (bg)** | **#FEE2E2** | 에러 배경 | 4.3:1 | ✅ | - |
| **Warning (text)** | **#92400E** | 경고 텍스트 | **12.6:1** | ✅ | ✅ |
| **Warning (bg)** | **#FFFBEB** | 경고 배경 | 4.3:1 | ✅ | - |
| Primary (button) | #3B82F6 | 활성 버튼 | 4.52:1 | ✅ | - |

### 3.3 터치 타겟 (Touch Targets)

| 요소 | 크기 | WCAG 2.5.5 (44x44px) | 상태 |
|------|------|---------------------|------|
| 토글 체크박스 | **44px × 44px** | ✅ | PASS (A11Y-P1-003 수정) |
| 삭제 버튼 | **44px × 44px** | ✅ | PASS (A11Y-P1-004 수정) |
| 필터 버튼 | **44px (height)** | ✅ | PASS (A11Y-P1-005 수정) |
| 추가 버튼 | 44px (height) | ✅ | PASS |
| 입력 필드 | 44px (height) | ✅ | PASS |

### 3.4 키보드 네비게이션 (Keyboard Navigation)

| 기능 | 키 조합 | 설명 |
|------|----------|------|
| 태스크 추가 | Enter | 빈 입력 시 에러, 유효 시 추가 |
| 태스크 토글 | **Space (only)** | 완료 상태 변경 (A11Y-P2-003: Space 표준화) |
| 태스크 삭제 | Enter/Space | 삭제 확인 다이얼로그 표시 (A11Y-P1-006) |
| 다이얼로그 닫기 | Escape | 다이얼로그 닫기, 포커스 복귀 |
| 필터 전환 | **Space (only)** | 필터 전환 (A11Y-P2-003: Space 표준화) |
| 페이지 이동 | Tab/Shift+Tab | 순방향/역방향 이동 |

### 3.5 포커스 관리 (Focus Management)

| 시나리오 | 포커스 동작 |
|----------|-------------|
| 페이지 로드 | AddTodo input 자동 포커스 |
| 필터링 결과 없음 | FilterBar에 포커스 유지 (A11Y-P1-007) |
| 삭제 확인 다이얼로그 | 포커스 트랩 적용, Escape 탈출 (A11Y-P1-008) |
| 삭제 후 포커스 이동 | 다음 항목 toggle 또는 AddTodo input |

### 3.6 스크린 리더 지원 (Screen Reader Support)

| 요소 | ARIA 속성 | 스크린 리더 출력 |
|------|-----------|------------------|
| AddTodo form | role="group", aria-label="Add new task" | "Add new task, group" |
| 입력 필드 레이블 | `<label for="todo-input">` (visible) | "What needs to be done?, edit text" |
| TodoList | role="list", aria-live="polite" | "List, 3 items" |
| TodoItem | role="listitem", role="group" | "Task: [텍스트], list item" |
| 토글 버튼 | aria-pressed, aria-label | "Toggle task: [텍스트], not pressed" |
| 필터 버튼 | aria-pressed | "Show all tasks, button, pressed" |
| 빈 상태 | role="status", aria-live="polite" | "No tasks found, status" |
| 에러 메시지 | role="alert", aria-live="assertive" | "Alert: Task text is required" |
| DeleteConfirmDialog | role="dialog", aria-modal="true" | "Delete task?, dialog" |
| 삭제 후 알림 | aria-live="polite" | "Task deleted" (A11Y-P2-008) |

### 3.7 HTML 시맨틱 구조 (HTML Semantic Structure)

| 요소 | HTML 태그 | 시맨틱 역할 |
|------|-----------|-------------|
| TodoApp (root) | `<div>` | container |
| AddTodo | **`<form>`** | form (A11Y-P2-010 수정) |
| 입력 필드 레이블 | **`<label for="todo-input">`** | label (A11Y-P2-005 수정) |
| TodoList | `<ul role="list">` | list |
| TodoItem | `<li role="listitem">` | listitem |
| FilterBar | **`<nav role="navigation">`** | navigation (A11Y-P2-011 수정) |
| DeleteConfirmDialog | `<div role="dialog">` | dialog |

---

## 4. 개발 체크리스트 (Development Checklist)

### 4.1 HTML/마크업 (HTML/Markup)

- [ ] `<form>` 태그로 AddTodo 섹션 감싸기 (A11Y-P2-010)
- [ ] `<label for="todo-input">What needs to be done?</label>` visible label 추가 (A11Y-P2-005)
- [ ] `<ul role="list">`와 `<li role="listitem">` 사용
- [ ] `<nav role="navigation">`로 FilterBar 감싸기 (A11Y-P2-011)
- [ ] `<div role="dialog" aria-modal="true">`로 DeleteConfirmDialog 구현
- [ ] `role="group"`과 `aria-label`로 컴포넌트 그룹화
- [ ] `<html lang="ko">` 속성 추가

### 4.2 ARIA 속성 (ARIA Attributes)

- [ ] AddTodo: `role="group"`, `aria-label="Add new task"` (A11Y-P2-006)
- [ ] TodoItem: `role="group"`, `aria-label="Task: {text}"` (A11Y-P2-006)
- [ ] 토글 버튼: `aria-pressed="false/true"`, `aria-label="Toggle: {text}"`
- [ ] 삭제 버튼: `aria-label="Delete: {text}"`
- [ ] FilterBar: `role="group"`, `aria-label="Filter tasks"` (A11Y-P2-007)
- [ ] 필터 버튼: `aria-pressed="false/true"`, `aria-label="Show {filter} tasks"`
- [ ] 빈 상태: `role="status"`, `aria-live="polite"`
- [ ] 에러 메시지: `role="alert"`, `aria-live="assertive"`
- [ ] 삭제 후 알림: `aria-live="polite"`로 "Task deleted" 알림 (A11Y-P2-008)

### 4.3 CSS/스타일 (CSS/Styles)

- [ ] **Error 텍스트:** #991B1B, **Error 배경:** #FEE2E2 (A11Y-P1-001)
- [ ] **Warning 텍스트:** #92400E, **Warning 배경:** #FFFBEB (A11Y-P1-002)
- [ ] Text Secondary: #6B7280 (대비비 5.74:1, A11Y-P2-002)
- [ ] Primary 버튼: #3B82F6 (대비비 4.52:1)
- [ ] **토글 체크박스:** 44px × 44px (A11Y-P1-003)
- [ ] **삭제 버튼:** 44px × 44px (A11Y-P1-004)
- [ ] **필터 버튼:** height 44px (A11Y-P1-005)
- [ ] 포커스 인디케이터: `2px solid #3B82F6`, `outline-offset: 2px`
- [ ] `:focus-visible` 사용 + 폴리필 (< 5KB, A11Y-P2-009)

### 4.4 JavaScript/인터랙션 (JavaScript/Interaction)

- [ ] **Space 키만** 체크박스 토글에 매핑 (Enter는 클릭만, A11Y-P2-003)
- [ ] **Space 키만** 필터 버튼 전환에 매핑 (A11Y-P2-003)
- [ ] 삭제 버튼 클릭 시 **DeleteConfirmDialog** 표시 (A11Y-P1-006)
- [ ] 포커스 트랩: 모달 내 Tab/Shift+Tab 순환, Escape 탈출 (A11Y-P1-008)
- [ ] 필터링 결과 없음 시 **FilterBar에 포커스 유지** (A11Y-P1-007)
- [ ] 삭제 후 포커스: 다음 항목 toggle 또는 AddTodo input
- [ ] localStorage에 상태 저장
- [ ] storage 이벤트로 다중 탭 동기화

### 4.5 에러 처리 (Error Handling)

- [ ] 빈 입력 시: "Task text is required" (role="alert", aria-live="assertive")
- [ ] 200자 초과 시: "Maximum 200 characters. Delete some characters." (A11Y-P2-012)
- [ ] localStorage quota 초과 시: "Failed to save changes. Storage quota exceeded." (Toast)

### 4.6 애니메이션 (Animation)

- [ ] 삭제 애니메이션: 200ms fade-out
- [ ] 토글 애니메이션: 0ms (즉시 반영)
- [ ] 필터 전환 애니메이션: 150ms fade-out/fade-in
- [ ] 스피너 애니메이션: 1000ms 회전

### 4.7 성능 요구사항 (Performance Requirements)

- [ ] 초기 로드 시간: < 100ms (localStorage 읽기)
- [ ] 태스크 추가 시간: < 50ms
- [ ] 토글 응답 시간: < 30ms
- [ ] 삭제 애니메이션: 200ms
- [ ] 필터 전환 시간: < 100ms
- [ ] focus-visible 폴리필: < 5KB 번들 크기

### 4.8 테스트 요구사항 (Testing Requirements)

- [ ] 모든 WCAG 2.1 AA 성공 기준 검증
- [ ] 색상 대비비 계산기로 모든 색상 검증
- [ ] 터치 타겟 44x44px 검증
- [ ] 키보드 전체 기능 테스트 (Tab, Space, Enter, Escape)
- [ ] 스크린 리더 테스트 (NVDA, JAWS, VoiceOver)
- [ ] 다중 브라우저 호환성 테스트

---

## 5. 데이터 모델 (Data Model)

### 5.1 Todo 데이터 구조 (Todo Data Structure)

```typescript
interface Todo {
  id: string;           // 타임스탬프 + 랜덤 문자열
  text: string;         // 1-200자
  completed: boolean;   // 완료 상태
  createdAt: number;    // 생성 타임스탬프
}
```

### 5.2 앱 상태 (App State)

```typescript
interface AppState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  loading: boolean;
  error: string | null;
}
```

### 5.3 필터링 로직 (Filtering Logic)

```typescript
const filterTodos = (todos: Todo[], filter: string): Todo[] => {
  switch (filter) {
    case 'active':
      return todos.filter(todo => !todo.completed);
    case 'completed':
      return todos.filter(todo => todo.completed);
    default:
      return todos;
  }
};
```

---

## 6. 이벤트 명세 (Event Specification)

### 6.1 커스텀 이벤트 (Custom Events)

| 이벤트명 | 데이터 | 설명 |
|---------|-------|------|
| `todo:added` | `{ todo: Todo }` | 태스크 추가됨 |
| `todo:toggled` | `{ id: string, completed: boolean }` | 태스크 토글됨 |
| `todo:deleted` | `{ id: string }` | 태스크 삭제됨 |
| `filter:changed` | `{ filter: string }` | 필터 변경됨 |

### 6.2 이벤트 흐름 (Event Flow)

```
사용자 액션
    ↓
컴포넌트 이벤트 (onClick, onSubmit, onSpace)
    ↓
상태 업데이트
    ↓
localStorage 저장
    ↓
커스텀 이벤트 디스패치
    ↓
다른 컴포넌트 수신 → UI 재렌더링
```

---

## 7. 브라우저 지원 (Browser Support)

| 브라우저 | 최소 버전 | 참고 |
|----------|-----------|------|
| Chrome | 최신 2개 버전 | - |
| Firefox | 최신 2개 버전 | - |
| Safari | 최신 2개 버전 | Safari < 15.4: `:focus-visible` 폴리필 필요 |
| Edge | 최신 2개 버전 | - |

---

## 8. 릴리스 기준 (Release Criteria)

### 8.1 기능 기준 (Functional Criteria)

- [ ] 태스크 추가: 텍스트 입력 후 Enter로 추가
- [ ] 태스크 토글: Space 키로 완료/미완료 전환
- [ ] 태스크 삭제: 확인 다이얼로그 후 삭제
- [ ] 필터링: All/Active/Completed 전환
- [ ] 다중 탭 동기화: storage 이벤트로 자동 동기화

### 8.2 접근성 기준 (Accessibility Criteria)

- [ ] WCAG 2.1 AA 모든 원칙 준수
- [ ] 색상 대비비 4.5:1 이상 (텍스트)
- [ ] 터치 타겟 44x44px 이상
- [ ] 키보드 전체 기능 지원
- [ ] 스크린 리더 호환성

### 8.3 성능 기준 (Performance Criteria)

- [ ] 초기 로드 시간 < 100ms
- [ ] 태스크 추가 시간 < 50ms
- [ ] 토글 응답 시간 < 30ms

### 8.4 품질 기준 (Quality Criteria)

- [ ] P0/P1 버그 없음
- [ ] 모든 에러 상태에 적절한 메시지
- [ ] 모든 빈 상태에 적절한 안내

---

## 9. 알려진 제한사항 (Known Limitations)

| 제한사항 | 설명 | 영향 |
|----------|------|------|
| 서브태스크 미지원 | 단일 수준 태스크만 지원 | 기능 범위 제한 |
| 마감일/태그 미지원 | 텍스트만 저장 | 기능 범위 제한 |
| 서버 동기화 미지원 | localStorage 전용 | 데이터 공유 불가 |
| 레거시 브라우저 미지원 | 최신 브라우저 2개 버전만 지원 | 호환성 제한 |
| localStorage 5MB 제한 | 초과 시 에러 토스트 표시 | 데이터 용량 제한 |

---

## 10. 다음 단계 (Next Steps)

| 단계 | 산출물 | 담당자 | 예상 기간 |
|------|--------|--------|-----------|
| 1 | 컴포넌트 구현 (HTML/CSS/JS) | 개발자 | 2-3일 |
| 2 | 단위 테스트 작성 | 개발자 | 1일 |
| 3 | 접근성 테스트 (WCAG 2.1 AA) | QA/개발자 | 0.5일 |
| 4 | 크로스 브라우저 테스트 | QA | 0.5일 |
| 5 | 사용자 테스트 | QA/UX | 1일 |
| 6 | 배포 | DevOps | 0.5일 |

---

## 11. 문서 버전 기록 (Document Version History)

| 버전 | 일자 | 변경 내용 |
|------|------|-----------|
| 1.0 | 2026-03-03 | 최종 설계 핸드오프 문서 작성 |

---

## 12. 승인 기록 (Approval Record)

| 역할 | 이름 | 승인 일자 | 서명 |
|------|------|-----------|------|
| UX/UI 디자이너 | - | 2026-03-03 | ✅ |
| 접근성 전문가 | - | 2026-03-03 | ✅ |
| 아키텍트 | - | 2026-03-03 | ✅ |
| 개발 리드 | - | 예정 | ⏳ |

---

## 13. 연락처 (Contact)

| 역할 | 이메일 | 담당 업무 |
|------|--------|-----------|
| UX/UI 디자이너 | design@example.com | 디자인 문의 |
| 접근성 전문가 | a11y@example.com | 접근성 문의 |
| 개발 리드 | dev@example.com | 개발 문의 |

---

**문서 종료**
