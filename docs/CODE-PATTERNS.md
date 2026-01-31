# Preset Code Patterns Guide

프리셋 개발 시 일관성 있는 코드 패턴을 유지하기 위한 가이드입니다.

## 목표

- 모든 프리셋이 동일한 구조와 네이밍 규칙을 따르도록 표준화
- 프리셋 간 복사/붙여넣기를 용이하게 만들어 유지보수성 향상
- 새 프리셋 개발 시 어떻게 구성해야 할지 명확한 기준 제공

---

## 1. 타겟(Target) 네이밍 표준

### 규칙

프리셋이 지원하는 실행 환경/플랫폼에 따라 다음 표준 타겟 이름을 사용합니다.

| 환경/플랫폼                    | 표준 타겟명       | 설명                               |
| ------------------------------ | ----------------- | ---------------------------------- |
| NestJS 백엔드                  | `nestjs`          | NestJS 백엔드 모듈                 |
| Next.js 프론트엔드             | `nextjs`          | Next.js 웹 앱                      |
| Next.js App Router (자동 주입) | `nextjs-auto`     | Next.js 레이아웃에 자동 코드 주입  |
| Next.js DevTools               | `nextjs-devtools` | React DevTools 확장                |
| Monorepo 공유 패키지           | `monorepo`        | `packages/` 디렉토리에 공유 패키지 |
| PostgreSQL                     | `postgres`        | PostgreSQL 데이터베이스            |
| SQLite                         | `sqlite`          | SQLite 데이터베이스                |
| MySQL                          | `mysql`           | MySQL 데이터베이스                 |
| tRPC                           | `trpc`            | tRPC 통합                          |

### 예시

```json
{
  "name": "example-preset",
  "category": "auth",
  "targets": {
    "nestjs": {
      "description": "NestJS 백엔드 통합",
      "files": ["nestjs"]
    },
    "nextjs": {
      "description": "Next.js 프론트엔드 통합",
      "files": ["nextjs"]
    },
    "nextjs-auto": {
      "description": "Next.js App Router에 자동 주입",
      "files": ["nextjs"],
      "transform": [
        {
          "target": "app/layout.tsx",
          "type": "layout-component"
        }
      ]
    },
    "monorepo": {
      "description": "Monorepo 공유 패키지",
      "files": ["monorepo"],
      "packageJson": {
        "name": "@{{workspace}}/shared-feature"
      }
    }
  }
}
```

### 금지 사항

- ❌ `server` 대신 `nestjs` 사용 (혼동 유발)
- ❌ `client` 대신 `nextjs` 사용
- ❌ `standalone` 대신 구체적인 환경명 사용

---

## 2. `files/` 디렉토리 구조 표준

### 규칙

모든 프리셋은 `files/[target]/` 패턴을 따르며, 각 타겟 폴더 내에서 `src/`를 기본으로 사용합니다.

### 표준 구조

```
presets/<category>/<preset-name>/
├── manifest.json           # 프리셋 메타데이터
├── env.example            # 환경변수 예시 (선택사항)
├── README.md             # 프리셋 설명 (선택사항)
└── files/
    ├── [target-1]/
    │   └── src/
    │       ├── index.ts      # 메인 내보내기
    │       ├── types.ts      # 타입 정의
    │       ├── service.ts    # 서비스/로직 (nestjs)
    │       ├── controller.ts # 컨트롤러 (nestjs)
    │       ├── module.ts     # NestJS 모듈 (nestjs)
    │       └── lib/          # 유틸리티 (nextjs)
    ├── [target-2]/
    │   └── src/
    │       └── ...
    └── common/              # 공통 파일 (모든 타겟에 적용)
        └── ...
```

### 예시

```
presets/auth/clerk/
├── manifest.json
├── env.example
├── README.md
└── files/
    ├── nestjs/
    │   └── src/
    │       ├── modules/
    │       │   └── auth/
    │       │       ├── auth.module.ts
    │       │       ├── auth.service.ts
    │       │       ├── auth.controller.ts
    │       │       └── index.ts
    │       └── types.ts
    ├── nextjs/
    │   └── src/
    │       └── lib/
    │           ├── clerk.ts
    │           └── index.ts
    └── monorepo/
        └── src/
            ├── index.ts
            ├── backend.ts
            └── types.ts
```

### 공통 파일(`common/`)

모든 타겟에 적용되는 파일이 있을 경우 `files/common/`에 배치합니다.

```json
{
  "files": ["common"],
  "common": {
    "files": ["src/types/shared.ts", "src/utils/helper.ts"]
  }
}
```

---

## 3. 타입 정의 패턴 표준

### 3.1 `interface` vs `type` 사용 기준

