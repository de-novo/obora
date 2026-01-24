# CLI Architecture

Obora CLI의 아키텍처 문서입니다.

## 개요

Obora CLI는 TypeScript SaaS 프로젝트를 위한 모듈식 스캐폴딩 도구입니다.

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│  (citty 기반 명령어 처리)                                     │
├─────────────────────────────────────────────────────────────┤
│                      Transform Layer                         │
│  (magicast 기반 AST 코드 변환)                               │
├─────────────────────────────────────────────────────────────┤
│                       Preset Layer                           │
│  (manifest.json 기반 선언적 구성)                            │
├─────────────────────────────────────────────────────────────┤
│                     Template Layer                           │
│  (@obora/project-templates)                                  │
└─────────────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
packages/cli/
├── src/
│   ├── commands/           # CLI 명령어 (17개)
│   │   ├── add.ts          # preset 추가
│   │   ├── remove.ts       # preset 제거
│   │   ├── create.ts       # 프로젝트 생성
│   │   ├── init.ts         # 프로젝트 초기화
│   │   ├── sync.ts         # 에셋 동기화
│   │   ├── doctor.ts       # 진단
│   │   ├── eject.ts        # preset 분리
│   │   ├── upgrade.ts      # 업그레이드
│   │   ├── transform.ts    # 코드 변환
│   │   ├── list.ts         # 목록 조회
│   │   ├── status.ts       # 상태 확인
│   │   ├── config.ts       # 설정 관리
│   │   └── ...
│   ├── utils/
│   │   ├── transform.ts    # AST 변환 유틸리티
│   │   ├── constants.ts    # 상수 정의
│   │   ├── fs.ts           # 파일시스템 유틸리티
│   │   ├── assembler.ts    # 프로젝트 조립
│   │   └── ...
│   └── templates/          # 기본 템플릿
│       ├── providers.tsx
│       ├── layout.tsx
│       └── index.ts
├── docs/                   # 문서
├── test/                   # 테스트
└── package.json
```

## 핵심 의존성

| 패키지 | 용도 |
|--------|------|
| `citty` | CLI 프레임워크 |
| `consola` | 로깅/출력 |
| `magicast` | AST 기반 코드 변환 |
| `zod` | 스키마 검증 |
| `pathe` | 경로 처리 |
| `defu` | 기본값 병합 |
| `giget` | Git 저장소 클론 |
| `ora` | 스피너/진행표시 |

## 내부 패키지 (Monorepo)

| 패키지 | 용도 |
|--------|------|
| `@obora/project-templates` | 프로젝트 템플릿 |
| `@obora/preset-engine` | Preset 처리 엔진 |
| `@obora/project-config` | 프로젝트 설정 |
| `@obora/database` | 데이터베이스 관리 |
| `@obora/workflow-core` | 워크플로우 코어 |
| `@obora/agent-claude` | Claude 에이전트 |

---

## 명령어 시스템

### 구현된 명령어 (19개)

| 명령어 | 설명 | 상태 |
|--------|------|------|
| `create` | 새 프로젝트 생성 | ✅ |
| `init` | 기존 프로젝트 초기화 | ✅ |
| `add` | preset/모듈 추가 | ✅ |
| `remove` | preset/모듈 제거 | ✅ |
| `upgrade` | 프로젝트 업그레이드 | ✅ |
| `eject` | preset 분리 (코드화) | ✅ |
| `doctor` | 프로젝트 진단 | ✅ |
| `sync` | .claude/ 에셋 동기화 | ✅ |
| `transform` | AST 코드 변환 | ✅ |
| `list` | 설치된 preset 목록 | ✅ |
| `status` | 프로젝트 상태 | ✅ |
| `config` | 설정 관리 | ✅ |
| `undo` | 마지막 작업 취소 | ✅ |
| `create-preset` | 새 preset 생성 | ✅ |
| `title-generate` | 제목 자동 생성 | ✅ |
| `chat` | Claude 상호작용 | ⚠️ 프로토타입 |
| `run` | 스크립트 실행 | ⚠️ 기본 |
| `sandbox` | 테스트 환경 | ⚠️ 기본 |
| `llm-help` | LLM 도움말 | ⚠️ 기본 |

### 주요 옵션

```bash
# 공통 옵션
--dry-run       # 변경 미리보기 (실제 적용 안함)
--verbose       # 상세 출력
--force         # 강제 실행

