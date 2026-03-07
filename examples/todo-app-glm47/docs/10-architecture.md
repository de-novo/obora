# TODO 앱 아키텍처 설계서

**버전**: 1.1  
**작성일**: 2026-03-03  
**수정일**: 2026-03-03  
**작성자**: 시스템 구조 설계자

---

## 1. 개요

본 문서는 TODO 앱의 시스템 구조, 컴포넌트 트리, 데이터 모델, 상태 관리, localStorage 전략을 정의합니다.

### 1.1 아키텍처 원칙

| 원칙 | 설명 |
|------|------|
| 단일 책임 원칙 | 각 컴포넌트가 하나의 명확한 책임만 수행 |
| 단방향 데이터 흐름 | 액션 → 상태 → 렌더링의 명확한 흐름 |
| 단일 데이터 소스 | 모든 상태를 TodoApp에서 중앙 집중 관리 |
| 느슨한 결합 | 이벤트 버스와 콜백을 통한 컴포넌트 통신 |

---

## 2. 시스템 구조

### 2.1 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                         TodoApp (Root)                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  상태 관리 (State Management)                            │ │
│  │  - todos: Array<Todo>                                   │ │
│  │  - filter: 'all' | 'active' | 'completed'              │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  이벤트 버스 (Event Bus)                                 │ │
│  │  - onTodoAdd, onTodoToggle, onTodoDelete, onFilterChange│ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  localStorage 관리                                      │ │
│  │  - load(), save() (debounce 100ms)                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    AddTodo      │ │   FilterBar     │ │    TodoList     │
│  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │
│  │ Input     │  │ │  │ All Btn   │  │ │ │ TodoItem[]│  │
│  │ Submit    │  │ │  │ Active Btn│  │ │ │ (동적 생성)│  │
│  └───────────┘  │ │  │Completed  │  │ │ └───────────┘  │
└─────────────────┘ │  └───────────┘  │ └─────────────────┘
                    └─────────────────┘
```

### 2.2 컴포넌트 계층 구조

```
TodoApp (Root)
├── AddTodo
│   └── [Input Form]
├── FilterBar
│   ├── [All Button]
│   ├── [Active Button]
│   └── [Completed Button]
└── TodoList
    └── TodoItem[] (동적 생성)
        ├── [Checkbox/Toggle]
        ├── [Text]
        └── [Delete Button]
