---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
---

# Logging

로깅 원칙입니다.

## 핵심 원칙

**구조화된 로깅**: 검색과 분석이 가능한 형태로 로그를 남깁니다.

## 로그 레벨

| Level | 용도 |
|-------|------|
| `error` | 즉시 대응 필요한 오류 |
| `warn` | 잠재적 문제, 비정상 상황 |
| `info` | 주요 이벤트, 상태 변경 |
| `debug` | 디버깅용 상세 정보 |

## 구조화된 로깅

### JSON 형식 (권장)

```typescript
// Good - 구조화된 로그
logger.info("User logged in", {
  userId: user.id,
  email: user.email,
  method: "oauth",
  duration: 150,
});

// Output: {"level":"info","message":"User logged in","userId":"123","email":"user@example.com","method":"oauth","duration":150,"timestamp":"2024-01-15T10:30:00Z"}

// Bad - 문자열 연결
logger.info(`User ${user.id} logged in via oauth in 150ms`);
```

### 컨텍스트 포함

```typescript
// 요청 컨텍스트
logger.info("Processing request", {
  requestId: req.id,
  path: req.path,
  method: req.method,
  userId: req.user?.id,
});

// 에러 컨텍스트
logger.error("Failed to process payment", {
  error: error.message,
  stack: error.stack,
  orderId: order.id,
  amount: order.total,
});
```

## 로깅 대상

### 필수 로깅

```typescript
// 인증 이벤트
logger.info("User authenticated", { userId, method });
logger.warn("Authentication failed", { email, reason });

// 중요 비즈니스 이벤트
logger.info("Order placed", { orderId, userId, amount });
logger.info("Payment processed", { paymentId, status });

// 에러
logger.error("Database connection failed", { host, error });
logger.error("External API error", { service, statusCode, error });
```

### 디버그 로깅

```typescript
// 개발/디버깅 시에만
logger.debug("Cache lookup", { key, hit: true });
logger.debug("Query executed", { sql, duration: 5 });
```

## 금지 사항

### console.log 사용

```typescript
// Bad - 프로덕션에서 console 사용
console.log("User:", user);
console.error("Error:", error);

// Good - 로거 사용
logger.info("User data", { user });
logger.error("Error occurred", { error: error.message });
```

### 민감 정보 로깅

```typescript
// Bad - 민감 정보 노출
logger.info("Login attempt", { password });
logger.info("User data", { creditCard });
logger.info("API call", { apiKey });

// Good - 마스킹 또는 제외
logger.info("Login attempt", { email });
logger.info("User data", { cardLast4: "****1234" });
```

### 과도한 로깅

```typescript
// Bad - 루프 내 로깅
for (const item of items) {
  logger.info("Processing item", { item });  // 성능 저하
}

// Good - 요약 로깅
logger.info("Processing items", { count: items.length });
// ... 처리
logger.info("Items processed", { success: 95, failed: 5 });
```

## 환경별 설정

```typescript
// 개발: debug 이상
// 스테이징: info 이상
// 프로덕션: info 이상 (debug 비활성화)

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: process.env.NODE_ENV === "production" ? "json" : "pretty",
});
```

## 에러 로깅 패턴

```typescript
// 에러 객체 전체 로깅
logger.error("Operation failed", {
  error: {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  },
  context: {
    operation: "createUser",
    input: { email },  // 민감정보 제외
  },
});
```
