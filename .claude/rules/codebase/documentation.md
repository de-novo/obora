---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
---

# Documentation

코드 문서화 원칙입니다.

## 핵심 원칙

**코드가 문서**: 이해하기 쉬운 코드가 최고의 문서입니다.

## 주석 최소화

### 자명한 코드는 주석 불필요

```typescript
// Bad - 불필요한 주석
// 사용자 이름을 가져옴
const userName = user.name;

// 아이템 개수를 증가시킴
count++;

// Good - 주석 없이 명확한 코드
const userName = user.name;
count++;
```

### 의도를 설명하는 주석만

```typescript
// Good - 왜 이렇게 하는지 설명
// 레거시 API 호환성을 위해 ISO 8601 대신 Unix timestamp 사용
const timestamp = Math.floor(date.getTime() / 1000);

// 브라우저 캐시 이슈로 인해 쿼리 파라미터 추가
const url = `${baseUrl}?v=${version}`;
```

## JSDoc 사용

### 공개 API에만

```typescript
/**
 * 사용자 인증을 수행합니다.
 *
 * @param credentials - 로그인 정보
 * @returns 인증 성공 시 사용자 정보, 실패 시 에러
 *
 * @example
 * const result = await authenticate({ email: "user@example.com", password: "***" });
 * if (result.ok) {
 *   console.log(result.value.user);
 * }
 */
export async function authenticate(
  credentials: Credentials
): Promise<Result<AuthResult, AuthError>> {
  // ...
}
```

### 복잡한 타입

```typescript
/**
 * API 응답 래퍼
 *
 * @template T - 성공 시 데이터 타입
 * @template E - 에러 타입
 */
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

## README 구조

```markdown
# Project Name

한 줄 설명

## 설치

## 사용법

## 설정

## 기여
```

## TODO 주석

### 형식

```typescript
// TODO(username): 설명 - ISSUE-123
// FIXME(username): 버그 설명 - ISSUE-456
// HACK(username): 왜 임시 해결책인지 설명

// Bad - 정보 없는 TODO
// TODO: fix this
// FIXME: broken
```

### 정리 의무

- TODO는 이슈 트래커에도 등록
- 오래된 TODO 정기적으로 정리

## 금지 사항

### 죽은 코드 주석

```typescript
// Bad - 주석 처리된 코드
// const oldFunction = () => { ... };
// if (false) { ... }

// Good - 삭제 (Git에 히스토리 있음)
```

### 자동 생성 주석

```typescript
// Bad - IDE가 자동 생성한 의미없는 주석
/**
 * Constructor
 */
constructor() { }

/**
 * Gets the name
 * @returns the name
 */
getName() { return this.name; }
```

### 히스토리 주석

```typescript
// Bad - 변경 이력
// 2024-01-15 - John: added validation
// 2024-01-20 - Jane: fixed bug

// Good - Git 커밋 히스토리 사용
```

## 자기 문서화 코드

```typescript
// Bad - 주석으로 설명
// 18세 이상인지 확인
if (age >= 18) { }

// Good - 의미 있는 이름으로 자명하게
const isAdult = age >= 18;
if (isAdult) { }

// Bad - 매직 넘버
if (status === 1) { }

// Good - 상수로 의미 부여
const STATUS_ACTIVE = 1;
if (status === STATUS_ACTIVE) { }
```
