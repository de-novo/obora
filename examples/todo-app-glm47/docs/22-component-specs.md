# TODO 앱 컴포넌트 스펙

**버전**: 1.0  
**작성일**: 2026-03-04  
**수정일**: 2026-03-04  
**작성자**: UI/UX 설계자

---

## 1. 개요

본 문서는 TODO 앱의 핵심 컴포넌트에 대한 기술 스펙을 정의합니다. 각 컴포넌트의 API, 상태, 접근성, 그리고 상호작용을 상세히 설명합니다.

### 1.1 컴포넌트 목록

| 컴포넌트 | 설명 |
|----------|------|
| `AddTodo` | 새 태스크 입력 폼 (Input + Add Button) |
| `FilterBar` | 필터 버튼 그룹 |
| `TodoList` | 태스크 목록 컨테이너 |
| `TodoItem` | 개별 태스크 항목 |
| `ErrorBanner` | 오류 메시지 배너 |
| `EmptyState` | 빈 상태 표시 |
| `AppLayout` | 앱 레이아웃 컨테이너 |

---

## 2. AddTodo 컴포넌트

새로운 태스크를 추가하기 위한 입력 폼 컴포넌트입니다.

### 2.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `value` | `string` | 아니오 | `""` | 입력 필드의 현재 값 |
| `placeholder` | `string` | 아니오 | `"할 일을 입력하세요"` | 플레이스홀더 텍스트 |
| `error` | `string \| null` | 아니오 | `null` | 오류 메시지 (null이면 오류 없음) |
| `disabled` | `boolean` | 아니오 | `false` | 비활성 상태 |
| `onAdd` | `(text: string) => void` | 예 | - | 추가 버튼 클릭 시 호출 |
| `onChange` | `(text: string) => void` | 예 | - | 입력 값 변경 시 호출 |
| `onKeyDown` | `(e: KeyboardEvent) => void` | 아니오 | - | 키 다운 이벤트 핸들러 |

#### Ref

| 속성 | 타입 | 설명 |
|------|------|------|
| `inputRef` | `RefObject<HTMLInputElement>` | 입력 요소에 대한 참조 (자동 포커스용) |

### 2.2 상태

| 상태 | 설명 | 조건 |
|------|------|------|
| `default` | 기본 상태 | `error === null`, `!disabled` |
| `focused` | 포커스 상태 | 입력 필드가 포커스됨 |
| `error` | 오류 상태 | `error !== null` |
| `disabled` | 비활성 상태 | `disabled === true` |

### 2.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | padding | `--spacing-3 --spacing-4` |
| | margin-bottom | `--spacing-6` |
| Input | padding | `12px 16px` |
| | border-radius | `--radius-md` |
| | border-width | `1px` |
| | border-color (default) | `--color-gray-300` |
| | border-color (error) | `--color-error` |
| | background-color (default) | `--color-bg` |
| | background-color (error) | `--color-error-bg` |
| | placeholder-color | `--color-gray-400` |
| | font-size | `--font-size-base` |
| | transition | `border-color 250ms, box-shadow 250ms` |
| Add Button | padding | `10px 20px` |
| | background-color | `--color-primary` |
| | color | `--color-bg` |
| | border-radius | `--radius-md` |
| | font-size | `--font-size-base` |
| | font-weight | `--font-weight-medium` |
| | margin-left | `--spacing-2` |
| | transition | `background-color 150ms, box-shadow 150ms` |

### 2.4 상호작션

| 이벤트 | 동작 | 조건 |
|--------|------|------|
| Input change | `onChange(text)` 호출 | 값 변경 시 |
| Enter key | `onAdd(value)` 호출 | Enter 키 입력 시 |
| Add Button click | `onAdd(value)` 호출 | 버튼 클릭 시 |
| Focus | `--shadow-focus` 적용 | 입력 필드 포커스 시 |
| Blur | 포커스 스타일 제거 | 입력 필드 포커스 아웃 시 |