```

---

## 3. 컴포넌트 트리

### 3.1 컴포넌트 상세 명세

#### 3.1.1 TodoApp (Root Component)

| 속성 | 설명 |
|------|------|
| **역할** | 애플리케이션의 루트 컴포넌트 |
| **책임** | 상태 관리, 이벤트 중앙 처리, localStorage 입출력 |
| **상태** | `todos`, `filter` |
| **메서드** | `loadFromStorage()`, `saveToStorage()`, `render()`, `dispatch()` |
| **자식 컴포넌트** | AddTodo, FilterBar, TodoList |

#### 3.1.2 AddTodo

| 속성 | 설명 |
|------|------|
| **역할** | 새 태스크 입력 폼 |
| **책임** | 텍스트 입력, 유효성 검증, 추가 이벤트 발생 |
| **상태** | 없음 (TodoApp에 이벤트 전달) |
| **메서드** | `onSubmit()` |
| **이벤트** | `todo:add` → TodoApp |

#### 3.1.3 FilterBar

| 속성 | 설명 |
|------|------|
| **역할** | 필터 버튼 그룹 |
| **책임** | 필터 상태 표시, 필터 변경 이벤트 발생 |
| **상태** | 없음 (TodoApp에 이벤트 전달) |
| **메서드** | `onFilterClick()` |
| **이벤트** | `filter:change` → TodoApp |

#### 3.1.4 TodoList

| 속성 | 설명 |
|------|------|
| **역할** | 태스크 목록 컨테이너 |
| **책임** | 필터링된 태스크 목록 렌더링, 빈 상태 메시지 |
| **상태** | 없음 (TodoApp으로부터 props 수신) |
| **메서드** | `render(todos, filter)` |

#### 3.1.5 TodoItem

| 속성 | 설명 |
|------|------|
| **역할** | 개별 태스크 행 |
| **책임** | 태스크 표시, 완료 토글, 삭제 버튼 이벤트 발생 |
| **상태** | 없음 (TodoItem DOM 요소만 관리) |
| **메서드** | 이벤트 위임으로 처리 |
| **이벤트** | `todo:toggle`, `todo:delete` → TodoApp |

---

## 4. 데이터 모델

### 4.1 상태 객체 구조

```javascript
{
  // 태스크 배열
  todos: [
    {
      id: number,        // 고유 ID (timestamp + random)
      text: string,      // 태스크 내용
      completed: boolean // 완료 상태
    }
  ],
  
  // 필터 상태
  filter: 'all' | 'active' | 'completed'
}
```

### 4.2 Todo 인터페이스

| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `id` | `string` | 태스크 고유 식별자 | `Date.now() + random suffix` 생성, 중복 불가 |
| `text` | `string` | 태스크 내용 | 공백 제외 후 길이 > 0 |
| `completed` | `boolean` | 완료 상태 | 기본값 `false` |

### 4.3 Filter 타입

| 값 | 설명 | 필터링 조건 |
|----|------|------------|
| `'all'` | 전체 태스크 | 모든 태스크 표시 |
| `'active'` | 진행중 태스크 | `completed === false` |
| `'completed'` | 완료된 태스크 | `completed === true` |

### 4.4 액션 타입

| 액션 | 페이로드 | 설명 |
|------|----------|------|
| `ADD_TODO` | `{ text: string }` | 새 태스크 생성 |
| `TOGGLE_TODO` | `{ id: string }` | 완료 상태 토글 |
| `DELETE_TODO` | `{ id: string }` | 태스크 삭제 |
| `SET_FILTER` | `{ filter: string }` | 필터 상태 변경 |

---

## 5. 상태 관리

### 5.1 상태 관리 패턴

**Flux-스타일 단방향 데이터 흐름 (단순화 버전)**

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 사용자  │───▶│ 액션    │───▶│ 상태    │───▶│ 렌더링  │
│ 액션    │    │ 핸들러  │    │ 업데이트│    │         │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                                   │
                                   ▼
                            ┌─────────┐
                            │ 저장소  │
                            │ 저장    │
                            └─────────┘
```

### 5.2 상태 업데이트 흐름

#### 5.2.1 태스크 추가 흐름

```
1. 사용자 입력 → AddTodo
2. 유효성 검증 (trim 후 빈 문자열 체크)
3. todo:add 이벤트 발생
4. TodoApp 액션 핸들러 수신
5. 상태 업데이트: todos.push({ id, text, completed: false })
6. localStorage 저장 (debounce 100ms)
7. TodoList 재렌더링
```

#### 5.2.2 완료 토글 흐름

```
1. TodoItem 체크박스 클릭
2. 이벤트 위임으로 todo:toggle 이벤트 발생
3. TodoApp 액션 핸들러 수신
4. 상태 업데이트: todos.find(id).completed = !completed
5. localStorage 업데이트 (debounce 100ms)
6. 해당 TodoItem DOM 업데이트
```

#### 5.2.3 삭제 흐름

```
1. TodoItem 삭제 버튼 클릭
2. 이벤트 위임으로 todo:delete 이벤트 발생
3. TodoApp 액션 핸들러 수신
4. 상태 업데이트: todos = todos.filter(t => t.id !== id)
5. localStorage 업데이트 (debounce 100ms)
6. TodoList 재렌더링
```

#### 5.2.4 필터링 흐름

```
1. FilterBar 버튼 클릭
2. filter:change 이벤트 발생
3. TodoApp 액션 핸들러 수신
4. 상태 업데이트: filter = 새 값
5. localStorage 필터 저장
6. TodoList 필터링 적용 후 재렌더링
```

### 5.3 액션 핸들러 구조

```javascript
// 고유한 ID 생성: 타임스탬프 + 랜덤 접미사로 충돌 방지
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

const handlers = {
  ADD_TODO: (state, payload) => ({
    ...state,
    todos: [...state.todos, {
      id: generateId(),
      text: payload.text,
      completed: false
    }]
  }),
  
  TOGGLE_TODO: (state, payload) => ({
    ...state,
    todos: state.todos.map(todo =>
      todo.id === payload.id 
        ? { ...todo, completed: !todo.completed }
        : todo
    )
  }),
  
  DELETE_TODO: (state, payload) => ({
    ...state,
    todos: state.todos.filter(todo => todo.id !== payload.id)
  }),
  
  SET_FILTER: (state, payload) => ({
    ...state,
    filter: payload.filter
  })
};
```

