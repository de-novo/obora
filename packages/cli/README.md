# Obora CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Next.js/NestJS 프로젝트 스캐폴딩, Preset 관리, Claude Code 워크플로우 통합을 위한 CLI 도구.

## 주요 기능

- **프로젝트 스캐폴딩**: 템플릿 기반 프로젝트 생성
- **Preset 시스템**: 모듈화된 기능 추가/제거 (ORM, Auth, Payment 등)
- **Transform 엔진**: AST 기반 코드 자동 변환
- **Claude Code 통합**: AI 워크플로우 에이전트 및 스킬 관리

## 빠른 시작

### 새 프로젝트 생성

```bash
# 인터랙티브 모드로 새 프로젝트 생성
npx obora create my-app

# 프롬프트에서 선택:
# ✔ Select project structure: monorepo
# ✔ Select app modules: nestjs-api, nextjs-web
# ✔ Select database: drizzle
# ✔ Select auth: clerk
```

### 기존 프로젝트에 Preset 추가

```bash
cd my-project

# 인터랙티브 모드
obora add
# 🎯 Interactive Preset Selection
# 9 categories • 25 presets available

# 또는 직접 지정
obora add drizzle
```

### AI 워크플로우 초기화

```bash
# Claude Code 에이전트, 스킬, 룰 설정
obora init

# ✔ Created .obora/config.json
# ✔ Obora assets synced
```

## 설치

```bash
# Global 설치
npm install -g obora

# 또는 npx 사용
npx obora create my-app

# 개발 모드
git clone https://github.com/obora-labs/obora-kit.git
cd obora-kit/packages/cli
pnpm install && pnpm dev:stub
npm link
```

## 명령어

### 프로젝트 생성

#### `obora create <name>`

템플릿 기반으로 새 프로젝트 생성.

```bash
# 인터랙티브 모드
obora create my-app

# 템플릿 지정
obora create my-app -t nestjs-api

# Preset 포함
obora create my-app -p clerk,drizzle,polar

# 패키지 매니저 지정
obora create my-app --pm pnpm
```

| 옵션 | 별칭 | 설명 |
|------|------|------|
| `--template` | `-t` | 사용할 템플릿 |
| `--presets` | `-p` | 쉼표로 구분된 preset 목록 |
| `--dir` | `-d` | 출력 디렉토리 |
| `--pm` | - | 패키지 매니저 (pnpm, npm, yarn, bun) |
| `--yes` | `-y` | 확인 프롬프트 스킵 |

### Preset 관리

#### `obora add [preset]`

프로젝트에 preset 추가.

```bash
# 인터랙티브 모드 (카테고리 → preset → variant 선택)
obora add
# 출력:
# ┌──────────────────────────────────────────┐
# │ 🎯 Interactive Preset Selection          │
# │                                          │
# │ 9 categories • 25 presets available      │
# │                                          │
# │ Tip: Use 'obora add <preset>' to skip    │
# └──────────────────────────────────────────┘
# ? Select a category:
#   🗄️  Database (2 presets • exclusive)
#   🔐  Auth (3 presets • exclusive)
#   💳  Payment (2 presets • exclusive)
#   ...

# 직접 지정
obora add drizzle

# Variant 선택 (데이터베이스 종류)
obora add drizzle --variant postgres
# ? Select database:
#   🐘 PostgreSQL (postgres)
#   🐬 MySQL (mysql)
#   📁 SQLite (sqlite)

# 대상 지정 (standalone/monorepo)
obora add drizzle --target monorepo

# Dry-run (실제 변경 없이 미리보기)
obora add drizzle --dry-run
```

**주요 기능:**
- **Interactive 모드**: 카테고리별 아이콘과 preset 수 표시
- **Variant 지원**: 데이터베이스 종류 등 옵션 선택
- **충돌 해결**: 같은 카테고리의 exclusive preset 충돌 시 시각적 안내
- **의존성 체인**: requires 필드 기반 자동 의존성 설치 제안
- **Dry-run**: 변경 사항 미리보기

