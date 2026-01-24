# Presets

기능별 설정 패키지입니다. 프로젝트에 필요한 기능을 빠르게 추가할 수 있습니다.

## 사용법

```bash
# 프리셋 추가
obora add <preset-name>

# 여러 프리셋 한번에
obora add clerk drizzle polar
```

## 프리셋 목록

### 현재 지원 프리셋 요약

| 기능          | 프리셋                         |
| ------------- | ------------------------------ |
| Auth          | `clerk`, `better-auth`         |
| Database      | `drizzle`, `prisma`            |
| Payment       | `polar`, `paddle`              |
| Analytics     | `umami`, `posthog`             |
| Data Fetching | `tanstack-query`               |
| State         | `nuqs`                         |
| i18n          | `next-intl`                    |
| Theming       | `next-themes`                  |
| UI            | `shadcn-all`                   |
| Email         | `resend`                       |
| Storage       | `uploadthing`, `cloudflare-r2` |
| AI            | `vercel-ai`                    |
| Validation    | `zod`, `effect-schema`         |
| Linting       | `biome`, `eslint-prettier`     |

### Auth (인증)

| 이름          | 설명                                 | 기본 |
| ------------- | ------------------------------------ | ---- |
| `clerk`       | 호스팅형, 빠른 설정, 10K MAU 무료    | O    |
| `better-auth` | 오픈소스, 자체 호스팅, 데이터 소유권 |      |

### Database (데이터베이스)

| 이름      | 설명                                  | 기본 |
| --------- | ------------------------------------- | ---- |
| `drizzle` | 경량(7kb), SQL-first, 서버리스 최적화 | O    |
| `prisma`  | 성숙한 생태계, 강력한 툴링            |      |

### Payment (결제)

| 이름     | 설명                           | 기본 |
| -------- | ------------------------------ | ---- |
| `polar`  | MoR, 개발자 친화적, 4% + $0.40 | O    |
| `paddle` | MoR, 글로벌, 5% + $0.50        |      |

### Analytics (분석)

| 이름      | 설명                                  | 기본 |
| --------- | ------------------------------------- | ---- |
| `umami`   | 경량, 프라이버시, 자체호스팅          | O    |
| `posthog` | 올인원 (분석+세션리플레이+피처플래그) |      |

### Data Fetching (데이터 패칭)

| 이름             | 설명                                  | 기본 |
| ---------------- | ------------------------------------- | ---- |
| `tanstack-query` | React 비동기 상태 관리, 캐싱/동기화   | O    |

TanStack Query 사용 경로:
- 클라이언트 전용: `@/lib/query` (Provider/Client)
- 서버 전용 예제: `@/lib/query/prefetch`
  - 서버 전용 코드는 클라이언트 컴포넌트에서 import 금지

### State (상태 관리)

| 이름   | 설명                          | 기본 |
| ------ | ----------------------------- | ---- |
| `nuqs` | URL 쿼리스트링 기반 상태 관리 |      |

### i18n (다국어)

| 이름        | 설명                           | 기본 |
| ----------- | ------------------------------ | ---- |
| `next-intl` | Next.js App Router i18n 솔루션 | O    |

Auto 적용(레이아웃 주입): `--dialect nextjs-auto`

### Theming (테마)

| 이름          | 설명                          | 기본 |
| ------------- | ----------------------------- | ---- |
| `next-themes` | Next.js 다크/라이트 테마 지원 | O    |

Auto 적용(레이아웃 주입): `--dialect nextjs-auto`
주의: `next-themes` 사용 시 `<html suppressHydrationWarning>` 추가 권장

### UI (컴포넌트)

| 이름         | 설명                                                         | 기본 |
| ------------ | ------------------------------------------------------------ | ---- |
| `shadcn-all` | shadcn/ui 전체 컴포넌트 설치 (Radix 기본, Base UI 선택 가능) | O    |
| `base-ui`    | Base UI (unstyled, 접근성 프리미티브)                        |      |

Base UI 스타일: `vega`, `nova`, `maia`, `lyra`, `mira`

### Email (이메일)

| 이름     | 설명                         | 기본 |
| -------- | ---------------------------- | ---- |
| `resend` | React Email 통합, 3K/월 무료 | O    |

### Storage (스토리지)

| 이름            | 설명                   | 기본 |
| --------------- | ---------------------- | ---- |
| `uploadthing`   | 타입 안전, 서버 인증   | O    |
| `cloudflare-r2` | S3 호환, 이그레스 무료 |      |

### AI

| 이름        | 설명                    | 기본 |
| ----------- | ----------------------- | ---- |
| `vercel-ai` | 스트리밍 UI, React 통합 | O    |

## 프리셋 구조

```
presets/<category>/<name>/
├── manifest.json       # 메타데이터
├── env.example         # 환경변수
├── files/              # 추가할 파일들
└── README.md           # 사용 가이드
```

## 작동 방식 / 효과

### 어떻게 사용하는가

- `obora add <preset>` 실행 시 preset의 `targets/variants` 중 하나를 선택해 적용합니다.
- 선택된 타겟은 `.obora/config.json`의 `presetTargets`에 저장되어 **다음 add/upgrade에서 동일 타겟이 자동 재사용**됩니다.
- 잘못 선택했으면 다시 `add` 또는 `upgrade` 시 다른 타겟을 선택하면 됩니다(히스토리에 기록됨).

### 어떤 효과가 있는가

- **환경 자동 선택**: 프로젝트의 패키지/버전/런타임 정보를 보고 타겟을 자동 결정합니다.
- **일관성 유지**: 팀/CI에서 같은 타겟이 반복 적용됩니다(예: drizzle:sqlite 유지).
- **변경 추적**: 타겟 변경 이력이 남아 나중에 왜 바뀌었는지 확인할 수 있습니다.