---

## 6. localStorage 전략

### 6.1 저장소 키 구조

| 키 | 타입 | 설명 |
|----|------|------|
| `todo-app-todos` | `string` (JSON) | 태스크 배열 직렬화 데이터 |
| `todo-app-filter` | `string` | 현재 필터 상태 |

### 6.2 저장/로드 함수

#### 6.2.1 로드 함수

```javascript
function loadFromStorage() {
  try {
    const todos = JSON.parse(localStorage.getItem('todo-app-todos')) || [];
    const filter = localStorage.getItem('todo-app-filter') || 'all';
    
    // 데이터 구조 검증
    if (!Array.isArray(todos)) {
      return { todos: [], filter: 'all' };
    }
    
    // 각 todo 필드 검증
    const validatedTodos = todos.filter(todo => 
      typeof todo.id === 'string' &&
      typeof todo.text === 'string' &&
      typeof todo.completed === 'boolean'
    );
    
    return { todos: validatedTodos, filter };
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return { todos: [], filter: 'all' };
  }
}
```

#### 6.2.2 저장 함수 (디바운스 적용)

```javascript
let saveTimer = null;

function saveToStorage(state) {
  clearTimeout(saveTimer);
  
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('todo-app-todos', JSON.stringify(state.todos));
      localStorage.setItem('todo-app-filter', state.filter);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded');
        // 오래된 태스크 삭제 제안
        alert('저장 공간이 부족합니다. 완료된 태스크를 정리해주세요.');
      } else {
        console.error('Failed to save to localStorage:', error);
      }
    }
  }, 100); // 100ms debounce
}
```

### 6.3 에러 처리 전략

| 에러 유형 | 처리 방법 |
|----------|----------|
| `QuotaExceededError` | 경고 메시지, 오래된 태스크 삭제 제안 |
| `SyntaxError` (JSON 파싱 실패) | 빈 배열로 초기화, 콘솔 로그 |
| 데이터 구조 불일치 | 유효성 검증 후 필터링 |
| localStorage 비활성화 | 메모리 전용 모드로 동작 (경고 표시) |

### 6.4 데이터 마이그레이션 전략

데이터 구조 변경 시 버전 필드를 추가하여 마이그레이션 지원:

```javascript
{
  version: 1,
  todos: [...],
  filter: 'all'
}
```

---

## 7. 이벤트 버스

### 7.1 커스텀 이벤트 구조

| 이벤트 이름 | 발생 컴포넌트 | 수신 컴포넌트 | 페이로드 |
|------------|--------------|--------------|----------|
| `todo:add` | AddTodo | TodoApp | `{ text: string }` |
| `todo:toggle` | TodoItem (위임) | TodoApp | `{ id: string }` |
| `todo:delete` | TodoItem (위임) | TodoApp | `{ id: string }` |
| `filter:change` | FilterBar | TodoApp | `{ filter: string }` |

### 7.2 이벤트 발생/수신 패턴

```javascript
// 이벤트 발생
function dispatch(eventName, detail) {
  const event = new CustomEvent(eventName, { detail });
  document.dispatchEvent(event);
}

// 이벤트 수신
function subscribe(eventName, handler) {
  document.addEventListener(eventName, handler);
}

// 사용 예시
dispatch('todo:add', { text: 'New Task' });

subscribe('todo:add', (e) => {
  const { text } = e.detail;
  // 액션 핸들러 호출
});
```

---

## 8. 렌더링 전략

### 8.1 전체 재렌더링 방식

상태 변경 시 전체 컴포넌트 트리를 재렌더링합니다.

**장점:**
- 구현 단순함
- 데이터 일관성 보장
- 버그 가능성 낮음

**단점:**
- 대규모 데이터에서 성능 저하 가능
- DOM 재생성으로 포커스 상태 유지 필요

### 8.2 렌더링 함수 구조

```javascript
function render(state) {
  // AddTodo 렌더링 (초기 1회)
  renderAddTodo();
  
  // FilterBar 렌더링 (필터 상태 변경 시)
  renderFilterBar(state.filter);
  
  // TodoList 렌더링 (todos 또는 filter 변경 시)
  renderTodoList(getFilteredTodos(state.todos, state.filter));
}
```