| 옵션 | 별칭 | 설명 |
|------|------|------|
| `--variant` | `-v` | Preset variant (예: postgres, mysql) |
| `--target` | - | 대상 타입 (standalone, monorepo) |
| `--app` | `-a` | 대상 앱 (monorepo에서 특정 앱 지정) |
| `--dry-run` | - | 실제 변경 없이 미리보기 |
| `--yes` | `-y` | 확인 프롬프트 스킵 |

#### `obora remove <preset>`

프로젝트에서 preset 제거.

```bash
obora remove clerk
# ✔ Removed preset: clerk
```

#### `obora undo`

마지막 preset 설치 되돌리기.

```bash
# 마지막 작업 되돌리기
obora undo
# ? Undo last action: Added drizzle (2 minutes ago)? Yes
# ✔ Reverted config changes
# ✔ Undo completed

# 파일도 함께 삭제
obora undo --delete-files

# 확인 없이 즉시 실행
obora undo -y
```

| 옵션 | 별칭 | 설명 |
|------|------|------|
| `--delete-files` | - | 추가된 파일도 삭제 (주의 필요) |
| `--yes` | `-y` | 확인 프롬프트 스킵 |

#### `obora list`

사용 가능한 템플릿 및 preset 목록 조회.

```bash
# 전체 목록
obora list

# 사용 가능한 preset만
obora list --available

# 카테고리별 필터
obora list -t presets -c auth
```

### Preset 개발

#### `obora create-preset [name]`

새 preset 스캐폴드 생성.

```bash
# 인터랙티브 모드
obora create-preset

# 이름 지정
obora create-preset my-auth

# 옵션 지정
obora create-preset my-auth -c auth -d "Custom authentication" -y
```

생성되는 구조:
```
presets/{category}/{name}/
├── manifest.json
├── README.md
└── files/
    ├── standalone/
    └── monorepo/
```

### 프로젝트 검사

#### `obora status`

현재 프로젝트 상태 확인.

```bash
obora status
# Project: my-app
# Base: monorepo
# Apps: nestjs-api, nextjs-web
#
# Installed Presets:
#   database: drizzle v0.45.0
#   auth: clerk v1.25.0
#   linting: biome v1.9.0
```

#### `obora doctor`

프로젝트 및 preset 설정 진단.

```bash
# 기본 진단
obora doctor

# Preset 스키마 검증 포함
obora doctor --presets

# JSON 출력
obora doctor --json
```

#### `obora upgrade`

Preset을 최신 버전으로 업그레이드.

```bash
obora upgrade
```

#### `obora eject`

Preset 설정 파일을 프로젝트로 추출.

```bash
obora eject
# ? Select preset to eject: tailwind
# ✔ Ejected 2 file(s) from 'tailwind'
```

### Claude Code 통합

#### `obora init`

기존 프로젝트에 Claude Code 에셋 초기화.

```bash
# 현재 디렉토리
obora init

# 특정 디렉토리
obora init -d ./my-project

# 강제 덮어쓰기
obora init -f
```

생성되는 에셋:
- `.claude/agents/` - 에이전트 정의
- `.claude/skills/` - 스킬 정의
- `.claude/rules/` - 규칙 파일
- `.claude/scripts/` - 유틸리티 스크립트
- `.claude/settings.json` - 설정 및 훅

#### `obora sync`

Obora 에셋을 프로젝트에 동기화.

```bash
# 전체 동기화
obora sync

# 특정 타입만
obora sync -t skills
obora sync -t settings

# 강제 덮어쓰기
obora sync -f

# 에셋 목록 조회
obora sync -l
```

| 옵션 | 별칭 | 설명 |
|------|------|------|
| `--type` | `-t` | 동기화 타입: skills, agents, rules, commands, scripts, settings, all |
| `--force` | `-f` | 기존 파일 덮어쓰기 |
| `--list` | `-l` | 에셋 목록 조회 |

### 유틸리티

#### `obora transform`

Transform 작업 수동 실행.

```bash
obora transform
```

