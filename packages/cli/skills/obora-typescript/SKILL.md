---
name: obora-typescript
description: TypeScript 패턴 및 컨벤션. 타입 설계, 에러 처리, 코드 스타일. TypeScript 코드 작성/리뷰 시 자동 적용.
allowed-tools: Read, Glob, Grep
user-invocable: true
---

# TypeScript Patterns Skill

TypeScript 코드 작성을 위한 패턴과 컨벤션을 제공하는 스킬입니다.

## 사용 시점

- TypeScript 코드 작성 시
- 타입 설계 시
- 코드 리뷰 시
- 리팩토링 시

## 타입 설계 패턴

### Branded Types (명목적 타입)

```typescript
// 구조적으로 같지만 의미가 다른 타입 구분
type UserId = string & { readonly brand: unique symbol };
type OrderId = string & { readonly brand: unique symbol };

// 생성 함수
function createUserId(id: string): UserId {
  return id as UserId;
}

// 컴파일 타임 안전성
function getUser(id: UserId) { }
function getOrder(id: OrderId) { }

const userId = createUserId("u123");
const orderId = createOrderId("o456");

getUser(userId);   // OK
getUser(orderId);  // Error: OrderId는 UserId에 할당 불가
```

### Discriminated Union (태그된 유니온)

```typescript
// 상태/타입별 분기 처리
type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

type ApiResponse =
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; message: string };

// 타입 가드와 함께 사용
function handleResponse(response: ApiResponse) {
  switch (response.status) {
    case "loading":
      return <Spinner />;
    case "success":
      return <UserCard user={response.data} />;
    case "error":
      return <Error message={response.message} />;
  }
}
```

### Template Literal Types

```typescript
// 문자열 패턴 타입
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type Endpoint = `/api/${string}`;
type Route = `${HttpMethod} ${Endpoint}`;

// 사용 예시
const route: Route = "GET /api/users";  // OK
const invalid: Route = "PATCH /users";  // Error

// 이벤트 핸들러 패턴
type EventName = "click" | "focus" | "blur";
type Handler = `on${Capitalize<EventName>}`;
// "onClick" | "onFocus" | "onBlur"
```

### Utility Types 활용

```typescript
// 필수 필드 제외한 Partial
type PartialExcept<T, K extends keyof T> =
  Partial<Omit<T, K>> & Pick<T, K>;

// 깊은 Partial
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

// NonNullable 필드만 추출
type NonNullableFields<T> = {
  [K in keyof T as T[K] extends null | undefined
    ? never
    : K]: T[K];
};

// 함수 파라미터 타입 추출
type FirstParam<F> = F extends (first: infer P, ...args: any[]) => any
  ? P
  : never;
```

## 에러 처리 패턴

### Result Pattern (Error를 값으로)

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// 헬퍼 함수
const Ok = <T>(value: T): Result<T, never> =>
  ({ ok: true, value });

const Err = <E>(error: E): Result<never, E> =>
  ({ ok: false, error });

// 사용 예시
async function fetchUser(id: string): Promise<Result<User, FetchError>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      return Err({ code: "NOT_FOUND", message: "User not found" });
    }
    return Ok(await response.json());
  } catch (e) {
    return Err({ code: "NETWORK_ERROR", message: String(e) });
  }
}

// 사용
const result = await fetchUser("123");
if (result.ok) {
  console.log(result.value.name);
} else {
  console.error(result.error.code);
}
```

### Custom Error Classes

```typescript
// 기본 에러 클래스
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 특정 에러 타입
class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields: Record<string, string[]>
  ) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, "NOT_FOUND", 404);
  }
}

// 타입 가드
function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
```

## 코드 스타일

### 함수 시그니처

```typescript
// Good: 명확한 파라미터 타입
function createUser(input: CreateUserInput): Promise<User>

// Good: 옵션 객체 패턴 (파라미터 3개 이상)
function search(options: {
  query: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}): Promise<SearchResult>