| 상황                     | 사용        | 설명                       |
| ------------------------ | ----------- | -------------------------- |
| 공개 API / 도메인 엔티티 | `interface` | 확장 가능한 공개 계약      |
| 유니온 / 인터섹션 / 매핑 | `type`      | 조합/변형 불가능한 타입    |
| 스키마에서 추론          | `type`      | Zod/Prisma에서 추론된 타입 |
| 컴포넌트 Props           | `interface` | Props는 확장 가능해야 함   |
| 함수 매개변수/반환값     | `type`      | 간단한 타입 표현           |

### 예시

```typescript
// ✅ Good - 공개 API 엔티티
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

// ✅ Good - 스키마 추론
export type SignInInput = z.infer<typeof signInSchema>;

// ✅ Good - 유니온 타입
export type UserStatus = "active" | "inactive" | "suspended";

// ✅ Good - 컴포넌트 Props
export interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

// ✅ Good - 함수 타입
export type ErrorHandler = (error: Error) => void;
```

### 3.2 타입 파일 위치

| 용도         | 표준 위치                                                          | 예시            |
| ------------ | ------------------------------------------------------------------ | --------------- |
| 공유 타입    | `src/types.ts` 또는 `src/types/index.ts`                           | 도메인 엔티티   |
| 스키마 타입  | `src/schemas.ts` 또는 `src/lib/validation/schemas.ts`              | 검증 스키마     |
| DTO (NestJS) | `src/modules/[name]/dto.ts` 또는 `src/modules/[name]/dto/*.dto.ts` | API 입력/출력   |
| Next.js 타입 | `src/lib/types.ts`                                                 | 프론트엔드 타입 |

---

## 4. 인덱스 파일(`index.ts`) 내보내기 표준

### 규칙

항상 **명시적 내보내기**를 사용합니다. `export * from`는 피해야 합니다.

### 명시적 내보내기

```typescript
// ✅ Good - 명시적 내보내기
export type { AuthUser, Session } from "./types";
export { authenticate, verifyToken } from "./auth";
export { AuthModule } from "./auth.module";

// ❌ Bad - 와일드카드 내보내기 (피해야 함)
export * from "./types";
export * from "./auth";
```

### 이유

1. **명시성**: 어떤 것이 내보내어지는지 명확함
2. **트리 쉐이킹**: 불필요한 재내보내기 방지
3. **IDE 성능**: 자동완성이 더 빠름
4. **번들 최적화**: 번들러가 트리 쉐이킹 더 잘함

### 그룹화

타입과 값은 분리하여 내보냅니다.

```typescript
// ✅ Good
export type { User, Session, SignInInput } from "./types";
export { login, logout, refresh } from "./auth";
export { AuthModule } from "./auth.module";

// ❌ Bad - 섞여 있음
export { User, Session, login, logout, refresh, AuthModule } from "./index";
```

---

## 5. NestJS 디렉토리 구조 표준

### 규칙

NestJS 앱 내에서 모듈의 목적에 따라 다른 디렉토리를 사용합니다.

| 모듈 유형                   | 표준 위치                            | 예시                             |
| --------------------------- | ------------------------------------ | -------------------------------- |
| 인프라스트럭처 (DB, Config) | `src/db/` 또는 `src/infrastructure/` | `DatabaseModule`, `ConfigModule` |
| 기능 모듈 (Auth, Payment)   | `src/modules/[name]/`                | `AuthModule`, `PaymentModule`    |

### 5.1 인프라스트럭처 모듈 구조

```
src/db/
├── database.module.ts      # Database 모듈 정의
├── client.ts            # DB 클라이언트 (Prisma/Drizzle)
├── schema.ts           # 스키마 정의 (선택사항)
├── database.service.ts   # DB 서비스 (선택사항)
└── index.ts            # 내보내기
```

### 5.2 기능 모듈 구조

```
src/modules/[feature-name]/
├── [feature-name].module.ts    # NestJS 모듈
├── [feature-name].service.ts    # 비즈니스 로직
├── [feature-name].controller.ts # API 컨트롤러
├── dto/                     # Data Transfer Objects
│   ├── create.dto.ts
│   └── update.dto.ts
├── guards/                  # 가드 (선택사항)
│   └── auth.guard.ts
└── index.ts                # 내보내기
```

### 예시

```
src/
├── db/
│   ├── database.module.ts
│   ├── client.ts
│   └── index.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   └── index.ts
│   └── payment/
│       ├── payment.module.ts
│       ├── payment.service.ts
│       ├── payment.controller.ts
│       └── index.ts
└── main.ts
```

---

## 6. Next.js 파일 구조 표준

### 규칙

Next.js 앱 내에서 `src/lib/` 디렉토리를 기본으로 사용합니다.

### 표준 구조

```
src/lib/
├── [feature-name]/
│   ├── index.ts            # 내보내기
│   ├── [feature-name].ts   # 핵심 로직
│   ├── client.ts          # 클라이언트 (선택사항)
│   └── types.ts          # 타입 (선택사항)
└── index.ts             # 루트 내보내기
```