#### `obora llm-help`

LLM 친화적인 문서 출력.

```bash
obora llm-help
```

#### `obora config`

글로벌 설정 관리.

```bash
obora config
```

## 템플릿

| 템플릿 | 설명 |
|--------|------|
| `monorepo` | 풀스택 모노레포 (NestJS + Next.js) |
| `single` | 단일 앱 프로젝트 |
| `nestjs-api` | NestJS 11 API (Fastify) |
| `nextjs-web` | Next.js 15 웹앱 |

## Preset 카테고리

| 카테고리 | Preset | 설명 |
|----------|--------|------|
| **database** | `drizzle`, `prisma` | ORM (exclusive) |
| **auth** | `clerk`, `clerk-nextjs`, `better-auth`, `lucia` | 인증 (exclusive) |
| **payment** | `polar`, `paddle` | 결제 (exclusive) |
| **email** | `resend` | 이메일 |
| **ai** | `vercel-ai` | AI SDK |
| **analytics** | `umami`, `posthog`, `vercel-analytics` | 분석 |
| **storage** | `uploadthing`, `cloudflare-r2` | 파일 스토리지 |
| **validation** | `zod`, `effect-schema` | 검증 |
| **linting** | `biome`, `eslint-prettier` | 린팅 (exclusive) |
| **data-fetching** | `tanstack-query`, `trpc` | 데이터 fetching |
| **state** | `zustand` | 상태 관리 |
| **ui** | `shadcn`, `lucide`, `motion` | UI 라이브러리 |

## Transform 시스템

Preset은 코드를 자동으로 변환합니다:

| 타입 | 설명 |
|------|------|
| `import` | import 문 추가 |
| `dependency` | package.json 의존성 추가 |
| `provider-wrap` | Provider 컴포넌트로 감싸기 |
| `layout-component` | Layout에 컴포넌트 추가 |
| `nestjs-module` | NestJS 모듈 import 추가 |
| `script` | package.json scripts 추가 |
| `env` | 환경 변수 템플릿 추가 |
| `marker` | 마커 기반 코드 주입 |

### Conditional Transform

조건부 transform 지원:

```json
{
  "transform": [{
    "type": "import",
    "condition": { "fileExists": "app/providers.tsx" },
    "target": "app/providers.tsx",
    "spec": { ... }
  }]
}
```

## Manifest 구조

```json
{
  "$schema": "../../preset.schema.json",
  "name": "my-preset",
  "category": "database",
  "description": "My custom preset",
  "version": "1.0.0",
  "common": {
    "dependencies": {},
    "devDependencies": {},
    "scripts": {},
    "files": [],
    "transform": []
  },
  "targets": {
    "standalone": { ... },
    "monorepo": { ... }
  },
  "variants": {
    "sqlite": { ... },
    "postgres": { ... }
  },
  "requires": ["other-preset"],
  "conflicts": ["conflicting-preset"]
}
```

## Troubleshooting

### Preset 추가 후 타입 에러

```bash
# 의존성 재설치
pnpm install

# 타입 체크
pnpm tsc --noEmit
```

### Transform 실패

```bash
# 진단 실행
obora doctor --presets

# Dry-run으로 확인
obora add <preset> --dry-run
```

### 충돌 해결

같은 카테고리에 exclusive preset이 이미 있는 경우:

```
⚠️  Conflict Detected

Current: drizzle
New:     prisma
Slot:    database (exclusive)

? Choose an action:
  🔄 Replace with prisma
  ✋ Keep drizzle
```

### 마지막 작업 되돌리기

```bash
obora undo
```

### Config 초기화

```bash
# .obora 디렉토리 삭제 후 재초기화
rm -rf .obora
obora init
```

## 개발

```bash
# 의존성 설치
pnpm install

# 개발 모드 (stub - 변경 즉시 반영)
pnpm dev:stub

# 빌드
pnpm build

# 테스트
pnpm test

# 글로벌 링크
npm link

# 로컬 테스트
obora --version
```

## 라이선스

MIT
