# CLI 태스크 로드맵

Obora CLI 개발 태스크 목록입니다.

> 마지막 업데이트: 2026-01-24

---

## 현재 상태 요약

| 영역 | 완성도 |
|------|--------|
| CLI 명령어 | 17개 구현됨 |
| Transform 타입 | 8개 구현됨 |
| Preset | 22개 구현됨 |
| 테스트 | 주요 명령어 커버됨 |

---

## P1 - 우선순위 높음

### 1.1 Variants 시스템 완성

**상태**: ✅ 완료

**배경**: manifest.json에 `variants` 필드가 정의되어 있지만, 실제 선택 UI와 적용 로직이 미완성.

**목표**:
- ORM preset에서 SQLite/PostgreSQL 선택
- Auth preset에서 세션/JWT 방식 선택
- Interactive 프롬프트로 variant 선택

**관련 파일**:
- `src/commands/add.ts`
- `presets/database/prisma/manifest.json`
- `presets/database/drizzle/manifest.json`

**작업 항목**:
- [x] variant 선택 프롬프트 구현
- [x] variant 병합 로직 구현
- [x] prisma preset에 sqlite/postgres variant 추가
- [x] drizzle preset에 dialect variant 추가
- [x] 테스트 작성

---

### 1.2 Interactive 모드

**상태**: ✅ 완료

**목표**: `obora add` 실행 시 프롬프트로 옵션 선택 가능

**기능**:
```bash
$ obora add

? Select category: (Use arrow keys)
❯ database
  auth
  ui
  ...

? Select preset: (Use arrow keys)
❯ prisma
  drizzle

? Select variant: (Use arrow keys)
❯ sqlite (Recommended for development)
  postgres (Recommended for production)
```

**관련 파일**:
- `src/commands/add.ts`
- `src/utils/prompts.ts`

**작업 항목**:
- [x] 카테고리 선택 프롬프트
- [x] preset 선택 프롬프트
- [x] variant 선택 프롬프트 (해당 시)
- [x] --interactive / -i 플래그 추가

---

### 1.3 Preset 브라우저

**상태**: ✅ 완료

**목표**: 사용 가능한 preset 목록 조회

**기능**:
```bash
$ obora list --available

Available Presets:

database (exclusive)
  ├─ prisma      - Prisma ORM with type-safe queries
  └─ drizzle     - Drizzle ORM with SQL-like syntax

auth (exclusive)
  ├─ clerk       - Clerk authentication
  └─ better-auth - Better Auth with multiple providers

...
```

**관련 파일**:
- `src/commands/list.ts`
- `src/utils/constants.ts`

**작업 항목**:
- [x] --available 플래그 추가
- [x] 카테고리별 그룹화 출력
- [x] preset 설명 표시
- [x] exclusive 표시

---

## P2 - 중요

### 2.1 Conflict 해결 UI

**상태**: 🟡 기본 구현

**배경**: 현재는 충돌 시 에러만 표시. 사용자가 선택할 수 있어야 함.

**목표**:
```bash
$ obora add drizzle

⚠ Conflict detected:
  prisma (database) is already installed.

? How do you want to proceed?
❯ Replace prisma with drizzle
  Keep prisma (cancel)
  Install both (not recommended)
```

**관련 파일**:
- `src/commands/add.ts`
- `src/utils/prompts.ts`

**작업 항목**:
- [ ] 충돌 감지 시 프롬프트 표시
- [ ] replace 옵션 구현 (remove + add)
- [ ] 경고 메시지 개선

---

### 2.2 Preset 의존성 체인

**상태**: ✅ 완료

**배경**: `requires` 필드는 있지만, 자동 설치 로직이 미흡.

**목표**:
```bash
$ obora add clerk

ℹ clerk requires tanstack-query
? Install tanstack-query as well? (Y/n)
```

**관련 파일**:
- `src/commands/add.ts`
- preset manifest.json들

**작업 항목**:
- [x] requires 자동 해결 로직
- [x] 의존성 설치 확인 프롬프트
- [x] 순환 의존성 검사

---

### 2.3 Conditional Transform

**상태**: ✅ 완료

**목표**: 파일 존재 여부 등 조건에 따른 transform 실행

```json
{
  "transform": [
    {
      "type": "import",
      "condition": { "fileExists": "app/providers.tsx" },
      "target": "app/providers.tsx",
      "spec": { ... }
    }
  ]
}
```