### 2.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"form"` | 폼 역할 명시 |
| `aria-label` | `"새 할 일 추가"` | 스크린 리더용 라벨 |
| Input `aria-invalid` | `error !== null` | 오류 상태 |
| Input `aria-describedby` | `"error-message"` | 오류 메시지 연결 |
| Input `aria-disabled` | `disabled` | 비활성 상태 |
| Tab index | 순차적 | 포커스 순서 유지 |
| Focus visible | `outline: 2px solid var(--color-primary)` | 포커스 가시성 |

### 2.6 HTML 구조 예시

```html
<form role="form" aria-label="새 할 일 추가" class="add-todo">
  <div class="add-todo__input-wrapper">
    <input
      type="text"
      id="new-task-input"
      class="input input--error"
      placeholder="할 일을 입력하세요"
      value="입력 값"
      aria-invalid="true"
      aria-describedby="error-message"
      aria-disabled="false"
    />
    <button
      type="button"
      class="button button--primary"
      aria-label="추가"
    >
      추가
    </button>
  </div>
  {error && (
    <div id="error-message" class="error-banner" role="alert">
      <span class="error-banner__icon">⚠</span>
      <span class="error-banner__text">{error}</span>
    </div>
  )}
</form>
```

---

## 3. FilterBar 컴포넌트

태스크 필터링을 위한 버튼 그룹 컴포넌트입니다.

### 3.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `activeFilter` | `'all' \| 'active' \| 'completed'` | 예 | - | 현재 활성 필터 |
| `onFilterChange` | `(filter: 'all' \| 'active' \| 'completed') => void` | 예 | - | 필터 변경 시 호출 |
| `counts` | `{ all: number, active: number, completed: number }` | 아니오 | `{ all: 0, active: 0, completed: 0 }` | 각 필터별 개수 표시 |

### 3.2 상태

| 상태 | 설명 | 조건 |
|------|------|------|
| `default` | 비활성 상태 | `activeFilter !== filter` |
| `active` | 활성 상태 | `activeFilter === filter` |
| `hover` | 호버 상태 | 마우스 오버 시 |
| `focus` | 포커스 상태 | 키보드 포커스 시 |

### 3.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | display | `flex` |
| | gap | `--spacing-2` |
| | padding | `8px 16px` |
| | margin-bottom | `--spacing-6` |
| Filter Button | padding | `8px 16px` |
| | border-radius | `--radius-md` |
| | border-width | `1px` |
| | border-style | `solid` |
| | font-size | `--font-size-sm` |
| | font-weight | `--font-weight-medium` |
| | transition | `background-color 150ms, border-color 150ms` |
| Filter Button (default) | background-color | `--color-bg` |
| | border-color | `--color-gray-200` |
| | color | `--color-gray-700` |
| Filter Button (active) | background-color | `--color-primary` |
| | border-color | `--color-primary` |
| | color | `--color-bg` |
| Filter Button (hover) | background-color | `--color-gray-50` |
| | border-color | `--color-gray-300` |

### 3.4 상호작션

| 이벤트 | 동작 | 조건 |
|--------|------|------|
| Button click | `onFilterChange(filter)` 호출 | 버튼 클릭 시 |
| Focus | `border-color: var(--color-primary)` | 키보드 포커스 시 |

### 3.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"group"` | 버튼 그룹 역할 |
| `aria-label` | `"필터"` | 스크린 리더용 라벨 |
| Button `aria-pressed` | `activeFilter === filter` | 눌림 상태 |
| Button `aria-label` | `"필터: 전부 ({all})"` 등 | 필터별 라벨 |
| Tab index | 순차적 | 포커스 순서 유지 |
| Focus visible | `outline: 2px solid var(--color-primary)` | 포커스 가시성 |

### 3.6 HTML 구조 예시