// Bad: 위치 기반 많은 파라미터
function search(
  query: string,
  limit: number,
  offset: number,
  sortBy: string,
  sortOrder: string
): Promise<SearchResult>
```

### 타입 내보내기

```typescript
// Good: 인터페이스 (확장 가능)
export interface UserInput {
  name: string;
  email: string;
}

// Good: 타입 별칭 (유니온, 맵드 타입)
export type Status = "active" | "inactive" | "pending";
export type UserRecord = Record<string, User>;

// 내부용 타입은 내보내지 않음
interface InternalState { }  // export 없음
```

### 불변성

```typescript
// readonly 적극 활용
interface User {
  readonly id: string;
  readonly createdAt: Date;
  name: string;  // 변경 가능한 것만 mutable
}

// as const로 리터럴 타입 유지
const ROLES = ["admin", "user", "guest"] as const;
type Role = typeof ROLES[number];  // "admin" | "user" | "guest"

// Object.freeze 대신 타입 시스템 활용
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P];
};
```

### 타입 가드

```typescript
// 사용자 정의 타입 가드
function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "email" in value
  );
}

// in 연산자 활용
function processResponse(response: SuccessResponse | ErrorResponse) {
  if ("data" in response) {
    // SuccessResponse
    return response.data;
  } else {
    // ErrorResponse
    throw new Error(response.error);
  }
}
```

## 금지 패턴

### any 사용 금지

```typescript
// Bad
function process(data: any): any { }
const result: any = fetchData();

// Good: unknown 사용
function process(data: unknown): Result<Data> {
  if (!isValidData(data)) {
    return Err(new ValidationError("Invalid data"));
  }
  return Ok(data);
}

// 정말 필요한 경우만 (라이브러리 통합 등)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacyLib: any = window.legacyLib;
```

### Type Assertion 최소화

```typescript
// Bad: as 남용
const user = response as User;
const id = (data as any).id as string;

// Good: 타입 가드 사용
if (isUser(response)) {
  const user = response;  // 타입 자동 추론
}

// 필요한 경우 명시적 이유 주석
const element = document.getElementById("app") as HTMLDivElement;
// ^ DOM API가 null 반환 가능하지만, 앱 구조상 항상 존재
```

### Non-null Assertion 최소화

```typescript
// Bad: ! 남용
const user = getUser()!;
const name = user.profile!.name!;

// Good: 옵셔널 체이닝 + nullish coalescing
const name = user?.profile?.name ?? "Unknown";

// Good: 조기 반환
const user = getUser();
if (!user) {
  throw new NotFoundError("User");
}
// 이후 user는 non-null
```

## 성능 고려사항

### 타입 복잡도 관리

```typescript
// Bad: 과도한 조건부 타입 중첩
type Complex<T> = T extends A
  ? T extends B
    ? T extends C
      ? ...
      : ...
    : ...
  : ...;

// Good: 단계별 분리
type StepOne<T> = T extends A ? ExtractA<T> : T;
type StepTwo<T> = T extends B ? ExtractB<T> : T;
type Final<T> = StepTwo<StepOne<T>>;
```

### 순환 참조 방지

```typescript
// Bad: 파일 간 순환 참조
// a.ts: import { B } from './b';
// b.ts: import { A } from './a';

// Good: 공통 타입 분리
// types.ts
export interface User { }
export interface Order { }

// user.ts
import type { User, Order } from './types';

// order.ts
import type { User, Order } from './types';
```

## 체크리스트

### 타입 설계

- [ ] any 사용 없음 (불가피한 경우 주석)
- [ ] 적절한 타입 가드 구현
- [ ] Discriminated Union 활용
- [ ] readonly 적극 사용
- [ ] 타입 별칭 의미 있는 이름

### 코드 품질

- [ ] Non-null assertion (!) 최소화
- [ ] 옵셔널 체이닝 활용
- [ ] 적절한 에러 처리
- [ ] 타입 내보내기 적절히

### 성능

- [ ] 과도한 제네릭 중첩 없음
- [ ] 순환 참조 없음
- [ ] 타입 복잡도 적절

## 참조

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Type Challenges](https://github.com/type-challenges/type-challenges)
