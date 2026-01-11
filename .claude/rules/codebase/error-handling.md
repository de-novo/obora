---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
---

# Error Handling

추적 가능하고 타입 안전한 에러 핸들링을 사용합니다.

## 핵심 원칙

**명시적 에러 흐름**: 에러는 숨겨지지 않고 타입 시스템에서 추적 가능해야 합니다.

## Result 패턴 사용 (권장)

### Result 타입 정의

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// 또는
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### 사용 예시

```typescript
// Good - Result 패턴
async function fetchUser(id: string): Promise<Result<User, ApiError>> {
  const response = await fetch(`/api/users/${id}`);

  if (!response.ok) {
    return {
      success: false,
      error: { code: response.status, message: "Failed to fetch user" }
    };
  }

  const data = await response.json();
  return { success: true, data };
}

// 호출부 - 에러 처리 강제됨
const result = await fetchUser("123");

if (!result.success) {
  // 에러 처리 필수
  logger.error(result.error);
  return;
}

// result.data는 타입 안전
console.log(result.data.name);
```

## try/catch 사용 제한

### 허용되는 경우

```typescript
// 1. 외부 라이브러리 경계
try {
  const data = JSON.parse(rawInput);
} catch {
  return { success: false, error: "Invalid JSON" };
}

// 2. 최상위 에러 바운더리
async function main() {
  try {
    await app.start();
  } catch (error) {
    logger.fatal(error);
    process.exit(1);
  }
}

// 3. 복구 불가능한 예외 처리
try {
  await criticalOperation();
} catch (error) {
  await cleanup();
  throw error; // 재throw
}
```

### 금지되는 경우

```typescript
// Bad - 비즈니스 로직에서 try/catch
async function processOrder(order: Order) {
  try {
    const user = await getUser(order.userId);
    const payment = await processPayment(order);
    return { user, payment };
  } catch (error) {
    // 어떤 에러인지 추적 어려움
    return null;
  }
}

// Bad - 에러 무시
try {
  await sendEmail();
} catch {
  // 무시
}

// Bad - 모든 에러를 같은 방식으로 처리
try {
  // 여러 작업
} catch (error) {
  return "Something went wrong";
}
```

## Result 패턴 유틸리티

```typescript
// 헬퍼 함수
function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// 사용
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return err("Division by zero");
  return ok(a / b);
}
```

## 에러 타입 정의

```typescript
// 도메인별 에러 타입
type ApiError = {
  code: number;
  message: string;
  details?: unknown;
};

type ValidationError = {
  field: string;
  message: string;
};

type AppError =
  | { type: "API_ERROR"; error: ApiError }
  | { type: "VALIDATION_ERROR"; errors: ValidationError[] }
  | { type: "NOT_FOUND"; resource: string };
```

## 비교

| 방식 | 추적 가능 | 타입 안전 | 처리 강제 |
|------|----------|----------|----------|
| Result 패턴 | ✅ | ✅ | ✅ |
| try/catch | ❌ | ❌ | ❌ |
| null 반환 | ❌ | ⚠️ | ❌ |
| throw | ❌ | ❌ | ❌ |

## 라이브러리 옵션

프로젝트 규모에 따라 선택:

- **직접 구현**: 간단한 Result 타입
- **neverthrow**: 경량 Result 라이브러리
- **fp-ts**: 완전한 함수형 프로그래밍 (Either, Option 등)
- **effect**: 고급 에러 처리 및 의존성 관리
