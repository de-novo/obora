# Transform System

AST 기반 코드 변환 시스템 문서입니다.

## 개요

Transform 시스템은 magicast를 사용하여 AST(Abstract Syntax Tree) 기반으로 코드를 수정합니다. 기존 marker 기반 문자열 주입 방식(`inject`)에 비해 다음과 같은 장점이 있습니다:

| 특성 | marker/inject | transform |
|------|---------------|-----------|
| AST 인식 | ❌ | ✅ |
| 중복 검사 | 문자열 includes() | AST 노드 비교 |
| 포맷 보존 | ❌ | ✅ |
| 위치 제약 | 마커 필요 | 자동 감지 |
| 구문 유효성 | ❌ | ✅ |

## Transform 타입

### 1. import

TypeScript/JavaScript 파일에 import 문을 추가합니다.

```json
{
  "target": "src/app.module.ts",
  "type": "import",
  "content": "import { PrismaModule } from './prisma/prisma.module'"
}
```

**지원 형식:**
- Named import: `import { A, B } from 'module'`
- Default import: `import Default from 'module'`
- Namespace import: `import * as NS from 'module'`
- Mixed import: `import Default, { A, B } from 'module'`

**동작:**
- 동일 모듈에서 이미 import가 있으면 named import를 병합
- 이미 존재하는 항목은 건너뜀
- 기존 코드 포맷 유지

### 2. dependency

package.json에 의존성을 추가합니다.

```json
{
  "target": "package.json",
  "type": "dependency",
  "name": "@prisma/client",
  "version": "^5.0.0",
  "dev": false
}
```

**필드:**
- `name`: 패키지 이름 (필수)
- `version`: 버전 문자열 (필수)
- `dev`: true이면 devDependencies에 추가 (선택, 기본값: false)

**동작:**
- 이미 존재하면 건너뜀
- 의존성 목록을 알파벳순으로 정렬
- JSON 포맷 유지 (2칸 들여쓰기)

### 3. nestjs-module

NestJS `@Module` 데코레이터의 imports 배열에 모듈을 추가합니다.

```json
{
  "target": "src/app.module.ts",
  "type": "nestjs-module",
  "module": "PrismaModule"
}
```

**필드:**
- `module`: 추가할 모듈 이름 (필수)

**동작:**
- imports 배열에서 기존 모듈 검색
- 이미 존재하면 건너뜀
- 배열 포맷에 맞게 추가 (trailing comma 처리)

**주의:** 해당 모듈의 import 문은 별도의 `type: "import"` transform으로 추가해야 합니다.

### 4. provider-wrap

React providers 파일에서 `{children}`을 Provider 컴포넌트로 감쌉니다.

```json
{
  "target": "app/providers.tsx",
  "type": "provider-wrap",
  "provider": "QueryClientProvider",
  "props": {
    "client": "queryClient"
  }
}
```

**필드:**
- `provider`: Provider 컴포넌트 이름 (필수)
- `props`: 전달할 props (선택)

**동작:**
- `{children}` 패턴을 찾아서 `<Provider>{children}</Provider>`로 감쌈
- 이미 해당 Provider가 있으면 건너뜀
- props가 있으면 `<Provider prop={value}>` 형태로 추가

**주의:** 복잡한 JSX 구조에서는 수동 추가가 필요할 수 있습니다.

## Manifest 스키마

preset manifest.json의 transform 필드 스키마:

```typescript
interface PresetTransform {
  /** 대상 파일 경로 (preset target 디렉토리 기준 상대 경로) */
  target: string;

  /** Transform 타입 */
  type: "import" | "dependency" | "nestjs-module" | "provider-wrap";

  /** import: import 문 문자열 */
  content?: string;

  /** dependency: 패키지 이름 */
  name?: string;

  /** dependency: 버전 문자열 */
  version?: string;

  /** dependency: devDependency 여부 */
  dev?: boolean;

  /** nestjs-module: 모듈 이름 */
  module?: string;

  /** provider-wrap: Provider 컴포넌트 이름 */
  provider?: string;

  /** provider-wrap: props 객체 */
  props?: Record<string, string>;
}
```

## 전체 예시

### NestJS Prisma Preset

```json
{
  "name": "prisma",
  "category": "database",
  "version": "1.0.0",
  "targets": {
    "nestjs": {
      "dependencies": {
        "@prisma/client": "^5.0.0"
      },
      "devDependencies": {
        "prisma": "^5.0.0"
      },
      "files": [
        "prisma/schema.prisma",
        "src/prisma/prisma.module.ts",
        "src/prisma/prisma.service.ts"
      ],
      "transform": [
        {
          "target": "src/app.module.ts",
          "type": "import",
          "content": "import { PrismaModule } from './prisma/prisma.module'"
        },
        {
          "target": "src/app.module.ts",
          "type": "nestjs-module",
          "module": "PrismaModule"
        }
      ]
    }
  }
}
```

### Next.js TanStack Query Preset

