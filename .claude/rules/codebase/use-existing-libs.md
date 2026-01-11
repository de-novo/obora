---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs}"
---

# Use Existing Libraries

프로젝트에 이미 설치된 라이브러리를 적극 활용합니다.

## 핵심 원칙

**새 의존성 추가 전, 기존 의존성 확인**: 프로젝트의 `package.json`, `requirements.txt` 등을 먼저 확인합니다.

## 워크플로우

### 1. 기존 의존성 확인

```bash
# package.json 확인
cat package.json | grep -A 100 "dependencies"

# 설치된 패키지 확인
ls node_modules/
```

### 2. 기존 라이브러리 기능 조사

이미 있는 라이브러리가 필요한 기능을 제공하는지 확인:

```bash
# 라이브러리 문서 확인
WebFetch: [라이브러리 공식 문서]
```

### 3. 기존 코드베이스 패턴 확인

```bash
# 프로젝트에서 이미 사용 중인 방식 확인
grep -r "import.*from" src/
```

## 예시

### 날짜 처리

```typescript
// Bad - 프로젝트에 date-fns가 있는데 새 라이브러리 추가
import dayjs from "dayjs"; // 새로 추가 ❌

// Good - 기존 라이브러리 사용
import { format, parseISO } from "date-fns"; // 이미 있음 ✅
```

### HTTP 클라이언트

```typescript
// Bad - axios가 있는데 fetch wrapper 직접 구현
const fetchWrapper = async (url) => { ... }; // ❌

// Good - 기존 라이브러리 사용
import axios from "axios"; // 이미 있음 ✅
```

### 유틸리티

```typescript
// Bad - lodash가 있는데 직접 구현
function debounce(fn, delay) { ... } // ❌

// Good - 기존 라이브러리 사용
import { debounce } from "lodash-es"; // 이미 있음 ✅
```

## 금지 사항

- 기존 라이브러리와 동일 기능의 새 라이브러리 추가
- 기존 라이브러리가 제공하는 기능 직접 재구현
- 확인 없이 새 의존성 추가

## 새 라이브러리 추가 조건

다음 모든 조건 충족 시에만 추가:

- [ ] 기존 의존성에 해당 기능 없음
- [ ] 직접 구현보다 라이브러리가 더 적합
- [ ] 유지보수가 활발한 라이브러리
- [ ] 번들 크기 영향 검토 완료

## 이유

- **번들 크기**: 중복 라이브러리는 번들 크기 증가
- **일관성**: 같은 기능에 여러 방식 혼재 방지
- **유지보수**: 의존성 수 최소화
- **학습 비용**: 팀원이 알아야 할 라이브러리 수 제한
