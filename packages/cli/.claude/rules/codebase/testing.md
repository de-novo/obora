---
globs:
  - "**/*.{test,spec}.{ts,tsx,js,jsx}"
  - "**/__tests__/**/*.{ts,tsx,js,jsx}"
  - "**/test/**/*.{ts,tsx,js,jsx,py}"
  - "**/*_test.{go,py,rb}"
---

# Testing Principles

테스트 코드 작성 시 준수해야 할 원칙들입니다.

## 핵심 원칙

1. **AAA 패턴** - Arrange, Act, Assert
2. **FIRST** - Fast, Independent, Repeatable, Self-validating, Timely
3. **하나의 테스트, 하나의 개념** - 명확한 검증 대상
4. **경계 조건 테스트** - null, 빈 값, 최대/최소

## 테스트 피라미드

```
        /\      E2E (적음)
       /  \
      /----\    통합 (중간)
     /      \
    /--------\  단위 (많음)
```

## 금지 사항

```typescript
// Bad - 모호한 테스트명
it("works correctly", () => { });

// Bad - 여러 개념 검증
it("should create and update user", () => { });

// Good - 명확한 테스트명
it("should return error when email is invalid", () => { });
```

## 상세 가이드

AAA/BDD 패턴, 모킹, 컴포넌트 테스트 예시는 `obora-testing` 스킬 참조.
