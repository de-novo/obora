---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs,cs}"
---

# No Hardcoded Data

임시 데이터, mock 데이터를 함수 내부에 하드코딩하지 않습니다.

## 핵심 원칙

**추적 가능성**: 모든 데이터는 출처가 명확하고 추적 가능해야 합니다.

## 금지 사항

### 함수 내부 하드코딩

```typescript
// Bad
function getUsers() {
  // TODO: API 연결 후 삭제
  return [
    { id: 1, name: "John" },
    { id: 2, name: "Jane" },
  ];
}

// Bad
async function fetchProducts() {
  // 임시 데이터
  const mockProducts = [{ id: 1, name: "Product A" }];
  return mockProducts;
}
```

### 임시 주석과 함께 있는 데이터

```typescript
// Bad
const API_URL = "http://localhost:3000"; // TODO: 나중에 변경
const TEMP_USER_ID = 123; // 테스트용
```

## 허용되는 방법

### 1. 전용 Mock/Fixture 파일

```
src/
├── __mocks__/
│   └── users.ts
├── __fixtures__/
│   └── products.json
└── test/
    └── fixtures/
```

```typescript
// src/__mocks__/users.ts
export const mockUsers = [
  { id: 1, name: "John" },
  { id: 2, name: "Jane" },
];
```

### 2. 환경 변수 또는 설정 파일

```typescript
// Good
const API_URL = process.env.API_URL;
const config = await loadConfig();
```

### 3. Factory 함수 (테스트용)

```typescript
// Good - test/factories/user.ts
export function createMockUser(overrides = {}) {
  return {
    id: faker.number.int(),
    name: faker.person.fullName(),
    ...overrides,
  };
}
```

### 4. 명시적 개발 모드 분기

```typescript
// Good - 명시적이고 추적 가능
if (process.env.NODE_ENV === "development" && !API_AVAILABLE) {
  return getMockData(); // 별도 파일에서 import
}
```

## 이유

- **추적 어려움**: 흩어진 mock 데이터는 찾기 어려움
- **삭제 누락**: "나중에 삭제" 주석은 대부분 남아있음
- **일관성 부재**: 같은 mock이 여러 곳에 다르게 정의됨
- **디버깅 혼란**: 실제 데이터인지 mock인지 구분 어려움

## 체크리스트

mock/임시 데이터 필요 시:
- [ ] 전용 디렉토리에 분리했는가?
- [ ] 파일명이 mock/fixture임을 명시하는가?
- [ ] 사용처에서 import 경로로 mock임을 알 수 있는가?
- [ ] 환경/조건에 따른 분기가 명시적인가?
