---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs,cs}"
---

# Security Principles

보안을 고려한 코드를 작성합니다.

## 핵심 원칙

1. **모든 외부 입력은 신뢰하지 않음** - 검증 필수
2. **민감 정보 하드코딩 금지** - 환경 변수 사용
3. **파라미터화된 쿼리 사용** - SQL Injection 방지
4. **출력 이스케이프** - XSS 방지
5. **최소 권한 원칙** - 필요한 권한만 부여

## 금지 사항

```typescript
// Bad
const apiKey = "sk-1234567890";
const query = `SELECT * FROM users WHERE id = ${userId}`;
element.innerHTML = userInput;

// Good
const apiKey = process.env.API_KEY;
const query = "SELECT * FROM users WHERE id = ?";
element.textContent = userInput;
```

## 상세 가이드

OWASP Top 10, 코드 패턴, 체크리스트는 `obora-security` 스킬 참조.
