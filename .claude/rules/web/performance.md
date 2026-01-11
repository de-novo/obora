---
paths:
  - "**/app/**/*.{ts,tsx,js,jsx}"
  - "**/pages/**/*.{ts,tsx,js,jsx}"
  - "**/components/**/*.{ts,tsx,js,jsx}"
  - "**/*.css"
  - "**/*.scss"
---

# Web Performance

웹 애플리케이션 성능 최적화 원칙입니다.

## 핵심 원칙

**Core Web Vitals 최적화**: LCP, FID, CLS를 항상 고려합니다.

## 렌더링 최적화

### 불필요한 리렌더링 방지

```typescript
// Good - 메모이제이션
const MemoizedComponent = memo(ExpensiveComponent);

const memoizedValue = useMemo(() => computeExpensive(data), [data]);
const memoizedCallback = useCallback(() => handleClick(id), [id]);

// Bad - 매 렌더마다 새 객체/함수 생성
<Component style={{ color: "red" }} />
<Component onClick={() => doSomething()} />
```

### 컴포넌트 분리

```typescript
// Good - 상태를 사용하는 부분만 분리
function Parent() {
  return (
    <div>
      <ExpensiveStaticContent />
      <SmallDynamicPart />
    </div>
  );
}

// Bad - 전체가 리렌더링
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <ExpensiveContent />  {/* count와 무관하지만 리렌더링 */}
      <Counter count={count} />
    </div>
  );
}
```

## 로딩 최적화

### 코드 스플리팅

```typescript
// Good - 동적 임포트
const HeavyComponent = lazy(() => import("./HeavyComponent"));

// 라우트 단위 스플리팅
const AdminPage = lazy(() => import("./pages/Admin"));
```

### 이미지 최적화

```typescript
// Good - Next.js Image
import Image from "next/image";

<Image
  src="/photo.jpg"
  width={800}
  height={600}
  loading="lazy"
  placeholder="blur"
  alt="Description"
/>

// Bad - 최적화 없는 img
<img src="/photo.jpg" />
```

### 폰트 최적화

```typescript
// Good - 서브셋, display swap
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});
```

## 번들 최적화

### Tree Shaking

```typescript
// Good - named import
import { debounce } from "lodash-es";

// Bad - 전체 import
import _ from "lodash";
```

### 동적 임포트

```typescript
// Good - 필요시 로드
const handleClick = async () => {
  const { heavyFunction } = await import("./heavy-module");
  heavyFunction();
};
```

## 네트워크 최적화

### 데이터 패칭

```typescript
// Good - 병렬 패칭
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts(),
]);

// Good - SWR/React Query 캐싱
const { data } = useSWR("/api/data", fetcher, {
  revalidateOnFocus: false,
});
```

### 프리패칭

```typescript
// 링크 호버 시 프리패치
<Link href="/dashboard" prefetch>Dashboard</Link>

// 조건부 프리패치
router.prefetch("/likely-next-page");
```

## CSS 최적화

### Critical CSS

```css
/* 중요 스타일은 인라인 */
/* 나머지는 비동기 로드 */
```

### 선택자 최적화

```css
/* Good - 단순 선택자 */
.button { }
.card-title { }

/* Bad - 복잡한 선택자 */
div.container > ul.list > li.item > a.link { }
```

## 금지 사항

- `document.write()` 사용
- 동기적 스크립트 로드
- 레이아웃 쓰레싱 (연속적 DOM 읽기/쓰기)
- 거대한 번들 단일 로드
- 최적화 없는 이미지 사용
