---
paths:
  - "**/app/**/*.{ts,tsx,js,jsx}"
  - "**/pages/**/*.{ts,tsx,js,jsx}"
  - "**/components/**/*.{ts,tsx,js,jsx}"
  - "**/*.html"
---

# Web Accessibility

웹 접근성 (a11y) 원칙입니다. WCAG 2.1 가이드라인을 따릅니다.

## 핵심 원칙

**모든 사용자 포용**: 시각, 청각, 운동, 인지 장애를 가진 사용자도 사용 가능해야 합니다.

## 시맨틱 HTML

### 올바른 태그 사용

```tsx
// Good
<button onClick={handleClick}>Submit</button>
<nav><ul><li><a href="/">Home</a></li></ul></nav>
<main><article><h1>Title</h1></article></main>

// Bad
<div onClick={handleClick}>Submit</div>
<div class="nav"><div class="link">Home</div></div>
```

### 제목 계층 구조

```tsx
// Good - 순차적 계층
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>

// Bad - 건너뛰기
<h1>Page Title</h1>
<h3>Subsection</h3>  {/* h2 생략 */}
```

## 이미지 접근성

### alt 속성

```tsx
// Good - 설명적 alt
<img src="logo.png" alt="Company Logo" />
<img src="chart.png" alt="Sales increased 50% in Q4" />

// 장식 이미지는 빈 alt
<img src="decoration.png" alt="" role="presentation" />

// Bad
<img src="photo.png" />  {/* alt 없음 */}
<img src="photo.png" alt="image" />  {/* 의미없는 alt */}
```

## 폼 접근성

### 레이블 연결

```tsx
// Good
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// 또는
<label>
  Email
  <input type="email" />
</label>

// Bad
<input type="email" placeholder="Email" />  {/* 레이블 없음 */}
```

### 에러 메시지

```tsx
// Good - aria로 연결
<input
  id="email"
  aria-invalid={hasError}
  aria-describedby="email-error"
/>
{hasError && <span id="email-error">Invalid email</span>}
```

## 키보드 접근성

### 포커스 관리

```tsx
// Good - 포커스 가능
<button>Click me</button>
<a href="/page">Link</a>

// 커스텀 요소에 tabindex
<div role="button" tabIndex={0} onKeyDown={handleKeyDown}>
  Custom Button
</div>

// Bad - 포커스 불가
<div onClick={handleClick}>Click me</div>
```

### 포커스 표시

```css
/* Good - 명확한 포커스 표시 */
:focus {
  outline: 2px solid blue;
  outline-offset: 2px;
}

/* Bad - 포커스 숨기기 */
:focus { outline: none; }
```

### 키보드 트랩 방지

```tsx
// 모달 내에서 포커스 순환
function Modal() {
  // 첫/마지막 요소에서 순환
  // ESC로 닫기 지원
}
```

## ARIA 사용

### 필요시에만 사용

```tsx
// Good - 네이티브가 우선
<button>Click</button>

// ARIA 필요한 경우
<div role="alert" aria-live="polite">
  {message}
</div>

// Bad - 불필요한 ARIA
<button role="button">Click</button>
```

### 동적 컨텐츠

```tsx
// 상태 변경 알림
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// 로딩 상태
<button aria-busy={isLoading} disabled={isLoading}>
  {isLoading ? "Loading..." : "Submit"}
</button>
```

## 색상 및 대비

### 충분한 대비

```css
/* Good - 4.5:1 이상 대비 */
color: #333;
background: #fff;

/* Bad - 낮은 대비 */
color: #999;
background: #ccc;
```

### 색상만으로 정보 전달 금지

```tsx
// Good - 색상 + 아이콘/텍스트
<span className="error">
  <ErrorIcon /> Error: Invalid input
</span>

// Bad - 색상만 사용
<span style={{ color: "red" }}>Invalid input</span>
```

## 금지 사항

- `tabindex > 0` 사용
- `role="presentation"` 남용
- 자동 재생 미디어 (음소거 없이)
- 깜빡이는 컨텐츠 (3Hz 이상)
- 마우스 전용 상호작용