```json
{
  "name": "tanstack-query",
  "category": "state",
  "version": "1.0.0",
  "targets": {
    "nextjs": {
      "dependencies": {
        "@tanstack/react-query": "^5.0.0"
      },
      "files": [
        "lib/query-client.ts"
      ],
      "transform": [
        {
          "target": "app/providers.tsx",
          "type": "import",
          "content": "import { QueryClientProvider } from '@tanstack/react-query'"
        },
        {
          "target": "app/providers.tsx",
          "type": "import",
          "content": "import { queryClient } from '@/lib/query-client'"
        },
        {
          "target": "app/providers.tsx",
          "type": "provider-wrap",
          "provider": "QueryClientProvider",
          "props": {
            "client": "queryClient"
          }
        }
      ]
    }
  }
}
```

## API 참조

### addImport

```typescript
import { addImport, ImportSpec } from "@obora/cli/utils/transform";

const spec: ImportSpec = {
  from: "@nestjs/common",
  named: ["Module", "Injectable"]
};

const result = await addImport("src/app.module.ts", spec);
// result: { success: boolean, changed?: boolean, content?: string, error?: string }
```

### addDependency

```typescript
import { addDependency, DependencySpec } from "@obora/cli/utils/transform";

const spec: DependencySpec = {
  name: "@prisma/client",
  version: "^5.0.0",
  dev: false
};

const result = await addDependency("package.json", spec);
```

### addNestJsModule

```typescript
import { addNestJsModule, NestJsModuleSpec } from "@obora/cli/utils/transform";

const spec: NestJsModuleSpec = {
  module: "PrismaModule"
};

const result = await addNestJsModule("src/app.module.ts", spec);
```

### addProviderWrap

```typescript
import { addProviderWrap, ProviderWrapSpec } from "@obora/cli/utils/transform";

const spec: ProviderWrapSpec = {
  provider: "QueryClientProvider",
  props: { client: "queryClient" }
};

const result = await addProviderWrap("app/providers.tsx", spec);
```

### applyTransforms

여러 transform 작업을 한 번에 적용:

```typescript
import { applyTransforms, TransformOperation } from "@obora/cli/utils/transform";

const operations = [
  {
    target: "src/app.module.ts",
    operation: {
      type: "import" as const,
      spec: { from: "./prisma/prisma.module", named: ["PrismaModule"] }
    }
  },
  {
    target: "src/app.module.ts",
    operation: {
      type: "nestjs-module" as const,
      spec: { module: "PrismaModule" }
    }
  }
];

const results = await applyTransforms(operations, "/path/to/project");
```

### parseImportStatement

import 문 문자열을 ImportSpec으로 파싱:

```typescript
import { parseImportStatement } from "@obora/cli/utils/transform";

const spec = parseImportStatement("import { Module } from '@nestjs/common'");
// spec: { from: "@nestjs/common", named: ["Module"] }
```

## TransformResult

모든 transform 함수는 동일한 결과 타입을 반환합니다:

```typescript
interface TransformResult {
  /** 작업 성공 여부 */
  success: boolean;

  /** 실제 변경이 발생했는지 (이미 존재하면 false) */
  changed?: boolean;

  /** 변경된 파일 내용 */
  content?: string;

  /** 실패 시 에러 메시지 */
  error?: string;
}
```

## inject에서 transform으로 마이그레이션

### Before (inject)

```json
{
  "inject": [
    {
      "target": "src/app.module.ts",
      "marker": "@obora:imports",
      "content": "import { PrismaModule } from './prisma/prisma.module';"
    },
    {
      "target": "src/app.module.ts",
      "marker": "@obora:modules",
      "content": "PrismaModule,"
    }
  ]
}
```

### After (transform)

```json
{
  "transform": [
    {
      "target": "src/app.module.ts",
      "type": "import",
      "content": "import { PrismaModule } from './prisma/prisma.module'"
    },
    {
      "target": "src/app.module.ts",
      "type": "nestjs-module",
      "module": "PrismaModule"
    }
  ]
}
```

**주요 차이점:**
1. `marker` 필드 불필요 - AST가 자동으로 올바른 위치 결정
2. `type` 필드로 작업 종류 명시
3. 세미콜론/trailing comma 자동 처리
4. 중복 삽입 자동 방지

## 제한사항

1. **복잡한 JSX 구조**: `provider-wrap`은 단순한 `{children}` 패턴만 처리
2. **비표준 구문**: ESM/CJS 혼합 등 비표준 구문은 fallback 처리될 수 있음
3. **대용량 파일**: AST 파싱은 문자열 처리보다 느림 (대부분 무시할 수준)

## 문제 해결

### "Could not find imports array in @Module decorator"

NestJS 모듈 파일에 `@Module` 데코레이터의 `imports` 배열이 없습니다. 수동으로 추가하거나:

```typescript
@Module({
  imports: [],  // 이 배열이 필요
  controllers: [],
  providers: [],
})
```

### "Could not parse import statement"

import 문 형식이 올바른지 확인:
- `import { A } from 'module'` ✅
- `import A from 'module'` ✅
- `require('module')` ❌ (지원 안함)

### "File not found"

`target` 경로가 preset target 디렉토리 기준 상대 경로인지 확인하세요.
