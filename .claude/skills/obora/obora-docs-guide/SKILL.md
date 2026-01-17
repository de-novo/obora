---
name: obora-docs-guide
description: 문서 작성 가이드. SSOT 원칙, 문서 구조, 중복 방지 규칙. 문서 작성이나 검토 시 자동 적용.
allowed-tools: Read, Glob, Grep
user-invocable: true
---

# Documentation Guide Skill

일관된 문서 작성을 위한 가이드라인과 원칙을 제공하는 스킬입니다.

## 사용 시점

- 새 문서 작성 시
- 기존 문서 수정 시
- 문서 구조 설계 시
- 문서 리뷰 시

## 핵심 원칙

### Single Source of Truth (SSOT)

```yaml
원칙:
  - 같은 정보는 한 곳에서만 정의
  - 다른 곳에서는 참조 링크 사용
  - 원천 문서는 명확히 식별 가능

위반_예시:
  - 같은 설정값이 3개 파일에 각각 설명
  - 같은 절차가 여러 곳에 복사-붙여넣기
  - 원천 없이 파생 설명만 존재

올바른_예시:
  - 원천: docs/authentication.md (상세 설명)
  - 참조: "자세한 내용은 [인증 가이드](./authentication.md) 참고"
```

### 문서 생성 전 확인

```yaml
필수_확인:
  1. 기존 문서 검색:
     - Glob: **/*.md (키워드)
     - Grep: (주제) in **/*.md

  2. 중복 여부 판단:
     - 동일 주제 문서 존재?
     - 기존 문서에 섹션 추가로 해결?
     - 참조/링크로 연결 가능?

  3. 기존 문서 확장 우선:
     - 새 문서보다 기존 문서 섹션 추가 권장
```

## 문서 구조 규칙

### 디렉토리 구조

```
docs/
├── README.md               # 개요 + 다른 문서 링크
├── getting-started.md      # 시작 가이드
├── api/
│   ├── README.md           # API 개요
│   └── endpoints.md        # 엔드포인트 상세
├── guides/
│   └── README.md           # 가이드 개요
└── architecture/
    └── README.md           # 아키텍처 개요
```

### 파일 명명 규칙

```yaml
형식: kebab-case
예시:
  - user-guide.md (O)
  - UserGuide.md (X)
  - user_guide.md (X)

금지:
  - 공백 포함
  - 특수문자 (언더스코어 제외)
  - 대문자 (README, LICENSE 제외)
```

### 문서 헤더

```markdown
# 문서 제목

> 한 줄 설명 (선택)

## 개요

이 문서는 [목적]을 설명합니다.

## 목차 (긴 문서의 경우)

- [섹션 1](#섹션-1)
- [섹션 2](#섹션-2)
```

## 문서 분리 기준

### 분리가 필요한 경우

```yaml
허용되는_분리:
  목적_다름:
    - API 문서 vs 사용자 가이드
    - 개발 문서 vs 운영 문서

  대상_독자_다름:
    - 개발자 가이드 vs 최종 사용자 가이드
    - 관리자 가이드 vs 일반 사용자 가이드

  생명주기_다름:
    - 릴리즈 노트 vs 아키텍처 문서
    - 변경 로그 vs 설정 가이드
```

### 분리하면 안 되는 경우

```yaml
금지되는_분리:
  - 같은 주제의 유사 파일 (guide.md + guides.md)
  - 90% 동일한 내용 복사
  - 버전별 분리 (내용이 대부분 같을 때)
```

## 콘텐츠 작성 규칙

### 제목 계층

```markdown
# H1: 문서 제목 (하나만)
## H2: 주요 섹션
### H3: 하위 섹션
#### H4: 세부 항목 (가능하면 피함)
```

### 코드 블록

```markdown
# 언어 명시 필수
```typescript
const example = "code";
```

# 파일 경로 표시 (선택)
```typescript
// src/utils/example.ts
export function example() {}
```
```

### 링크 규칙

```yaml
내부_링크:
  - 상대 경로 사용: [링크](./other-doc.md)
  - 앵커 링크: [섹션](#섹션-이름)

외부_링크:
  - 전체 URL 사용: [외부](https://example.com)
  - 새 탭 열기 표시 권장
```

## 중복 방지

### 중복 탐지 패턴

```yaml
의심_패턴:
  - 같은 코드 블록이 여러 문서에 등장
  - 같은 단계별 절차가 반복
  - 같은 설정값/버전 여러 곳에 명시

탐지_방법:
  1. 주요 키워드로 Grep 검색
  2. 결과에서 2개 이상 파일 발견 시 검토
  3. 유사도 높으면 통합 고려
```

### 중복 해결 방법

```yaml
방법_1_참조:
  - 원천 문서 유지
  - 다른 곳은 링크로 대체
  - "자세한 내용은 [X](./x.md) 참고"

방법_2_통합:
  - 더 완전한 문서에 병합
  - 중복 문서 삭제
  - 참조하던 곳 링크 업데이트

방법_3_추출:
  - 공통 부분을 별도 문서로 추출
  - 여러 문서에서 참조
  - 예: 공통 설정, 공통 절차
```

## 문서 타입별 템플릿

### README.md

```markdown
# 프로젝트명

> 한 줄 설명

## 개요

프로젝트 목적과 주요 기능 설명

## 빠른 시작

```bash
# 설치
npm install

# 실행
npm run dev
```

## 문서

- [시작 가이드](./docs/getting-started.md)
- [API 문서](./docs/api/README.md)

## 기여 방법

[CONTRIBUTING.md](./CONTRIBUTING.md) 참고
```

### API 문서

```markdown
# API 이름

## 개요

API의 목적과 사용 시나리오

## 엔드포인트

### `POST /api/resource`

**설명**: 리소스 생성

**Request Body**:
```json
{
  "field": "string (required)"
}
```

**Response**:
- `201 Created`: 성공
- `400 Bad Request`: 유효성 오류

**예시**:
```bash
curl -X POST /api/resource -d '{"field": "value"}'
```
```

### 가이드 문서

```markdown
# 가이드 제목

## 목표

이 가이드를 완료하면 [결과]를 할 수 있습니다.

## 사전 요구사항

- 요구사항 1
- 요구사항 2

## 단계

### 1단계: [제목]

설명...

### 2단계: [제목]

설명...

## 다음 단계

- [관련 가이드 1](./related-1.md)
- [관련 가이드 2](./related-2.md)
```

## 문서 유지보수

### 정기 점검 항목

```yaml
링크_검증:
  - 깨진 링크 확인
  - 외부 링크 유효성

콘텐츠_검증:
  - 버전 정보 최신화
  - 코드 예시 동작 확인
  - 스크린샷 최신화

구조_검증:
  - 고아 문서 (링크 없는) 확인
  - 중복 문서 확인
  - SSOT 위반 확인
```

### 문서 아카이브

```yaml
아카이브_대상:
  - 더 이상 관련 없는 기능 문서
  - 오래된 버전별 문서
  - 완료된 마이그레이션 가이드

아카이브_방법:
  1. docs/archive/ 디렉토리로 이동
  2. 상단에 "Archived" 표시 추가
  3. 아카이브 날짜와 이유 기록
```

## 참조

- [Google Developer Documentation Style Guide](https://developers.google.com/style)
- [Microsoft Writing Style Guide](https://docs.microsoft.com/style-guide)