### 실제 사용 예시

- `obora add clerk` → 프로젝트에 `next`가 있으면 **nextjs 타겟**이 자동 선택되어 `@clerk/nextjs` 의존성과 파일이 추가됩니다.
- `obora add drizzle --dialect sqlite` → **override**로 sqlite를 강제하고, 이후 `upgrade` 시에도 sqlite가 재사용됩니다.

### Before / After (체감 포인트)

- Before: auth/db/analytics를 직접 설치하고 파일/환경변수/스크립트를 수동으로 맞춤
- After: `obora add clerk drizzle umami` 한 번으로 **파일+의존성+환경변수+주입**이 자동 구성

### 핵심 가치

- **설정 표준화**: 팀원/프로젝트마다 달라지는 초기 설정 편차 감소
- **속도**: 반복 작업을 클릭/검색 없이 한 번에 처리
- **안정성**: 동일 프리셋/타겟 기준으로 결과가 항상 동일

### 적용 순서

- `files` 복사 → `transform` 적용 → `dependencies/scripts` 병합 → `env` 안내 → `postInstall` 안내

### Transform 시스템

AST 기반 코드 변환 시스템을 사용하여 기존 파일에 안전하게 코드를 추가합니다.

**지원 타입:**
- `import`: import 문 추가 (중복 자동 병합)
- `dependency`: package.json 의존성 추가
- `nestjs-module`: NestJS @Module imports 배열에 모듈 추가
- `provider-wrap`: React Provider로 children 감싸기

**예시:**
```json
{
  "transform": [
    {
      "target": "app/providers.tsx",
      "type": "import",
      "content": "import { QueryProvider } from \"@/lib/query\";"
    },
    {
      "target": "app/providers.tsx",
      "type": "provider-wrap",
      "provider": "QueryProvider"
    }
  ]
}
```

**장점:**
- 마커 불필요 - AST가 자동으로 올바른 위치 결정
- 중복 삽입 자동 방지
- 기존 코드 포맷 보존

자세한 내용은 [Transform System 문서](../packages/cli/docs/transform-system.md)를 참조하세요.

### 타겟 선택 우선순위

1. `.obora/config.json`의 저장된 `presetTargets`
2. `detect` 규칙(패키지/버전/런타임)
3. 앱 타입 매핑(예: nextjs-web → nextjs, nestjs-api → nestjs)
4. 사용자 선택 또는 기본값

### detect 규칙 예시 (마이너 버전 포함)

```json
{
  "targets": {
    "nextjs": {
      "detect": {
        "packages": ["next"],
        "packageVersions": { "next": ">=14.1" },
        "runtime": { "node": ">=18.12", "packageManager": "pnpm" }
      }
    }
  }
}
```

## Soon (예정)

- Preset Doctor+ (프리셋 상태 진단, CI JSON 출력)
- Preset Plan (Dry Run) → 변경사항 미리보기
- Preset Migrate (버전 업그레이드 자동 변경)
- Preset Lockfile (타겟/버전 고정)
- Project Recipe (프리셋 조합 저장/재사용)
- Env Bootstrap (환경변수 자동 가이드/템플릿)
- Preset Sandbox Test (프리셋 빠른 검증)

### 추가 예정 라이브러리

- Observability: `sentry`, `open-telemetry`
- Cache/Queue: `redis`(self-hosted/managed), `bullmq`
- Search: `meilisearch`, `typesense`
- Feature Flags: `unleash`, `flagsmith`
- Auth 확장: `auth0`, `supertokens`
- Storage 확장: `s3`(aws-sdk v3), `supabase-storage`
- Email 확장: `sendgrid`, `ses`
- Payments 확장: `stripe`, `lemonsqueezy`
- CMS: `payload`, `sanity`
- Testing: `playwright`, `vitest`
- Security: `helmet`, `rate-limit`

### 추천 조합 (use-case별)

- SaaS 기본: `clerk` + `drizzle` + `polar` + `resend` + `umami`
- B2B: `better-auth` + `prisma` + `stripe` + `posthog`
- Content/App: `clerk` + `drizzle` + `payload` + `sentry`
- API 중심: `better-auth` + `prisma` + `pino` + `bullmq`
- 글로벌 웹: `clerk` + `drizzle` + `next-intl` + `sentry`

### 최신성 확인 링크

- Observability: `sentry.io` `opentelemetry.io`
- Cache/Queue: `redis.io` `docs.bullmq.io`
- Search: `meilisearch.com` `typesense.org`
- Feature Flags: `getunleash.io` `flagsmith.com`
- Auth 확장: `auth0.com` `supertokens.com`
- Storage 확장: `aws.amazon.com/sdk-for-javascript/` `supabase.com`
- Email 확장: `sendgrid.com` `aws.amazon.com/ses/`
- Payments 확장: `stripe.com` `lemonsqueezy.com`
- CMS: `payloadcms.com` `sanity.io`
- Testing: `playwright.dev` `vitest.dev`
- Security: `helmetjs.github.io` `github.com/express-rate-limit/express-rate-limit`

## manifest.json 스키마

```json
{
  "name": "preset-name",
  "version": "1.0.0",
  "description": "프리셋 설명",
  "category": "auth|database|payment|...",
  "default": true,
  "compatible": ["turbo-nextjs-full", "turbo-nextjs-minimal"],
  "conflicts": ["other-preset"],
  "requires": ["dependency-preset"],
  "env": [
    {
      "key": "ENV_VAR_NAME",
      "description": "설명",
      "required": true,
      "secret": false
    }
  ]
}
```
