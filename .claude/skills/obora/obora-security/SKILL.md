---
name: obora-security
description: 보안 점검 체크리스트. OWASP Top 10, 코드 보안 패턴, 취약점 검사 시 사용. 코드 리뷰나 보안 감사 시 자동 적용.
allowed-tools: Read, Grep, Glob
user-invocable: true
---

# Security Checklist Skill

보안 점검을 위한 체크리스트와 패턴을 제공하는 스킬입니다.

## 사용 시점

- 코드 리뷰 시 보안 관점 검토
- 새 기능 구현 시 보안 고려사항 확인
- 보안 감사 실행
- PR 리뷰 시 보안 체크

## OWASP Top 10 (2021)

| 순위 | 취약점 | 설명 | 검토 포인트 |
|------|--------|------|------------|
| A01 | Broken Access Control | 접근 제어 실패 | 인가 검사 누락, 권한 우회 |
| A02 | Cryptographic Failures | 암호화 실패 | 약한 암호화, 평문 저장 |
| A03 | Injection | 인젝션 | SQL, XSS, Command Injection |
| A04 | Insecure Design | 안전하지 않은 설계 | 설계 단계 보안 결함 |
| A05 | Security Misconfiguration | 보안 설정 오류 | 잘못된 설정, 기본값 사용 |
| A06 | Vulnerable Components | 취약한 컴포넌트 | 취약한 의존성 사용 |
| A07 | Auth Failures | 인증 실패 | 인증 우회, 약한 비밀번호 |
| A08 | Data Integrity | 데이터 무결성 | 서명되지 않은 데이터 |
| A09 | Logging Failures | 로깅 실패 | 보안 로깅 부재 |
| A10 | SSRF | 서버 측 요청 위조 | 외부 URL 검증 누락 |

## 취약점 검사 패턴

### Injection 취약점

```yaml
SQL_Injection:
  위험_패턴:
    - "query.*\\$\\{"           # 문자열 보간
    - "execute.*\\+"            # 문자열 연결
    - "raw\\(.*\\$"             # raw 쿼리 + 변수
  안전_패턴:
    - 파라미터화된 쿼리 사용
    - ORM 메서드 사용 (where, findUnique 등)
    - Prepared Statement 사용

XSS:
  위험_패턴:
    - "innerHTML"
    - "dangerouslySetInnerHTML"
    - "document.write"
    - "eval\\("
  안전_패턴:
    - textContent 사용
    - React의 {} (자동 이스케이프)
    - DOMPurify 사용

Command_Injection:
  위험_패턴:
    - "exec\\(.*\\$"
    - "spawn\\(.*\\$"
    - "system\\(.*\\$"
  안전_패턴:
    - 입력 화이트리스트 검증
    - 쉘 메타문자 이스케이프
    - 명령어 인자 배열로 전달
```

### 인증/인가 취약점

```yaml
인증_우회:
  위험_패턴:
    - 인증 미들웨어 없는 라우트
    - JWT 검증 없이 토큰 사용
    - 세션 검사 누락
  검사_방법:
    - 모든 API 라우트에 auth 미들웨어 확인
    - 관리자 라우트 특별 권한 검사
    - 공개 라우트 명시적 표시

인가_실패:
  위험_패턴:
    - 리소스 소유자 검사 누락
    - ID만으로 접근 허용
    - 역할 검사 누락
  안전_패턴:
    - 리소스별 소유자 검증
    - RBAC/ABAC 적용
    - 중앙 집중식 권한 검사
```

### 민감 정보 노출

```yaml
하드코딩_시크릿:
  위험_패턴:
    - "password\\s*=\\s*['\"]"
    - "apiKey\\s*=\\s*['\"]"
    - "secret\\s*=\\s*['\"]"
    - "token\\s*=\\s*['\"]"
    - "AWS_SECRET"
  안전_패턴:
    - 환경 변수 사용 (process.env)
    - Secret Manager 사용
    - .env 파일 (gitignore 필수)

민감_데이터_로깅:
  위험_패턴:
    - "console.log.*password"
    - "logger.*token"
    - "log.*secret"
  안전_패턴:
    - 민감 필드 마스킹
    - 구조화된 로깅
    - 로그 레벨 적절히 설정
```

## 보안 헤더 체크리스트

```yaml
필수_헤더:
  - "Strict-Transport-Security"     # HTTPS 강제
  - "X-Content-Type-Options"        # MIME 스니핑 방지
  - "X-Frame-Options"               # 클릭재킹 방지
  - "Content-Security-Policy"       # CSP

권장_헤더:
  - "X-XSS-Protection"
  - "Referrer-Policy"
  - "Permissions-Policy"

검사_방법:
  - Helmet.js 사용 확인
  - 응답 헤더 직접 확인
  - Security headers 스캐너 사용
```

## 비밀번호 정책

```yaml
최소_요구사항:
  길이: 8자 이상 (권장 12자)
  복잡도:
    - 대문자 포함
    - 소문자 포함
    - 숫자 포함
    - 특수문자 포함 (선택)
  추가:
    - 연속 문자 제한
    - 사전 단어 금지
    - 이전 비밀번호 재사용 금지

해싱:
  권장: bcrypt, argon2
  금지: MD5, SHA1, 평문
  salt: 반드시 사용
  cost_factor: 10 이상
```

## 심각도 기준

| 레벨 | 설명 | 예시 |
|------|------|------|
| **Critical** | 즉시 악용 가능, 심각한 피해 | SQL Injection, RCE |
| **High** | 악용 가능, 중요 데이터 노출 | 인증 우회, 권한 상승 |
| **Medium** | 조건부 악용, 제한적 영향 | XSS (반사형), CSRF |
| **Low** | 보안 강화 권장 | 정보 노출, 약한 암호화 |

## 점검 체크리스트

### 인증 (Authentication)

- [ ] 모든 보호 라우트에 인증 미들웨어 적용
- [ ] JWT/세션 만료 시간 적절히 설정
- [ ] 비밀번호 해싱에 bcrypt/argon2 사용
- [ ] 로그인 실패 시 brute-force 방지
- [ ] 민감한 작업에 재인증 요구

### 인가 (Authorization)

- [ ] 리소스 접근 시 소유자 검증
- [ ] 역할 기반 접근 제어 (RBAC)
- [ ] API 레벨 권한 검사
- [ ] 파일 접근 권한 검증

### 입력 검증

- [ ] 모든 사용자 입력 검증
- [ ] 화이트리스트 기반 검증
- [ ] 파일 업로드 타입/크기 제한
- [ ] URL 파라미터 검증

### 출력 인코딩

- [ ] HTML 출력 시 이스케이프
- [ ] JSON 응답 Content-Type 설정
- [ ] SQL 쿼리 파라미터화

### 설정

- [ ] 프로덕션에서 디버그 모드 비활성화
- [ ] 에러 메시지에 민감 정보 미포함
- [ ] CORS 적절히 설정
- [ ] Rate limiting 적용

## 사용 예시

### 코드 리뷰 시

```
이 코드를 보안 관점에서 검토해주세요.
→ obora-security 스킬이 자동으로 적용되어 OWASP Top 10 기준으로 검토
```

### 보안 감사 실행

```
/obora-security
→ 현재 코드베이스에서 보안 패턴 검사 실행
```

## 참조

- [OWASP Top 10](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
