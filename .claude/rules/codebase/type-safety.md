---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# Type Safety

타입 안전성을 최대화합니다.

## 핵심 원칙

**any 사용 금지**: 타입 시스템의 이점을 포기하지 않습니다.

## 금지 사항

### any 타입

```typescript
// Bad
function process(data: any) { }
const result: any = fetchData();
const items = [] as any[];

// Good
function process(data: unknown) { }
function process<T>(data: T) { }
const result: ApiResponse = fetchData();
```

### 타입 단언 남용

```typescript
// Bad
const user = data as User;
const element = document.getElementById("app") as HTMLDivElement;

// Good
const user: User = validateUser(data);
const element = document.getElementById("app");
if (element instanceof HTMLDivElement) { }
```

### 암시적 any

```typescript
// Bad - noImplicitAny 위반
function process(data) { }  // data: any
const fn = (x) => x * 2;    // x: any

// Good
function process(data: string) { }
const fn = (x: number) => x * 2;
```

## 권장 사항

### unknown 사용

```typescript
// 타입을 모를 때
function handleResponse(data: unknown) {
  if (typeof data === "string") {
    // data: string
  }
  if (isUser(data)) {
    // data: User
  }
}
```

### 제네릭 활용

```typescript
// 유연하면서 타입 안전
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

function map<T, U>(arr: T[], fn: (item: T) => U): U[] {
  return arr.map(fn);
}
```

### 타입 가드

```typescript
// 타입 좁히기
function isUser(data: unknown): data is User {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    "name" in data
  );
}
```

### Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## 허용되는 예외

```typescript
// 1. 외부 라이브러리 타입 부재 (임시)
declare module "untyped-lib";

// 2. 테스트 목 (제한적)
const mockFn = vi.fn() as any; // 테스트 한정

// 3. JSON.parse (즉시 검증 필요)
const data: unknown = JSON.parse(raw);
const validated = schema.parse(data); // zod 등으로 검증
```

## 이유

- **컴파일 타임 에러 발견**: 런타임 전에 버그 발견
- **자동 완성**: IDE 지원 향상
- **리팩토링 안전성**: 타입 변경 시 영향 범위 파악
- **문서화**: 코드 자체가 문서 역할