**관련 파일**:
- `src/utils/transform.ts`
- `src/commands/add.ts`

**작업 항목**:
- [x] condition 스키마 정의
- [x] fileExists 조건 구현
- [x] envVar 조건 구현
- [x] 테스트 작성

---

## P3 - 생태계 확장

### 3.1 원격 Preset 지원

**상태**: 🔴 미구현

**목표**: GitHub/npm에서 preset 설치

```bash
# GitHub에서 설치
obora add github:user/my-preset

# npm에서 설치
obora add npm:@company/preset-auth
```

**관련 파일**:
- `src/commands/add.ts`
- 새 파일: `src/utils/remote-preset.ts`

**작업 항목**:
- [ ] giget 활용한 GitHub 클론
- [ ] npm 패키지 다운로드
- [ ] 캐시 시스템
- [ ] 버전 관리

---

### 3.2 Preset 생성 CLI

**상태**: 🔴 미구현

**목표**: `obora create preset` 명령어로 preset 스캐폴딩

```bash
$ obora create preset my-preset

? Category: database
? Description: My custom database preset
? Exclusive: Yes

✓ Created presets/database/my-preset/
  ├─ manifest.json
  └─ README.md
```

**관련 파일**:
- `src/commands/create.ts` (확장)
- 새 파일: `src/utils/preset-scaffold.ts`

**작업 항목**:
- [ ] create preset 서브커맨드
- [ ] manifest.json 템플릿
- [ ] 카테고리 선택 프롬프트
- [ ] README 자동 생성

---

### 3.3 Preset 검증 강화

**상태**: 🟡 기본 구현

**목표**: manifest.json 스키마 검증 강화

**관련 파일**:
- `presets/preset.schema.json`
- `src/utils/preset-validator.ts`

**작업 항목**:
- [ ] JSON Schema 기반 검증
- [ ] transform spec 검증
- [ ] 파일 경로 검증
- [ ] `obora doctor --presets` 추가

---

## P4 - 기능 개선

### 4.1 에러 메시지 표준화

**상태**: 🟡 부분 구현

**목표**: 모든 에러에 일관된 포맷과 해결 방법 제시

```
✖ Transform failed: Could not find {children} in providers.tsx

Expected:
  return <>{children}</>

Solution:
  1. Open app/providers.tsx
  2. Ensure the Providers component returns {children}
  3. Run the command again

Documentation: https://obora.dev/docs/errors/transform-001
```

**작업 항목**:
- [ ] 에러 코드 체계 정의
- [ ] 에러별 해결 방법 문서화
- [ ] 링크 추가

---

### 4.2 진행 상황 개선

**상태**: 🟡 기본 구현

**목표**: 더 상세한 진행 표시

```
⠋ Installing clerk...
  ├─ Adding dependencies (3/5)
  ├─ Transforming providers.tsx
  └─ Running postInstall scripts
```

**관련 파일**:
- `src/utils/progress.ts`
- `src/commands/add.ts`

---

### 4.3 Undo 기능

**상태**: 🔴 미구현

**목표**: 마지막 작업 취소

```bash
$ obora add clerk
✓ Installed clerk

$ obora undo
? Undo "add clerk"? (Y/n)
✓ Reverted changes
```

**작업 항목**:
- [ ] 작업 히스토리 저장
- [ ] 파일 백업 시스템
- [ ] undo 명령어 구현

---

## 완료된 작업

### ✅ 최근 완료

| 작업 | 완료일 | 커밋 |
|------|--------|------|
| P2.3 Conditional Transform | 2026-01-24 | - |
| P2.2 Preset 의존성 체인 | 2026-01-24 | 5cf6a4f |
| P2.1 Conflict 해결 UI | 2026-01-24 | bbf8a80 |
| P1.1 Variants 시스템 (sqlite/postgres) | 2026-01-24 | 869142d |
| P1.2 Interactive 모드 | 2026-01-24 | 869142d |
| P1.3 Preset 브라우저 | 2026-01-24 | 869142d |
| 템플릿 시스템 외부화 | 2026-01-24 | b2ed739 |
| Transform 에러 메시지 개선 | 2026-01-24 | b2ed739 |
| layout.tsx 자동 생성 | 2026-01-24 | 710758a |
| vercel-analytics preset | 2026-01-24 | b23600c |
| layout-component transform | 2026-01-24 | 393d7ed |

---

## 참고

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 아키텍처 문서
- [transform-system.md](./transform-system.md) - Transform 시스템 상세