### 예시

```
src/lib/
├── auth/
│   ├── index.ts
│   ├── clerk.ts
│   └── types.ts
├── query/
│   ├── index.ts
│   ├── provider.tsx
│   └── client.ts
└── index.ts
```

---

## 7. `transform` 설정 표준

### 규칙

`manifest.json`의 `transform` 필드에서 코드 주입 시 다음 규칙을 따릅니다.

### 지원 타입

| 타입               | 대상 파일           | 설명                       |
| ------------------ | ------------------- | -------------------------- |
| `import`           | 모든                | import 문 추가             |
| `dependency`       | `package.json`      | 의존성 추가                |
| `nestjs-module`    | `src/app.module.ts` | NestJS 모듈 imports에 추가 |
| `provider-wrap`    | `app/providers.tsx` | React Provider로 감싸기    |
| `layout-component` | `app/layout.tsx`    | 레이아웃에 컴포넌트 추가   |

### 예시

```json
{
  "targets": {
    "nextjs": {
      "transform": [
        {
          "target": "app/providers.tsx",
          "type": "import",
          "content": "import { AuthProvider } from \"@/lib/auth\";"
        },
        {
          "target": "app/providers.tsx",
          "type": "provider-wrap",
          "provider": "AuthProvider",
          "props": {
            "publishableKey": "${process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}"
          }
        }
      ]
    },
    "nestjs": {
      "transform": [
        {
          "target": "src/app.module.ts",
          "type": "import",
          "content": "import { DatabaseModule } from \"./db/database.module.js\";"
        },
        {
          "target": "src/app.module.ts",
          "type": "nestjs-module",
          "module": "DatabaseModule"
        }
      ]
    }
  }
}
```

---

## 8. 환경변수 정의 표준

### 규칙

`manifest.json`의 `env` 필드에서 환경변수를 정의합니다.

```json
{
  "env": [
    {
      "key": "API_KEY",
      "description": "API 키 설명",
      "required": true,
      "secret": true,
      "example": "sk_test_xxx"
    }
  ]
}
```

| 속성          | 설명               | 필수 여부        |
| ------------- | ------------------ | ---------------- |
| `key`         | 환경변수 이름      | ✅               |
| `description` | 환경변수 용도 설명 | ✅               |
| `required`    | 필수 여부          | ❌ (기본: false) |
| `secret`      | 민감 정보 여부     | ❌ (기본: false) |
| `example`     | 예시 값            | ❌               |

---

## 9. `package.json` 필드 표준

### 규칙

프리셋의 `common` 및 `targets`에서 `package.json` 관련 필드를 정의합니다.

```json
{
  "common": {
    "dependencies": {
      "package-name": "^1.0.0"
    },
    "devDependencies": {
      "dev-package-name": "^2.0.0"
    },
    "scripts": {
      "custom:script": "command"
    }
  }
}
```

---

## 10. 마이그레이션 가이드

### 기존 프리셋 표준화

기존 프리셋을 새 표준에 맞춰 마이그레이션할 때:

| 마이그레이션 항목 | 변경 사항                                  |
| ----------------- | ------------------------------------------ |
| 타겟 네이밍       | `server` → `nestjs`, `client` → `nextjs`   |
| 파일 구조         | `files/src/...` → `files/[target]/src/...` |
| 인덱스 내보내기   | `export *` → 명시적 `export { ... }`       |
| 타입 정의         | 섞인 타입 → `interface`/`type` 기준에 따름 |

### 단계별 마이그레이션

1. **manifest.json** 수정 (타겟 네이밍, 파일 경로)
2. \*\*files/` 디렉토리 재구성 (새 구조 적용)
3. **index.ts** 리팩토링 (명시적 내보내기로 변경)
4. **types.ts** 표준화 (interface/type 구분)
5. **테스트** 업데이트 (새 구조 반영)

---

## 체크리스트

새 프리셋 개발 시 다음을 확인하세요:

- [ ] 타겟 네이밍이 표준(`nestjs`, `nextjs`)을 따르는가?
- [ ] `files/[target]/src/` 구조를 따르는가?
- [ ] 공개 API 엔티티에 `interface`를 사용하는가?
- [ ] `index.ts`에 명시적 내보내기만 있는가?
- [ ] 인프라스트럭처 모듈은 `src/db/`에 있는가?
- [ ] 기능 모듈은 `src/modules/[name]/`에 있는가?
- [ ] 환경변수가 `env.example`에 정의되어 있는가?

---

## 참조

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 템플릿/프리셋 아키텍처
- [preset.schema.json](../presets/preset.schema.json) - manifest.json 스키마
- [IMPROVEMENT-PLAN-STRUCTURE.md](./IMPROVEMENT-PLAN-STRUCTURE.md) - 개선 계획 구조
