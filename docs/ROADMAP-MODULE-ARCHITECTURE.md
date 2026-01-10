# Module Architecture Roadmap

> Template 방식에서 Module 방식으로의 점진적 마이그레이션 계획

## 버전별 아키텍처

```
v0.0.x (현재)          v0.1.x               v1.0.0
──────────────────────────────────────────────────────
Template + Preset  →  Hybrid 방식    →    Full Module
  (파일 복사)         (Template에서        (LEGO 조립)
                      Module로 전환)
```

---

## v0.0.x: Template + Preset 방식

### 구조
```
templates/
├── turbo-nextjs-full/     # 완성된 템플릿
└── nestjs-api/

presets/
├── database/prisma/       # 파일 복사 + inject
├── auth/clerk/
└── ...
```

### 동작 방식
1. 템플릿 전체 복사
2. 프리셋 파일 덮어쓰기/병합
3. marker 기반 코드 주입 (`@obora:imports`, `@obora:modules`)

### 한계
- 템플릿 변경 시 모든 프리셋 수정 필요
- 프리셋 간 충돌 가능성
- 기존 프로젝트에 추가 어려움

---

## v0.1.x: Hybrid 방식 (전환기)

### 목표
- 기존 Template 방식 유지하면서 Module 도입
- `.obora/config.json` 활용한 상태 추적

### 변경점

#### 1. Preset → Module 전환
```typescript
// presets/database/prisma/module.ts (NEW)
export const prismaModule: ModuleDefinition = {
  name: "prisma",
  category: "database",
  version: "7.0.0",

  // 정적 파일 (기존 방식 호환)
  files: "./files",

  // 동적 생성 (신규)
  generate: async (context) => ({
    "prisma/schema.prisma": generateSchema(context),
  }),

  // 의존성
  dependencies: {
    "prisma": "^7.0.0",
    "@prisma/client": "^7.0.0",
  },

  // 통합 훅
  hooks: {
    afterInstall: async (context) => {
      // prisma generate 실행 등
    },
  },
};
```

#### 2. Module Registry
```typescript
// packages/cli/src/modules/registry.ts
export const moduleRegistry = {
  database: {
    prisma: () => import("@presets/database/prisma/module"),
    drizzle: () => import("@presets/database/drizzle/module"),
  },
  auth: {
    clerk: () => import("@presets/auth/clerk/module"),
    "better-auth": () => import("@presets/auth/better-auth/module"),
  },
  // ...
};
```

#### 3. 통합 시스템
```typescript
// packages/cli/src/modules/integrator.ts
export async function integrateModules(
  baseDir: string,
  modules: ModuleDefinition[]
): Promise<void> {
  const graph = buildDependencyGraph(modules);
  const sorted = topologicalSort(graph);

  for (const module of sorted) {
    await installModule(baseDir, module);
    await runIntegrationHooks(baseDir, module, modules);
  }
}
```

### 마이그레이션 경로
```bash
# 기존 프로젝트 마이그레이션
obora migrate --to-hybrid

# 신규 프로젝트는 두 방식 모두 지원
obora create my-app --template turbo-nextjs-full  # 기존 방식
obora create my-app --modules nextjs,prisma,clerk  # 신규 방식
```

---

## v1.0.0: Full Module 방식

### 구조
```
modules/
├── base/
│   ├── monorepo/          # Turborepo 기본 구조
│   ├── nextjs-app/        # Next.js 앱 모듈
│   └── nestjs-api/        # NestJS API 모듈
├── database/
│   ├── prisma/
│   └── drizzle/
├── auth/
│   ├── clerk/
│   └── better-auth/
└── ...
```

### Module 인터페이스
```typescript
interface ModuleDefinition {
  // 메타데이터
  name: string;
  category: ModuleCategory;
  version: string;
  description: string;

  // 의존성 관리
  requires: string[];           // 필수 의존 모듈
  optionalDeps: string[];       // 선택적 의존
  conflicts: string[];          // 충돌 모듈

  // 파일 생성
  generate: (context: GenerateContext) => Promise<FileMap>;

  // 패키지 의존성
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;

  // 환경 변수
  env: EnvVariable[];

  // 다른 모듈과 통합
  integrations: {
    [moduleName: string]: IntegrationFn;
  };

  // 라이프사이클 훅
  hooks: {
    beforeInstall?: HookFn;
    afterInstall?: HookFn;
    beforeRemove?: HookFn;
    afterRemove?: HookFn;
  };
}
```

### 동작 방식

```
1. Base 선택
   obora create my-app --base monorepo

2. Module 추가 (의존성 자동 해결)
   obora add nextjs-app      # apps/web 생성
   obora add prisma          # packages/database 생성
   obora add clerk           # auth 모듈, nextjs-app과 자동 통합

3. 의존성 그래프 구축
   clerk → database (any)
   polar → database (any), auth (any)

4. 통합 실행
   clerk.integrations["nextjs-app"](files)
   → middleware.ts 생성
   → layout.tsx에 ClerkProvider 주입
```

### 프로젝트 생성 흐름
```
┌─────────────────┐
│   obora create  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Select Base    │ → monorepo / single-app
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select Modules  │ → nextjs, prisma, clerk, polar...
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Resolve Deps    │ → 의존성 그래프 구축
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate Files  │ → 각 모듈의 generate() 실행
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Integrate     │ → 모듈 간 통합 훅 실행
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post Install   │ → prisma generate, etc.
└─────────────────┘
```

---

## 호환성 보장

### .obora/config.json 스키마 확장
```json
{
  "$schema": "https://obora.dev/schema/config.json",
  "version": "2.0.0",
  "architecture": "module",  // "template" | "hybrid" | "module"

  // v0.x 호환 (template 방식)
  "template": "turbo-nextjs-full",
  "slots": { ... },

  // v1.x (module 방식)
  "base": "monorepo",
  "modules": {
    "nextjs-app": { "version": "1.0.0", "config": { ... } },
    "prisma": { "version": "7.0.0", "config": { ... } },
    "clerk": { "version": "1.25.0", "config": { ... } }
  },

  "packageManager": "pnpm"
}
```

### 마이그레이션 명령어
```bash
# v0.x → v1.x 마이그레이션
obora migrate

# 단계:
# 1. 현재 설치된 preset 분석
# 2. 대응하는 module 매핑
# 3. config.json 업데이트
# 4. 필요시 파일 구조 조정
```

---

## 구현 우선순위

### Phase 1: v0.0.x 완성 (현재)
- [x] .obora/config.json 스키마
- [x] obora create (template 방식)
- [x] obora add/remove/status
- [ ] 프리셋 파일 완성
- [ ] 템플릿 파일 완성

### Phase 2: v0.1.x Hybrid
- [ ] ModuleDefinition 인터페이스 정의
- [ ] 기존 preset을 module로 변환
- [ ] Module registry 구현
- [ ] Integration system 구현

### Phase 3: v1.0.0 Full Module
- [ ] Base 시스템 구현
- [ ] 의존성 그래프 해결
- [ ] 마이그레이션 CLI
- [ ] 문서화

---

## 참고

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 현재 아키텍처
- [ORGANIZATION.md](../ORGANIZATION.md) - 프로젝트 구조
