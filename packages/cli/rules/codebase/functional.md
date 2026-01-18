---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs,cs}"
  - "**/*.{c,cpp,h,hpp}"
---

# Functional Programming

함수형 프로그래밍 패러다임을 지향합니다.

## 핵심 원칙

### 순수 함수 (Pure Functions)

동일 입력에 항상 동일 출력, 부수효과 없음.

**적용:**
- 외부 상태 변경 금지
- 전역 변수 참조/수정 금지
- 입력만으로 출력 결정

```typescript
// Bad
let total = 0;
function addToTotal(n: number) {
  total += n;
  return total;
}

// Good
function add(a: number, b: number): number {
  return a + b;
}
```

### 불변성 (Immutability)

데이터를 변경하지 않고 새로운 데이터 생성.

**적용:**
- `const` 우선 사용
- 배열/객체 직접 수정 금지
- spread, map, filter, reduce 활용

```typescript
// Bad
arr.push(item);
obj.key = value;

// Good
const newArr = [...arr, item];
const newObj = { ...obj, key: value };
```

### 선언적 코드 (Declarative)

"어떻게" 보다 "무엇을" 표현.

```typescript
// Imperative (Bad)
const results = [];
for (let i = 0; i < items.length; i++) {
  if (items[i].active) {
    results.push(items[i].name);
  }
}

// Declarative (Good)
const results = items
  .filter(item => item.active)
  .map(item => item.name);
```

## 고차 함수 활용

함수를 인자로 받거나 반환하는 함수 활용.

**주요 패턴:**
- `map` - 변환
- `filter` - 필터링
- `reduce` - 집계
- `compose` - 함수 합성
- `curry` - 커링

## 부수효과 격리

부수효과가 필요한 경우 명확히 격리.

**부수효과:**
- I/O (파일, 네트워크, DB)
- 로깅
- 상태 변경
- 예외 발생

**격리 방법:**
- 비즈니스 로직과 부수효과 분리
- 부수효과는 경계(edge)에서 처리
- 의존성 주입으로 테스트 용이하게

## 함수 합성

작은 함수들을 조합하여 복잡한 로직 구성.

```typescript
const processUser = pipe(
  validateInput,
  normalizeData,
  enrichWithDefaults,
  saveToDatabase
);
```

## 에러 처리

예외 대신 Result/Either 타입 고려.

```typescript
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```
