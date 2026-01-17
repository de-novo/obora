---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs}"
---

# Naming Conventions

일관된 명명 규칙을 사용합니다.

## 파일명

### TypeScript/JavaScript

```
# 컴포넌트 - PascalCase (React 규칙)
UserProfile.tsx
PaymentForm.tsx

# 유틸/훅/서비스 - kebab-case
use-auth.ts
format-date.ts
api-client.ts

# 상수/설정 - kebab-case
constants.ts
app-config.ts

# 타입/인터페이스 - kebab-case
user.types.ts
api-response.ts

# 테스트 - 원본파일.test.ts
UserProfile.test.tsx
format-date.test.ts
```

### 디렉토리

```
# kebab-case
user-profile/
api-routes/
auth-providers/
```

## 변수명

### camelCase (기본)

```typescript
const userName = "John";
const isLoggedIn = true;
const itemCount = 42;
let currentIndex = 0;
```

### UPPER_SNAKE_CASE (상수)

```typescript
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "https://api.example.com";
const DEFAULT_TIMEOUT = 5000;
```

### PascalCase (타입/클래스/컴포넌트)

```typescript
type UserProfile = { };
interface ApiResponse { }
class PaymentService { }
function UserCard() { }
```

## 함수명

### 동사로 시작

```typescript
// Good
function getUser() { }
function createOrder() { }
function updateProfile() { }
function deleteItem() { }
function validateInput() { }
function handleClick() { }
function formatDate() { }

// Bad
function user() { }
function orderCreation() { }
function profileData() { }
```

### Boolean 반환 - is/has/can/should

```typescript
function isValid() { }
function hasPermission() { }
function canEdit() { }
function shouldRefresh() { }
```

### 이벤트 핸들러 - handle/on

```typescript
function handleSubmit() { }
function handleClick() { }
function onSuccess() { }
function onError() { }
```

## 금지 사항

### 약어 남용

```typescript
// Bad
const usr = getUsr();
const btn = document.querySelector(".btn");
const idx = arr.findIndex();

// Good
const user = getUser();
const button = document.querySelector(".button");
const index = arr.findIndex();
```

### 숫자/한 글자 변수

```typescript
// Bad (루프 인덱스 제외)
const x = calculate();
const temp1 = getData();

// Good
const total = calculate();
const userData = getData();
```

### 헝가리안 표기법

```typescript
// Bad
const strName = "John";
const arrItems = [];
const objUser = {};

// Good
const name = "John";
const items = [];
const user = {};
```

## 예외

```typescript
// 짧은 스코프의 루프 변수
for (let i = 0; i < items.length; i++) { }
items.map((x) => x * 2);

// 관례적 약어
const id = user.id;
const url = "https://...";
const api = createApi();
```