# add 명령어
obora add <preset> [--target <target>] [--dry-run]

# create 명령어
obora create <name> [--base <base>] [--apps <apps>]
```

---

## Transform 시스템

AST 기반 코드 변환을 담당합니다.

### 지원 Transform 타입 (8개)

| Type | 대상 파일 | 기능 |
|------|-----------|------|
| `import` | .ts, .tsx | 모듈 임포트 추가 (중복 제거) |
| `export` | .ts, .tsx | 내보내기 추가 (named/default) |
| `dependency` | package.json | 패키지 의존성 추가/제거 |
| `config` | 설정 파일 | 설정값 업데이트 (dot-notation) |
| `nestjs-module` | app.module.ts | @Module imports 배열에 추가 |
| `provider-wrap` | providers.tsx | React Provider 래핑 |
| `json-property` | JSON 파일 | JSON 속성 설정 (merge 지원) |
| `layout-component` | layout.tsx | Next.js 레이아웃에 컴포넌트 추가 |

### Transform Spec 구조

```typescript
// import
{ from: "@tanstack/react-query", named: ["QueryClient"] }

// dependency
{ name: "zod", version: "^3.22.0", dev: false }

// provider-wrap
{ provider: "QueryProvider", props: { client: "queryClient" } }

// layout-component
{ component: "Analytics", position: "body-end", selfClosing: true }

// json-property
{ path: "compilerOptions.strict", value: true, merge: false }
```

### Transform 처리 흐름

```
1. 파일 읽기
2. magicast로 AST 파싱
3. AST 노드 탐색/수정
4. 코드 생성 (포맷 보존)
5. 파일 쓰기 (또는 dry-run 시 미리보기)
```

---

## Preset 시스템

### Preset 디렉토리 구조

```
presets/
├── {category}/
│   └── {preset-name}/
│       ├── manifest.json     # 필수: 메타데이터 + 설정
│       ├── common/           # 공통 파일
│       ├── targets/          # 타겟별 파일
│       │   ├── standalone/
│       │   └── monorepo/
│       └── files/            # 복사할 파일들
```

### manifest.json 구조

```typescript
interface PresetManifest {
  name: string;
  category: Category;
  description: string;
  version?: string;

  // 공통 구성
  common?: PresetTargetConfig;

  // 타겟별 구성
  targets?: {
    standalone?: PresetTargetConfig;
    monorepo?: PresetTargetConfig;
  };

  // 변형 (ORM의 sqlite/postgres 등)
  variants?: Record<string, PresetTargetConfig>;

  // 스크립트
  scripts?: Record<string, string>;

  // 환경 변수
  env?: Array<{
    key: string;
    description: string;
    required: boolean;
    secret: boolean;
  }>;

  // 설치 후 명령
  postInstall?: string[];
}

