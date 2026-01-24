# Preset 가이드

Obora CLI의 Preset 시스템 사용법입니다.

> 마지막 업데이트: 2026-01-25

---

## 개요

Preset은 프로젝트에 특정 기능을 추가하는 사전 정의된 설정 패키지입니다.

```bash
# preset 설치
obora add <preset-name>

# 예시
obora add prisma
obora add tanstack-query
obora add clerk
```

---

## 사용 가능한 Preset

### 카테고리별 목록

| 카테고리 | 배타적 | Preset 목록 |
|----------|--------|-------------|
| **linting** | ✅ | `eslint-prettier`, `biome` |
| **database** | ✅ | `prisma`, `drizzle` |
| **auth** | ✅ | `clerk`, `better-auth` |
| **payment** | ✅ | `polar`, `paddle` |
| **email** | ✅ | `resend` |
| **storage** | ✅ | `uploadthing`, `cloudflare-r2` |
| **validation** | ✅ | `zod`, `effect-schema` |
| **testing** | ✅ | `vitest`, `playwright` |
| **analytics** | ❌ | `posthog`, `umami`, `vercel-analytics` |
| **data-fetching** | ❌ | `tanstack-query` |
| **state** | ❌ | `zustand`, `jotai`, `nuqs` |
| **i18n** | ❌ | `next-intl` |
| **theming** | ❌ | `next-themes` |
| **ui** | ❌ | `shadcn`, `shadcn-all`, `base-ui` |
| **ai** | ❌ | `vercel-ai` |
| **form** | ❌ | `react-hook-form` |

**배타적 카테고리**: 한 프로젝트에 하나만 설치 가능 (예: prisma와 drizzle 동시 설치 불가)

---

## 명령어

### 설치

```bash
# 기본 설치
obora add <preset>

# Interactive 모드 (카테고리/preset 선택)
obora add -i
obora add --interactive

# Variant 선택 (해당되는 경우)
obora add prisma --variant postgres
obora add drizzle --variant sqlite
```

### 제거

```bash
obora remove <preset>
```

### 목록 조회

```bash
# 설치된 preset 조회
obora list

# 사용 가능한 preset 조회
obora list --available
```

### 실행 취소

```bash
# 마지막 작업 취소
obora undo
```

---

## Variant 시스템

일부 preset은 variant를 지원합니다.

### Database Preset Variants

**Prisma**
- `sqlite` (기본값) - 개발 환경용
- `postgres` - 프로덕션 환경용

**Drizzle**
- `sqlite` (기본값)
- `postgres`
- `mysql`

```bash
# variant 지정
obora add prisma --variant postgres

# interactive 모드에서 선택
obora add -i
# → database 선택 → prisma 선택 → postgres 선택
```

---

## 의존성 관계

### requires (의존)

일부 preset은 다른 preset을 필요로 합니다.

```bash
$ obora add clerk

ℹ clerk requires tanstack-query
? Install tanstack-query as well? (Y/n)
```

### conflicts (충돌)

같은 배타적 카테고리의 preset은 충돌합니다.

```bash
$ obora add drizzle

⚠ Conflict detected:
  prisma (database) is already installed.

? How do you want to proceed?
❯ Replace prisma with drizzle
  Keep prisma (cancel)
```

---

## Preset 상세

### Database

#### prisma

Prisma ORM with type-safe database client.

```bash
obora add prisma
obora add prisma --variant postgres
```

**생성 파일**:
- `lib/db.ts` - Prisma client instance
- `prisma/schema.prisma` - Database schema

**환경 변수**:
- `DATABASE_URL` - Database connection string

#### drizzle

Drizzle ORM with SQL-like TypeScript syntax.

```bash
obora add drizzle
obora add drizzle --variant postgres
```

**생성 파일**:
- `lib/db.ts` - Drizzle instance
- `drizzle.config.ts` - Drizzle configuration
- `lib/schema.ts` - Database schema

---

### Auth

#### clerk

Clerk authentication with pre-built UI components.

```bash
obora add clerk
```

**환경 변수**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

#### better-auth

Better Auth with multiple provider support.

```bash
obora add better-auth
```

---

### Data Fetching

#### tanstack-query

TanStack Query for server state management.

```bash
obora add tanstack-query
```

**설정**: `app/providers.tsx`에 QueryClientProvider 자동 추가

---

### State Management

#### zustand

Zustand for lightweight state management.

```bash
obora add zustand
```

#### jotai

Jotai for atomic state management.

```bash
obora add jotai
```

#### nuqs

nuqs for URL-synced state (Next.js).

```bash
obora add nuqs
```

---

### UI Components

#### shadcn

shadcn/ui initialization with cn() utility.

```bash
obora add shadcn
```

**특징**:
- init-only 방식 (파일 복사 없음)
- `bunx --bun shadcn@latest init -y` 자동 실행
- `lib/utils.ts`에 `cn()` 함수 생성

#### shadcn-all

모든 shadcn/ui 컴포넌트 설치.

```bash
obora add shadcn-all
```

#### base-ui

Base UI (Radix primitives).

```bash
obora add base-ui
```

---

### Analytics

#### posthog

PostHog product analytics.

```bash
obora add posthog
```

#### vercel-analytics

Vercel Analytics integration.

```bash
obora add vercel-analytics
```

#### umami

Umami self-hosted analytics.

```bash
obora add umami
```

---

### Testing

#### vitest

Vitest unit testing framework.

```bash
obora add vitest
```

#### playwright

Playwright E2E testing.

```bash
obora add playwright
```

---

## Preset 구조

각 preset은 다음 구조를 따릅니다:

```
presets/<category>/<preset-name>/
├── manifest.json       # Preset 메타데이터 및 설정
├── README.md           # 사용 설명서
└── <target>/           # 타겟별 파일
    ├── standalone/     # 단일 프로젝트용
    └── monorepo/       # 모노레포 프로젝트용
```

### manifest.json 구조

```json
{
  "name": "preset-name",
  "version": "1.0.0",
  "description": "Preset description",
  "category": "database",
  "targets": ["nextjs"],

  "dependencies": {
    "library-name": "^1.0.0"
  },
  "devDependencies": {
    "dev-library": "^1.0.0"
  },

  "files": [
    "lib/db.ts",
    "prisma/schema.prisma"
  ],

  "transform": [
    {
      "type": "provider-wrap",
      "target": "app/providers.tsx",
      "spec": {
        "provider": "QueryClientProvider",
        "importFrom": "@tanstack/react-query"
      }
    }
  ],

  "variants": {
    "sqlite": { ... },
    "postgres": { ... }
  },

  "requires": ["tanstack-query"],
  "conflicts": ["other-preset"],

  "env": [
    {
      "key": "DATABASE_URL",
      "description": "Database connection string",
      "required": true,
      "secret": true
    }
  ]
}
```

---

## Custom Preset 생성

```bash
obora create-preset my-preset

? Select category: database
? Description: My custom database preset

✓ Created presets/database/my-preset/
  ├─ manifest.json
  ├─ README.md
  └─ nextjs/
      ├─ standalone/
      └─ monorepo/
```

### 검증

```bash
# preset 검증
obora doctor --presets
```

---

## 참고

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 전체 아키텍처
- [transform-system.md](./transform-system.md) - Transform 시스템 상세
- [TASKS.md](./TASKS.md) - 개발 로드맵
