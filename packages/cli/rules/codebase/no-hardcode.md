# No Hardcode / Magic Numbers Rule

코드에서 하드코딩된 값과 매직넘버 사용을 금지합니다.

## 핵심 원칙

1. **모든 값은 의미 있는 이름으로 정의되어야 합니다.**
2. **4배수 디자인 시스템 (4px Grid)**: 모든 크기 값은 4의 배수를 사용합니다.

## 4배수 디자인 시스템

```
4px  = 0.25rem  (spacing-1)
8px  = 0.5rem   (spacing-2)
12px = 0.75rem  (spacing-3)
16px = 1rem     (spacing-4)
20px = 1.25rem  (spacing-5)
24px = 1.5rem   (spacing-6)
32px = 2rem     (spacing-8)
40px = 2.5rem   (spacing-10)
48px = 3rem     (spacing-12)
```

### 예외 허용
- 1px 보더/구분선
- 아이콘 내부 strokeWidth
- 매우 작은 장식적 요소

## 금지 패턴

### 1. 인라인 스타일의 하드코딩

```tsx
// Bad
<div style={{ width: "180px" }}>
<div style={{ height: "24px", gap: "20px" }}>

// Good - Tailwind 사용
<div className="w-44">
<div className="h-6 gap-5">

// Good - CSS 변수 사용 (테마)
<div style={{ width: "var(--node-width)" }}>
```

### 2. Tailwind arbitrary values 남용

```tsx
// Bad - 매직넘버
<span className="text-[10px]">
<div className="w-[180px] h-[24px]">

// Good - 표준 클래스 사용
<span className="text-xs">
<div className="w-44 h-6">

// 정말 필요한 경우 - CSS 변수로 정의
@theme {
  --spacing-node: 180px;
}
<div className="w-[--spacing-node]">
```

### 3. SVG/Canvas 하드코딩

```tsx
// Bad
<svg width="48" height="24">
<line x1="4" y1="12" x2="40" y2="12">

// Good - 변수 또는 props 사용
const EDGE_WIDTH = 48;
const EDGE_HEIGHT = 24;
<svg width={EDGE_WIDTH} height={EDGE_HEIGHT}>
```

### 4. 반복되는 숫자

```tsx
// Bad
setTimeout(() => {}, 3000);
if (items.length > 10) { }
const limit = 50;

// Good - 상수로 정의
const DEBOUNCE_MS = 3000;
const MAX_VISIBLE_ITEMS = 10;
const DEFAULT_PAGE_LIMIT = 50;
```

## 허용 패턴

### 명확한 의미의 작은 숫자

```tsx
// OK - 자명한 경우
array.slice(0, 1)  // 첫 번째 요소
index + 1          // 다음 인덱스
opacity: 0.5       // 50% 투명도 (0-1 범위 명확)
```

### Tailwind 표준 클래스

```tsx
// OK - Tailwind 표준 스케일
<div className="p-4 m-2 gap-3 text-sm w-full">
```

## 수정 방법

### 1. Tailwind 표준 클래스 우선

```tsx
// arbitrary value 대신 가장 가까운 표준 값 사용
text-[10px] → text-xs (12px)
w-[180px] → w-44 (176px) or w-48 (192px)
```

### 2. 테마 확장 (필요시)

```css
@theme {
  --width-node: 11rem;      /* 176px */
  --spacing-edge: 3rem;     /* 48px */
}
```

### 3. 상수 파일 사용

```tsx
// lib/constants.ts
export const FLOW_CONFIG = {
  nodeWidth: 176,
  edgeWidth: 48,
  gridSize: 24,
} as const;
```

## 검증

코드 리뷰 시 확인:

```bash
# arbitrary values 검색
Grep: "className=.*\[.*px\]" in **/*.tsx
Grep: "style={{" in **/*.tsx
```

## 요약

```yaml
금지:
  - style={{ }} 인라인 스타일
  - className="...-[숫자px]" arbitrary values
  - 의미 없는 숫자 리터럴
  - 반복되는 하드코딩 값

허용:
  - Tailwind 표준 클래스
  - CSS 변수 (@theme)
  - 명명된 상수
  - 자명한 0, 1 등

원칙:
  - 모든 값에 의미 부여
  - 재사용 가능하게 정의
  - 변경 시 한 곳만 수정
```
