# obora-kit

> 빠른 SaaS 개발을 위한 공용 도구, 템플릿, 프리셋 허브

## 패키지 상태 (2026-02)

상태 라벨 기준:
- **implemented**: 프로덕션 사용 가능한 수준으로 구현/검증 완료
- **partial**: 핵심 기능은 있으나 범위/안정성 보강 필요
- **idea**: 설계/초안 단계

| 패키지 | 설명 | 상태 | 메모 |
|---|---|---|---|
| `@obora-kit/blackboard` | 에이전트 협업용 블랙보드 도메인/스토어 구현 | implemented | 성숙 |
| `@obora-kit/actor` | 에이전트 실행 단위와 라이프사이클 조정 | implemented | 성숙 |
| `@obora-kit/agents` | LLM 어댑터 및 에이전트 유틸리티 | implemented | - |
| `@obora/cli` | 프로젝트 생성/초기화/동기화 CLI | implemented | E2E 검증 완료 |
| `@obora/core` | 공통 타입/유틸/기반 추상화 | implemented | 안정 |
| `@obora/database` | DB 레이어 및 런타임 저장소 어댑터 | implemented | API 단일화 완료 |
| `@obora-kit/board` | blackboard 상위 오케스트레이션 파사드 | implemented | 파사드 |
| `@obora/preset-engine` | 템플릿/프리셋 조합 및 적용 엔진 | implemented | - |
| `@obora/project-templates` | 스캐폴딩용 프로젝트 템플릿 모음 | implemented | - |

> 현재 기준 모든 핵심 패키지는 `implemented` 단계입니다.

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

### 1. 새 프로젝트 생성

```bash
# 풀스택 SaaS 프로젝트 생성
obora create my-saas

# 인터랙티브 프롬프트에서 선택:
# - Base: monorepo
# - Apps: nestjs-api, nextjs-web
# - Presets: clerk, clerk-nextjs, drizzle, polar, resend, umami

cd my-saas
pnpm install
```

### 2. AI 에셋 초기화 (Claude Code 통합)

```bash
# AI 에이전트, 스킬, 룰 설정
obora init

# 결과:
# ✅ .claude/ 디렉토리 생성 (에이전트, 스킬, 룰)
# ✅ Claude Code hooks 설정
# ✅ CLAUDE.md 워크플로우 가이드 생성
```

### 3. 개발 시작

```bash
# 개발 서버 실행
pnpm dev

# Claude Code로 AI 워크플로우 사용
# - /obora-implement "새 기능 구현"
# - /obora-fix "버그 수정"
# - /obora-commit "변경사항 커밋"
```

### 기존 프로젝트에 적용

```bash
cd existing-project

# AI 에셋만 추가 (스캐폴딩 없이)
obora init

# 또는 특정 에셋만 동기화
obora sync -t skills    # 스킬만
obora sync -t settings  # hooks 설정만
```

### 템플릿 옵션

```bash
# Monorepo (NestJS + Next.js)
obora create my-saas --base monorepo

# NestJS API만
obora create my-api --base single --apps nestjs-api

# Next.js Web만
obora create my-web --base single --apps nextjs-web
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

### 프로젝트 스캐폴딩

```bash
obora create <name>           # 새 프로젝트 생성
obora add <preset>            # 프리셋 추가
obora remove <preset>         # 프리셋 제거
obora status                  # 현재 설정 상태 확인
obora list                    # 사용 가능한 템플릿/프리셋 목록
```

### AI 에셋 관리

```bash
obora init                    # AI 에셋(에이전트, 스킬, 룰) 초기화
obora sync                    # AI 에셋 동기화 (최신 버전으로 업데이트)
obora sync -t skills          # 특정 에셋만 동기화
obora sync -l                 # 사용 가능한 에셋 목록
```

### 유틸리티

```bash
obora doctor                  # 프로젝트 설정 진단
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

## AI 통합 (Claude Code)

obora-kit은 Claude Code와의 통합을 통해 AI 기반 워크플로우 자동화를 제공합니다.

### 초기 설정

```bash
# 기존 프로젝트에 AI 에셋 초기화
cd my-project
obora init

# 생성되는 구조:
# .claude/
# ├── agents/          # AI 에이전트 정의
# ├── skills/          # 재사용 가능한 스킬
# ├── rules/           # 코드 규칙 및 가이드라인
# ├── scripts/         # 자동화 스크립트
# └── settings.json    # Claude Code 설정 (hooks 등)
```

### AI 에셋 동기화

새 버전의 에셋이 릴리즈되면 동기화:

```bash
obora sync              # 전체 동기화
obora sync -t skills    # 스킬만 동기화
obora sync -t settings  # 설정(hooks)만 동기화
obora sync -f           # 강제 덮어쓰기
```

### Claude Code 워크플로우

`/obora-*` 슬래시 명령어로 AI 워크플로우 실행:

| 명령어 | 설명 |
|--------|------|
| `/obora-workflow <요청>` | 자동 워크플로우 판단 및 실행 |
| `/obora-implement <설명>` | 새 기능 구현 |
| `/obora-fix <버그>` | 버그 수정 |
| `/obora-commit` | 커밋 생성 |
| `/obora-review` | 코드 리뷰 |

## 대시보드

Claude Code 세션과 워크플로우를 모니터링하는 웹 대시보드:

```bash
# 대시보드 실행
cd packages/dashboard
pnpm dev

# http://localhost:3847 에서 접속
```

### 기능

- **프로젝트별 필터링**: 여러 프로젝트의 세션을 분리하여 확인
- **세션 모니터링**: 활성/완료된 Claude 세션 추적
- **워크플로우 추적**: 실행된 워크플로우 상태 및 결과 확인
- **토큰 사용량**: 프로젝트별 토큰 소비량 모니터링

### 데이터 저장

세션 및 워크플로우 데이터는 `~/.obora/dashboard.db` (SQLite)에 저장됩니다.

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

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Template/Preset composable architecture |
| [WORKFLOW-ARCHITECTURE.md](./docs/WORKFLOW-ARCHITECTURE.md) | Workflow engine and agent orchestration |
| [VISION-AGENT-AGNOSTIC.md](./docs/VISION-AGENT-AGNOSTIC.md) | Agent-agnostic vision and roadmap |

## Vision

obora-kit aims to be **agent-agnostic** like Vercel Skills, supporting all major AI agents:

- Claude Code, Cursor, Codex, Windsurf, OpenCode, Gemini CLI, and more

While providing **workflow automation** capabilities beyond simple skill sharing:

- Dynamic workflow orchestration (planner)
- Requirements discovery (interviewer)
- Feedback loops (reviewer)
- DB persistence across sessions

See [VISION-AGENT-AGNOSTIC.md](./docs/VISION-AGENT-AGNOSTIC.md) for the full roadmap.

---

*obora-labs*