```html
<div class="filter-bar" role="group" aria-label="필터">
  <button
    class="filter-button filter-button--active"
    aria-pressed="true"
    aria-label="전부 (5)"
  >
    전부 <span class="filter-button__count">5</span>
  </button>
  <button
    class="filter-button"
    aria-pressed="false"
    aria-label="진행 중 (3)"
  >
    진행 중 <span class="filter-button__count">3</span>
  </button>
  <button
    class="filter-button"
    aria-pressed="false"
    aria-label="완료됨 (2)"
  >
    완료됨 <span class="filter-button__count">2</span>
  </button>
</div>
```

---

## 4. TodoList 컴포넌트

태스크 목록을 표시하는 컨테이너 컴포넌트입니다.

### 4.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `todos` | `Todo[]` | 예 | `[]` | 태스크 배열 |
| `filter` | `'all' \| 'active' \| 'completed'` | 예 | - | 현재 필터 |
| `onToggle` | `(id: string) => void` | 예 | - | 완료 토글 시 호출 |
| `onDelete` | `(id: string) => void` | 예 | - | 삭제 시 호출 |

#### Todo 타입

```typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}
```

### 4.2 상태

| 상태 | 설명 | 조건 |
|------|------|------|
| `hasItems` | 항목 존재 | `filteredTodos.length > 0` |
| `empty` | 빈 상태 | `filteredTodos.length === 0` |

### 4.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | display | `flex` |
| | flex-direction | `column` |
| | gap | `--spacing-1` |
| Empty State | padding | `32px 16px` |
| | text-align | `center` |

### 4.4 상호작션

| 이벤트 | 동작 | 설명 |
|--------|------|------|
| TodoItem toggle | `onToggle(id)` 호출 | 체크박스 클릭 시 |
| TodoItem delete | `onDelete(id)` 호출 | 삭제 버튼 클릭 시 |

### 4.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"list"` | 목록 역할 |
| `aria-label` | `"할 일 목록"` | 스크린 리더용 라벨 |
| `aria-live` | `"polite"` | 내용 변경 알림 |
| `aria-atomic` | `"true"` | 전체 내용 읽기 |

### 4.6 HTML 구조 예시

```html
<ul class="todo-list" role="list" aria-label="할 일 목록" aria-live="polite" aria-atomic="true">
  <li class="todo-item">
    <!-- TodoItem 컴포넌트 -->
  </li>
  <li class="todo-item todo-item--completed">
    <!-- TodoItem 컴포넌트 -->
  </li>
</ul>
```

---

## 5. TodoItem 컴포넌트

개별 태스크를 표시하는 컴포넌트입니다.

### 5.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | `string` | 예 | - | 태스크 ID |
| `text` | `string` | 예 | - | 태스크 텍스트 |
| `completed` | `boolean` | 예 | - | 완료 상태 |
| `onToggle` | `() => void` | 예 | - | 완료 토글 시 호출 |
| `onDelete` | `() => void` | 예 | - | 삭제 시 호출 |
| `index` | `number` | 아니오 | `0` | 목록 내 인덱스 |

### 5.2 상태

| 상태 | 설명 | 조건 |
|------|------|------|
| `default` | 기본 상태 | `!completed` |
| `completed` | 완료 상태 | `completed === true` |
| `hover` | 호버 상태 | 마우스 오버 시 |
| `focus` | 포커스 상태 | 키보드 포커스 시 |

### 5.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | display | `flex` |
| | align-items | `center` |
| | gap | `--spacing-3` |
| | padding | `12px 16px` |
| | border-radius | `--radius-md` |
| | transition | `background-color 150ms` |
| Container (default) | background-color | `--color-bg` |
| Container (hover) | background-color | `--color-gray-50` |
| Container (focus) | border | `1px solid var(--color-primary)` |
| Checkbox | size | `20px` |
| | border-radius | `--radius-sm` |
| | border-width | `1px` |
| | border-color (default) | `--color-gray-400` |
| | border-color (checked) | `--color-primary` |
| | background-color (checked) | `--color-primary` |
| | check-color | `--color-bg` |
| Text | font-size | `--font-size-lg` |
| | font-weight | `--font-weight-normal` |
| | line-height | `--line-height-normal` |
| | color (default) | `--color-text` |
| | color (completed) | `--color-gray-400` |
| | text-decoration (completed) | `line-through` |
| Delete Button | padding | `8px` |
| | background-color | `transparent` |
| | border-radius | `--radius-md` |
| | color | `--color-error` |
| | transition | `background-color 150ms` |
| Delete Button (hover) | background-color | `--color-error-bg` |