### 8.3 포커스 관리

재렌더링 후 포커스 상태를 복원하여 사용자 경험 유지:

```javascript
let focusedElement = null;

function saveFocus() {
  focusedElement = document.activeElement;
}

function restoreFocus() {
  if (focusedElement) {
    focusedElement.focus();
  }
}
```

---

## 9. 보안 고려사항

### 9.1 XSS 방어

| 위협 | 방어 방법 |
|------|----------|
| 사용자 입력 스크립트 주입 | `textContent` 사용, `innerHTML` 금지 |
| 이벤트 핸들러 주입 | 문자열로 동적 함수 생성 금지 |
| URL 기반 공격 | 외부 링크 처리 시 `rel="noopener noreferrer"` 추가 |

### 9.2 입력 유효성 검증

```javascript
function validateTodoText(text) {
  const trimmed = text.trim();
  
  if (trimmed.length === 0) {
    throw new Error('태스크 내용을 입력해주세요.');
  }
  
  if (trimmed.length > 1000) {
    throw new Error('태스크 내용은 1000자 이하여야 합니다.');
  }
  
  return trimmed;
}
```

---

## 10. 접근성 전략

### 10.1 ARIA 속성

| 요소 | ARIA 속성 | 설명 |
|------|-----------|------|
| TodoItem 체크박스 | `role="checkbox"`, `aria-checked` | 완료 상태 전달 |
| 필터 버튼 그룹 | `role="group"`, `aria-label` | 필터 그룹임 전달 |
| 삭제 버튼 | `aria-label="Delete task"` | 버튼 용도 전달 |

### 10.2 키보드 탐색

| 키 동작 | 동작 |
|---------|------|
| `Tab` | 컴포넌트 간 포커스 이동 |
| `Enter` | 현재 포커스 버튼/체크박스 활성화 |
| `Escape` | 입력 폼 포커스 해제 |

---

## 11. 성능 최적화

### 11.1 최적화 항목

| 항목 | 방법 | 예상 효과 |
|------|------|----------|
| 렌더링 최적화 | 필터링된 배열만 렌더링 | 불필요한 DOM 생성 방지 |
| 이벤트 핸들러 | 정적 부모에 위임 | 메모리 사용량 감소 |
| localStorage | 디바운스 (100ms) | I/O 빈도 90% 감소 |
| CSS | 하드웨어 가속 (transform) | 애니메이션 부드러움 |

---

## 12. 확장성 고려

### 12.1 향후 확장 가능성

| 확장 기능 | 현재 설계에서의 고려사항 |
|----------|------------------------|
| 다크 모드 | CSS 변수로 색상 정의, 테마 클래스 전환 |
| 태스크 편집 | TodoItem에 편집 모드 상태 추가 가능 |
| 우선순위 | `todos` 데이터 구조에 `priority` 필드 추가 |
| 카테고리 | 필터 상태를 문자열에서 객체로 확장 가능 |
| 다크 모드 | CSS 변수로 색상 정의, 테마 클래스 전환 |

---

## 13. 리스크 완화

| 리스크 | 완화 전략 |
|--------|----------|
| localStorage 쿼터 초과 | 태스크 1000개 제한, 경고 메시지 |
| 다중 탭 동시성 | `storage` 이벤트 리스너로 상태 동기화 (필수) |
| 브라우저 호환성 | Modern JS (ES6+) 사용, 최신 브라우저만 지원 |
| 모바일 UX | 터치 타겟 최소 44px, 뷰포트 메타 태그 |

---

## 14. 기술 제약사항 준수 확인

| 제약사항 | 준수 여부 | 근거 |
|----------|----------|------|
| 프레임워크 비사용 | ✅ | 순수 JavaScript, 빌드 도구 미사용 |
| localStorage만 사용 | ✅ | 서버 API 없음, 로컬 저장소 중심 |
| 브라우저 호환성 | ✅ | 최신 브라우저 2개 버전 지원 |
| 접근성 | ✅ | ARIA 속성, 키보드 탐색 명시 |

---

## 15. 다음 단계

다음 단계에서는 본 아키텍처 설계를 바탕으로 UI/UX 전략(`docs/20-ux-strategy.md`)을 작성합니다.
