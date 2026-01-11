---
paths:
  - "**/package.json"
  - "**/package-lock.json"
  - "**/pnpm-lock.yaml"
  - "**/yarn.lock"
  - "**/requirements.txt"
  - "**/pyproject.toml"
  - "**/go.mod"
  - "**/Cargo.toml"
---

# Keep Libraries Updated

라이브러리는 항상 최신 버전을 유지합니다.

## 핵심 원칙

**최신 버전 우선**: 새 기능, 버그 수정, 보안 패치를 위해 최신 버전을 사용합니다.

## 새 라이브러리 설치 시

### 항상 최신 버전 설치

```bash
# Good - 최신 버전
pnpm add library-name
npm install library-name@latest

# Bad - 오래된 버전 지정
pnpm add library-name@1.0.0  # 최신이 3.x인데 1.x 설치 ❌
```

### 설치 전 버전 확인

```bash
# npm 최신 버전 확인
npm view library-name version

# 또는 공식 문서/GitHub 확인
WebFetch: [라이브러리 GitHub/npm 페이지]
```

## 기존 라이브러리 업데이트

### 정기적 업데이트 확인

```bash
# 업데이트 가능한 패키지 확인
pnpm outdated
npm outdated

# 업데이트 실행
pnpm update
npm update
```

### Major 버전 업데이트

```bash
# Breaking changes 확인 필수
WebFetch: [라이브러리 CHANGELOG/Release Notes]
Prompt: Breaking changes in version X.0.0
```

## 버전 고정 금지

### package.json

```json
// Bad - 버전 고정
{
  "dependencies": {
    "react": "18.0.0",
    "lodash": "4.17.0"
  }
}

// Good - 범위 허용
{
  "dependencies": {
    "react": "^18.2.0",
    "lodash": "^4.17.21"
  }
}
```

### 예외: 버전 고정이 필요한 경우

- 알려진 호환성 문제
- 특정 버전 버그 회피
- 반드시 주석으로 사유 명시

```json
{
  "dependencies": {
    // v2.0.0 호환성 문제 - issue #123 해결 시 업데이트
    "problematic-lib": "1.9.0"
  }
}
```

## 보안 취약점 대응

```bash
# 취약점 확인
pnpm audit
npm audit

# 자동 수정
pnpm audit --fix
npm audit fix
```

보안 취약점 발견 시 즉시 업데이트

## 워크플로우

```
새 라이브러리 → 최신 버전 설치
정기 점검 → pnpm outdated 확인
Major 업데이트 → CHANGELOG 확인 후 적용
보안 경고 → 즉시 대응
```

## 이유

- **보안**: 최신 버전에 보안 패치 포함
- **버그 수정**: 알려진 버그 해결
- **성능 개선**: 최적화 및 개선사항
- **호환성**: 최신 환경과의 호환성 유지
- **지원**: 오래된 버전은 지원 중단 가능