interface PresetTargetConfig {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
  remove?: string[];
  transform?: TransformOperation[];
  detect?: DetectRule;
}
```

### 카테고리 (16개)

| 카테고리 | 설명 | Exclusive | 구현된 Preset |
|----------|------|-----------|---------------|
| `linting` | 린팅/포맷팅 | ✅ | biome, eslint-prettier |
| `database` | 데이터베이스/ORM | ✅ | prisma, drizzle |
| `auth` | 인증 | ✅ | clerk, better-auth |
| `payment` | 결제 | ✅ | polar, paddle |
| `storage` | 파일 저장소 | ✅ | uploadthing, cloudflare-r2 |
| `email` | 이메일 서비스 | ✅ | resend |
| `validation` | 스키마 검증 | ✅ | zod, effect-schema |
| `testing` | 테스트 프레임워크 | ✅ | vitest, playwright |
| `analytics` | 애널리틱스 | ❌ | vercel-analytics, posthog, umami |
| `data-fetching` | 데이터 페칭 | ❌ | tanstack-query |
| `state` | 상태 관리 | ❌ | zustand, jotai, nuqs |
| `theming` | 테마 | ❌ | next-themes |
| `ui` | UI 컴포넌트 | ❌ | shadcn, shadcn-all, base-ui |
| `i18n` | 국제화 | ❌ | next-intl |
| `ai` | AI 통합 | ❌ | vercel-ai |
| `form` | 폼 처리 | ❌ | react-hook-form |

**Exclusive**: 해당 카테고리에서 하나의 preset만 선택 가능

### 구현된 Preset (29개)

```
linting/        biome, eslint-prettier
database/       prisma, drizzle
auth/           clerk, better-auth
payment/        polar, paddle
storage/        uploadthing, cloudflare-r2
email/          resend
validation/     zod, effect-schema
testing/        vitest, playwright
analytics/      vercel-analytics, posthog, umami
data-fetching/  tanstack-query
state/          zustand, jotai, nuqs
theming/        next-themes
ui/             shadcn, shadcn-all, base-ui
i18n/           next-intl
ai/             vercel-ai
form/           react-hook-form
```

### Preset 처리 흐름

```
사용자 요청 (add/remove)
    ↓
manifest.json 로드
    ↓
타겟 결정 (standalone/monorepo)
    ↓
충돌/의존성 검증
    ↓
Transform 작업 생성
    ↓
AST 기반 코드 변환
    ↓
파일 복사/삭제
    ↓
패키지 매니저 실행 (pnpm/npm/yarn/bun)
    ↓
postInstall 스크립트 실행
    ↓
완료
```

---

## 템플릿 시스템

### 기본 템플릿 (src/templates/)

| 파일 | 용도 |
|------|------|
| `providers.tsx` | Next.js App Router providers 래퍼 |
| `layout.tsx` | Next.js App Router root layout |

### 사용자 커스터마이징

사용자는 `.obora/templates/` 디렉토리에 템플릿을 배치하여 오버라이드 가능:

```
project/
└── .obora/
    └── templates/
        ├── providers.tsx   # 커스텀 providers
        └── layout.tsx      # 커스텀 layout
```

### 템플릿 로드 우선순위

1. 사용자 템플릿 (.obora/templates/)
2. 기본 템플릿 (패키지 내장)

---

## 테스트

### 테스트 프레임워크

- **Vitest**: 테스트 러너
- **@vitest/coverage-v8**: 커버리지

### 테스트 구조

```
test/
├── commands/           # 명령어별 테스트
│   ├── add.test.ts
│   ├── remove.test.ts
│   ├── create.test.ts
│   └── ...
├── utils/              # 유틸리티 테스트
│   ├── transform.test.ts
│   ├── preset-validator.test.ts
│   └── ...
└── e2e/                # E2E 테스트
    └── presets.test.ts
```

### 테스트 실행

```bash
pnpm test              # 전체 테스트
pnpm test:watch        # 워치 모드
pnpm test:coverage     # 커버리지 포함
```

---

## 설계 원칙

1. **선언적 구성**: manifest.json으로 모든 작업 정의
2. **AST 기반 변환**: 코드 구조 이해 및 포맷 보존
3. **자동 감지**: 기존 설정으로 환경 자동 감지
4. **트랜잭션**: 실패 시 자동 롤백
5. **Dry-run**: 변경 사항 미리보기 지원
6. **템플릿 커스터마이징**: 사용자 오버라이드 지원

---

## 보안

- **Zod 스키마 검증**: 모든 입력 검증
- **경로 검증**: 금지된 경로 접근 방지
- **환경 변수 관리**: 민감 정보 분리
- **파일 백업**: 변경 전 자동 백업 (eject 등)