### 5.4 상호작션

| 이벤트 | 동작 | 조건 |
|--------|------|------|
| Checkbox change | `onToggle()` 호출 | 체크박스 클릭 시 |
| Delete Button click | `onDelete()` 호출 | 삭제 버튼 클릭 시 |
| Focus | `border: 1px solid var(--color-primary)` | 컨테이너 포커스 시 |

### 5.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"listitem"` | 목록 항목 역할 |
| `aria-checked` | `completed` | 체크 상태 |
| `aria-label` | `"할 일: {text}, {completed ? '완료됨' : '진행 중'}"` | 스크린 리더용 라벨 |
| Checkbox `aria-label` | `"완료 토글"` | 체크박스 라벨 |
| Delete Button `aria-label` | `"삭제"` | 삭제 버튼 라벨 |
| Tab index | `0` | 키보드 포커스 가능 |
| Focus visible | `outline: 2px solid var(--color-primary)` | 포커스 가시성 |
| Keyboard shortcut | `Delete` 또는 `Backspace` | 항목 삭제 |

### 5.6 HTML 구조 예시

```html
<li
  class="todo-item"
  role="listitem"
  aria-checked="false"
  aria-label="할 일: 새로운 태스크, 진행 중"
  tabindex="0"
>
  <label class="todo-item__checkbox-wrapper">
    <input
      type="checkbox"
      class="checkbox"
      checked={false}
      aria-label="완료 토글"
    />
    <span class="checkbox__custom"></span>
  </label>
  <span class="todo-item__text">새로운 태스크</span>
  <button
    type="button"
    class="button button--destructive button--ghost"
    aria-label="삭제"
  >
    <span class="icon icon--delete">✕</span>
  </button>
</li>
```

---

## 6. ErrorBanner 컴포넌트

오류 메시지를 표시하는 배너 컴포넌트입니다.

### 6.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `message` | `string` | 예 | - | 오류 메시지 |
| `onDismiss` | `() => void` | 아니오 | - | 닫기 버튼 클릭 시 호출 |
| `dismissible` | `boolean` | 아니오 | `false` | 닫기 버튼 표시 여부 |

### 6.2 상태

| 상태 | 설명 | 조건 |
|------|------|------|
| `default` | 표시 상태 | 항상 표시 |
| `dismissed` | 닫힘 상태 | `onDismiss` 호출 후 (선택적) |

### 6.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | display | `flex` |
| | align-items | `center` |
| | gap | `--spacing-2` |
| | padding | `12px 16px` |
| | border-radius | `--radius-md` |
| | border-width | `1px` |
| | border-style | `solid` |
| | margin-bottom | `--spacing-4` |
| | background-color | `--color-error-bg` |
| | border-color | `--color-error-border` |
| | box-shadow | `--shadow-sm` |
| Icon | size | `--icon-sm` (16px) |
| | color | `--color-error` |
| Text | font-size | `--font-size-sm` |
| | font-weight | `--font-weight-normal` |
| | color | `--color-error` |
| Dismiss Button | padding | `4px` |
| | background-color | `transparent` |
| | color | `--color-error` |
| | border-radius | `--radius-sm` |

### 6.4 상호작션

| 이벤트 | 동작 | 조건 |
|--------|------|------|
| Dismiss Button click | `onDismiss()` 호출 | `dismissible === true` 일 때 |

### 6.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"alert"` | 경고 역할 |
| `aria-live` | `"assertive"` | 즉시 알림 |
| `aria-atomic` | `"true"` | 전체 내용 읽기 |
| Icon `aria-hidden` | `"true"` | 장식용 아이콘 |
| Dismiss Button `aria-label` | `"닫기"` | 닫기 버튼 라벨 |

