---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
---

# Async Patterns

비동기 코드의 일관된 패턴을 사용합니다.

## 핵심 원칙

**async/await 우선**: 가독성과 에러 핸들링을 위해 async/await를 기본으로 사용합니다.

## 권장 패턴

### async/await 사용

```typescript
// Good
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();
  return data;
}

// Bad - 불필요한 Promise chain
function fetchUser(id: string): Promise<User> {
  return fetch(`/api/users/${id}`)
    .then(response => response.json())
    .then(data => data);
}
```

### 병렬 실행

```typescript
// Good - 독립적인 작업 병렬 처리
const [user, posts, comments] = await Promise.all([
  fetchUser(id),
  fetchPosts(id),
  fetchComments(id),
]);

// Bad - 불필요한 순차 실행
const user = await fetchUser(id);
const posts = await fetchPosts(id);
const comments = await fetchComments(id);
```

### Promise.allSettled

```typescript
// 일부 실패해도 계속 진행
const results = await Promise.allSettled([
  sendEmail(user1),
  sendEmail(user2),
  sendEmail(user3),
]);

const succeeded = results.filter(r => r.status === "fulfilled");
const failed = results.filter(r => r.status === "rejected");
```

### 에러 핸들링

```typescript
// Good - Result 패턴 (error-handling.md 참조)
async function fetchUser(id: string): Promise<Result<User, FetchError>> {
  const response = await fetch(`/api/users/${id}`);

  if (!response.ok) {
    return err(new FetchError(response.status));
  }

  return ok(await response.json());
}

// 필요시 try-catch (외부 API 등)
async function callExternalApi(): Promise<Result<Data, ApiError>> {
  try {
    const data = await externalSdk.call();
    return ok(data);
  } catch (error) {
    return err(new ApiError(error));
  }
}
```

## 금지 패턴

### 콜백 지옥

```typescript
// Bad
fetchUser(id, (user) => {
  fetchPosts(user.id, (posts) => {
    fetchComments(posts[0].id, (comments) => {
      // ...
    });
  });
});
```

### async void (이벤트 핸들러 제외)

```typescript
// Bad - 에러 추적 불가
async function processData(): void {
  await doSomething();
}

// Good
async function processData(): Promise<void> {
  await doSomething();
}

// 예외 - 이벤트 핸들러
button.addEventListener("click", async () => {
  await handleClick();
});
```

### 불필요한 await

```typescript
// Bad
async function getData() {
  return await fetchData();  // 불필요한 await
}

// Good
async function getData() {
  return fetchData();
}

// 예외 - try-catch 내부
async function getData() {
  try {
    return await fetchData();  // catch를 위해 필요
  } catch (error) {
    return handleError(error);
  }
}
```

### Promise 생성자 anti-pattern

```typescript
// Bad
function delay(ms: number): Promise<void> {
  return new Promise(async (resolve) => {
    await someAsyncWork();
    resolve();
  });
}

// Good
async function delay(ms: number): Promise<void> {
  await someAsyncWork();
}
```

## 취소 패턴

### AbortController 사용

```typescript
async function fetchWithCancel(
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(url, { signal });
}

// 사용
const controller = new AbortController();
const promise = fetchWithCancel("/api/data", controller.signal);

// 취소
controller.abort();
```

## 타임아웃 패턴

```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Timeout")), ms);
  });

  return Promise.race([promise, timeout]);
}
```

## 재시도 패턴

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      await sleep(delay * Math.pow(2, i)); // exponential backoff
    }
  }

  throw lastError!;
}
```
