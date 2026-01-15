# obora-kit

> 빠른 SaaS 개발을 위한 공용 도구, 템플릿, 프리셋 허브

## 설치

### 내부 사용 (GitHub에서 직접)

```bash
# 방법 1: npx로 직접 실행
npx github:obora-labs/obora-kit create my-project

# 방법 2: 글로벌 링크 (개발용)
git clone https://github.com/obora-labs/obora-kit.git
cd obora-kit/packages/cli
pnpm install && pnpm build
pnpm link --global
obora create my-project

# 방법 3: 프로젝트 의존성으로 추가
pnpm add github:obora-labs/obora-kit#main --save-dev
```

### npm (추후 공개 시)

```bash
npm install -g @obora/kit
# 또는
npx @obora/kit create my-project
```

## 빠른 시작

### Monorepo (NestJS + Next.js)

```bash
# 풀스택 SaaS 프로젝트 생성
obora create my-saas

# 인터랙티브 프롬프트에서 선택:
# - Base: monorepo
# - Apps: nestjs-api, nextjs-web
# - Presets: clerk, clerk-nextjs, drizzle, polar, resend, umami

cd my-saas
pnpm install
pnpm dev
```

### Single App

```bash
# NestJS API만
obora create my-api
# - Base: single
# - Apps: nestjs-api
# - Presets: drizzle, clerk, resend

# Next.js Web만
obora create my-web
# - Base: single
# - Apps: nextjs-web
# - Presets: clerk-nextjs, umami
```

## 구조

```
obora-kit/
├── packages/cli/        # @obora-labs/cli
├── templates/           # Base + App Module 템플릿
│   ├── base/           # monorepo, single
│   └── apps/           # nestjs-api, nextjs-web, shared-*
├── presets/            # 기능별 프리셋
│   ├── auth/          # clerk, clerk-nextjs, better-auth
│   ├── database/      # prisma, drizzle
│   ├── payment/       # polar, paddle
│   ├── analytics/     # umami, posthog
│   ├── email/         # resend
│   ├── storage/       # uploadthing, cloudflare-r2
│   ├── ai/            # vercel-ai
│   ├── linting/       # biome, eslint-prettier
│   └── validation/    # zod, effect-schema
└── scripts/           # 자동화 스크립트
```

## App Modules

| 모듈 | 설명 | 지원 슬롯 |
|------|------|----------|
| `nestjs-api` | NestJS 11 API 서버 | database, auth, payment, email, storage, ai, validation, linting |
| `nextjs-web` | Next.js 15 웹 앱 | auth, analytics, linting |
| `shared-database` | 공유 데이터베이스 패키지 | database |
| `shared-ui` | 공유 UI 컴포넌트 | - |

## 프리셋

### 인증 (Auth)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `clerk` | nestjs-api | Clerk - NestJS Guard 기반 인증 |
| `clerk-nextjs` | nextjs-web | Clerk - Next.js Middleware 기반 인증 |
| `better-auth` | nestjs-api | Better Auth - Drizzle 기반 자체 호스팅 |
| `better-auth-nextjs` | nextjs-web | Better Auth - Next.js 클라이언트 |

> **참고**: Monorepo에서 인증 사용 시 API와 Web 프리셋을 함께 선택하세요:
> - Clerk: `clerk`(API) + `clerk-nextjs`(Web)
> - Better Auth: `better-auth`(API) + `better-auth-nextjs`(Web)

### 데이터베이스 (Database)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `prisma` | nestjs-api, shared-database | Prisma ORM - 성숙한 생태계 |
| `drizzle` | nestjs-api, shared-database | Drizzle ORM - SQL-first, 경량 |

### 결제 (Payment)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `polar` | nestjs-api | Polar - MoR, 개발자 친화적 |
| `paddle` | nestjs-api | Paddle - MoR, 글로벌 |

### 분석 (Analytics)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `umami` | nextjs-web | Umami - 경량, 프라이버시 중심 |
| `posthog` | nextjs-web | PostHog - 올인원 제품 분석 |

### 데이터 패칭 (Data Fetching)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `tanstack-query` | nextjs-web | React 비동기 상태 관리, 캐싱/동기화 |

> **사용 경로**: 클라이언트는 `@/lib/query`, 서버 전용 예제는 `@/lib/query/prefetch`를 사용하세요.  
> 서버 전용 모듈은 클라이언트 컴포넌트에서 import하면 안 됩니다.