### 6.6 HTML 구조 예시

```html
<div class="error-banner" role="alert" aria-live="assertive" aria-atomic="true">
  <span class="error-banner__icon" aria-hidden="true">⚠</span>
  <span class="error-banner__text">할 일을 입력해주세요</span>
  <button
    type="button"
    class="error-banner__dismiss"
    aria-label="닫기"
  >
    <span aria-hidden="true">✕</span>
  </button>
</div>
```

---

## 7. EmptyState 컴포넌트

빈 목록 상태를 표시하는 컴포넌트입니다.

### 7.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `message` | `string` | 아니오 | `"할 일이 없습니다"` | 표시 메시지 |
| `subMessage` | `string` | 아니오 | `"새로운 할 일을 추가해 보세요"` | 보조 메시지 |
| `icon` | `string` | 아니오 | `"📋"` | 아이콘 (이모지 또는 SVG) |

### 7.2 상태

| 상태 | 설명 |
|------|------|
| `default` | 표시 상태 |

### 7.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | display | `flex` |
| | flex-direction | `column` |
| | align-items | `center` |
| | justify-content | `center` |
| | padding | `32px 16px` |
| | text-align | `center` |
| | min-height | `200px` |
| Icon | size | `48px` |
| | color | `--color-gray-300` |
| | margin-bottom | `--spacing-4` |
| Message | font-size | `--font-size-lg` |
| | font-weight | `--font-weight-medium` |
| | color | `--color-gray-500` |
| | margin-bottom | `--spacing-1` |
| Sub Message | font-size | `--font-size-base` |
| | font-weight | `--font-weight-normal` |
| | color | `--color-gray-400` |

### 7.4 상호작션

없음 (정적 컴포넌트)

### 7.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"status"` | 상태 표시 |
| `aria-live` | `"polite"` | 부드러운 알림 |
| Icon `aria-hidden` | `"true"` | 장식용 아이콘 |

### 7.6 HTML 구조 예시

```html
<div class="empty-state" role="status" aria-live="polite">
  <div class="empty-state__icon" aria-hidden="true">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  </div>
  <p class="empty-state__message">할 일이 없습니다</p>
  <p class="empty-state__sub-message">새로운 할 일을 추가해 보세요</p>
</div>
```

---

## 8. AppLayout 컴포넌트

앱 전체 레이아웃을 담당하는 컨테이너 컴포넌트입니다.

### 8.1 API

#### Props

| Prop | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `children` | `ReactNode` | 예 | - | 자식 요소들 |
| `maxWidth` | `'sm' \| 'md' \| 'lg'` | 아니오 | `'md'` | 최대 너비 |

### 8.2 상태

| 상태 | 설명 |
|------|------|
| `default` | 기본 상태 |

### 8.3 스타일 토큰

| 요소 | 속성 | 토큰 |
|------|------|------|
| Container | width | `100%` |
| | max-width (sm) | `--container-sm` (640px) |
| | max-width (md) | `--container-md` (768px) |
| | max-width (lg) | `--container-lg` (1024px) |
| | margin | `0 auto` |
| | padding | `0 --spacing-4` |
| | background-color | `--color-bg` |
| | min-height | `100vh` |

### 8.4 반응형

| 브레이크포인트 | 패딩 |
|--------------|------|
| Mobile (375px 이하) | `0 16px` |
| Tablet (768px 이하) | `0 24px` |
| Desktop (1024px 이상) | `0 40px` |

### 8.5 접근성

| 속성 | 값 | 설명 |
|------|-----|------|
| `role` | `"main"` | 메인 콘텐츠 영역 |
| `aria-label` | `"할 일 앱"` | 스크린 리더용 라벨 |

### 8.6 HTML 구조 예시

```html
<main class="app-layout" role="main" aria-label="할 일 앱">
  <div class="app-layout__content">
    {children}
  </div>
</main>
```

---

## 9. 공통 스펙

### 9.1 공통 포커스 스타일

```css
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

button:focus-visible,
input:focus-visible,
[tabindex="0"]:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### 9.2 공통 트랜지션

| 속성 | 지속 시간 | 이징 |
|------|----------|------|
| background-color | 150ms | `--ease-out` |
| border-color | 250ms | `--ease-out` |
| box-shadow | 250ms | `--ease-out` |
| color | 150ms | `--ease-out` |
| transform | 250ms | `--ease-out` |

### 9.3 리듀스 모션 지원

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 9.4 포커스 순서

1. `AddTodo` - 입력 필드
2. `AddTodo` - 추가 버튼
3. `FilterBar` - 전부 버튼
4. `FilterBar` - 진행 중 버튼
5. `FilterBar` - 완료됨 버튼
6. `TodoList` - 각 `TodoItem` (순서대로)
   - 체크박스
   - 삭제 버튼

### 9.5 터치 타겟 최소 크기

| 컴포넌트 | 최소 크기 | 실제 크기 |
|----------|----------|----------|
| Add Button | 44x44px | 44x40px (세로 확장 권장) |
| Filter Button | 44x44px | 40x36px (확장 권장) |
| Delete Button | 44x44px | 32x32px (확장 권장) |
| Checkbox | 44x44px | 20x20px (클릭 영역 확장 필요) |

---

## 10. TypeScript 타입 정의

```typescript
// Filter 타입
type Filter = 'all' | 'active' | 'completed';

// Todo 타입
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

// AddTodo Props
interface AddTodoProps {
  value: string;
  placeholder?: string;
  error: string | null;
  disabled: boolean;
  onAdd: (text: string) => void;
  onChange: (text: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

// FilterBar Props
interface FilterBarProps {
  activeFilter: Filter;
  onFilterChange: (filter: Filter) => void;
  counts?: {
    all: number;
    active: number;
    completed: number;
  };
}

// TodoList Props
interface TodoListProps {
  todos: Todo[];
  filter: Filter;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

// TodoItem Props
interface TodoItemProps {
  id: string;
  text: string;
  completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  index?: number;
}

// ErrorBanner Props
interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
}

// EmptyState Props
interface EmptyStateProps {
  message?: string;
  subMessage?: string;
  icon?: string;
}

// AppLayout Props
interface AppLayoutProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
}
```

---

## 11. 구현 가이드

### 11.1 컴포넌트 생성 순서

1. **기본 컴포넌트**: `Button`, `Input`, `Checkbox` (원자적 컴포넌트)
2. **복합 컴포넌트**: `AddTodo`, `FilterBar`, `TodoItem`, `ErrorBanner`, `EmptyState`
3. **컨테이너 컴포넌트**: `TodoList`, `AppLayout`

### 11.2 스타일 구현 전략

| 방법 | 설명 | 추천 |
|------|------|------|
| CSS-in-JS | 스타일드 컴포넌트, emotion 등 | React + 스타일드 컴포넌트 |
| CSS Modules | `.module.css` 파일 사용 | Vue, Svelte |
| Tailwind CSS | 유틸리티 클래스 사용 | 빠른 프로토타이핑 |
| Pure CSS | 일반 CSS 파일 | 단순 프로젝트 |

### 11.3 접근성 테스트 체크리스트

- [ ] 모든 대화형 요소에 키보드 접근 가능
- [ ] 포커스 가시성 확인
- [ ] 스크린 리더로 읽기 테스트
- [ ] ARIA 속성 올바르게 사용
- [ ] 색상 대비비 WCAG AA 준수
- [ ] 터치 타겟 최소 44x44px
- [ ] 리듀스 모션 지원

### 11.4 브라우저 지원

| 브라우저 | 최소 버전 |
|----------|----------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

---

## 12. 관련 문서

- **UI/UX 스펙**: `docs/20-uiux-spec.md`
- **디자인 시스템**: `docs/21-design-system.md`
- **디자인 토큰**: `docs/21-design-tokens.json`

---

**문서 상태**: COMPLETE  
**다음 검토**: 구현 단계