### 이메일 (Email)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `resend` | nestjs-api | Resend - React Email 통합 |

### 스토리지 (Storage)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `uploadthing` | nestjs-api | UploadThing - 타입 안전 업로드 |
| `cloudflare-r2` | nestjs-api | Cloudflare R2 - S3 호환, 이그레스 무료 |

### AI

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `vercel-ai` | nestjs-api | Vercel AI SDK - 스트리밍 지원 |

### 린팅 (Linting)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `biome` | 프로젝트 루트 | Biome - Rust 기반 빠른 린터 |
| `eslint-prettier` | 프로젝트 루트 | ESLint + Prettier - 전통적 도구체인 |

### 검증 (Validation)

| 프리셋 | 대상 앱 | 설명 |
|--------|---------|------|
| `zod` | nestjs-api | Zod - TypeScript-first 스키마 |
| `effect-schema` | nestjs-api | Effect Schema - 함수형 검증 |

## CLI 명령어

```bash
obora create <name>           # 새 프로젝트 생성
obora init                    # 기존 프로젝트에 obora 초기화
obora add <preset>            # 프리셋 추가
obora remove <preset>         # 프리셋 제거
obora status                  # 현재 설정 상태 확인
obora list                    # 사용 가능한 템플릿/프리셋 목록
obora llm-help                # LLM 친화적 문서 출력
```

### 프로젝트 생성 예시

```bash
# 인터랙티브 모드
obora create my-saas

# 플래그로 직접 지정
obora create my-saas \
  --base monorepo \
  --apps nestjs-api,nextjs-web \
  --presets clerk,clerk-nextjs,drizzle,polar
```

## 프로젝트 추적 (.obora/)

생성된 프로젝트는 `.obora/` 폴더에서 상태를 추적합니다:

```
.obora/
├── config.json    # 현재 설정 (템플릿, 슬롯, 프리셋)
└── history.json   # 변경 이력
```

### config.json 예시

```json
{
  "$schema": "https://obora.dev/schema/config.json",
  "version": "1.0.0",
  "base": "monorepo",
  "apps": ["nestjs-api", "nextjs-web"],
  "createdAt": "2025-01-10T00:00:00.000Z",
  "updatedAt": "2025-01-10T00:00:00.000Z",
  "slots": {
    "database": { "preset": "drizzle", "version": "0.45.0" },
    "auth": { "preset": "clerk", "version": "1.25.0" },
    "payment": null
  },
  "packageManager": "pnpm"
}
```

## 슬롯 시스템

각 프리셋은 특정 **카테고리(슬롯)**에 속하며, 앱 모듈은 지원하는 슬롯만 받습니다:

```
프리셋 선택: clerk, drizzle, umami
                ↓
┌─────────────────────────────────────────┐
│ nestjs-api (slots: database, auth, ...) │
│   → drizzle ✓ (database 슬롯)           │
│   → clerk ✓ (auth 슬롯)                 │
│   → umami ✗ (analytics 슬롯 없음)        │
├─────────────────────────────────────────┤
│ nextjs-web (slots: auth, analytics)     │
│   → drizzle ✗ (database 슬롯 없음)       │
│   → clerk ✗ (targetApps 필터링)          │
│   → umami ✓ (analytics 슬롯)            │
└─────────────────────────────────────────┘
```

### targetApps

일부 프리셋은 `targetApps`를 통해 특정 앱에만 적용됩니다:

```json
{
  "name": "clerk",
  "category": "auth",
  "targetApps": ["nestjs-api"]
}
```

이를 통해 같은 카테고리의 다른 구현체를 각 앱에 적용할 수 있습니다:
- `clerk` → nestjs-api (Guard 기반)
- `clerk-nextjs` → nextjs-web (Middleware 기반)

## 기술 스택 (2025-2026)

| 영역 | 기본 선택 |
|------|----------|
| Framework | Next.js 15 + NestJS 11 |
| Monorepo | Turborepo |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui |
| ORM | Drizzle |
| Auth | Clerk |
| Payment | Polar |
| Analytics | Umami |
| Email | Resend |
| AI | Vercel AI SDK |
| Linting | Biome |

## 개발

```bash
# 의존성 설치
pnpm install

# CLI 빌드
pnpm --filter @obora-labs/cli build

# 테스트
pnpm --filter @obora-labs/cli test

# E2E 테스트
pnpm --filter @obora-labs/cli test:e2e
```

---

*obora-labs*
