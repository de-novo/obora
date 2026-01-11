---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
---

# Import Organization

임포트 정리 원칙입니다.

## 핵심 원칙

**일관된 순서**: 임포트는 그룹별로 정렬합니다.

## 임포트 순서

```typescript
// 1. 외부 라이브러리 (node_modules)
import { useState, useEffect } from "react";
import { z } from "zod";
import clsx from "clsx";

// 2. 내부 모듈 (절대 경로)
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/utils";

// 3. 상대 경로 임포트
import { Header } from "./header";
import { Footer } from "./footer";

// 4. 타입 임포트
import type { User } from "@/types";
import type { ButtonProps } from "./types";

// 5. 스타일/에셋
import "./styles.css";
```

## 절대 경로 사용

### tsconfig.json paths 설정

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 사용

```typescript
// Good - 절대 경로
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

// Bad - 깊은 상대 경로
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../../hooks/use-auth";
```

## 타입 임포트 분리

```typescript
// Good - type 키워드 사용
import type { User, Post } from "@/types";
import { fetchUser } from "@/api/users";

// 또는 인라인 타입 임포트
import { fetchUser, type User } from "@/api/users";

// Bad - 타입과 값 혼합
import { User, fetchUser } from "@/api/users";
```

## Named Export 선호

```typescript
// Good - Named export
export { Button } from "./button";
export { Input } from "./input";

// 사용
import { Button, Input } from "@/components/ui";

// Bad - Default export (리팩토링 어려움)
export default Button;
```

## 배럴 파일 (index.ts)

### 적절한 사용

```typescript
// components/ui/index.ts
export { Button } from "./button";
export { Input } from "./input";
export { Card } from "./card";

// 사용 - 깔끔한 임포트
import { Button, Input, Card } from "@/components/ui";
```

### 주의사항

```typescript
// Bad - 전체 re-export (트리쉐이킹 방해)
export * from "./button";
export * from "./input";
export * from "./card";

// 대용량 모듈은 직접 임포트 권장
import { Button } from "@/components/ui/button";
```

## 금지 사항

### 순환 의존성

```typescript
// file-a.ts
import { funcB } from "./file-b";  // file-b가 file-a 임포트하면 순환

// 해결: 공통 모듈로 분리
```

### 사용하지 않는 임포트

```typescript
// Bad
import { useState, useEffect, useCallback } from "react";  // useCallback 미사용

// Good - 사용하는 것만 임포트
import { useState, useEffect } from "react";
```

### 부수효과 임포트 최소화

```typescript
// Bad - 부수효과 임포트
import "./init";  // 무엇을 하는지 불명확

// Good - 명시적 초기화
import { initialize } from "./init";
initialize();
```

## ESLint 설정

```json
{
  "rules": {
    "import/order": ["error", {
      "groups": [
        "builtin",
        "external",
        "internal",
        "parent",
        "sibling",
        "index",
        "type"
      ],
      "newlines-between": "always",
      "alphabetize": { "order": "asc" }
    }],
    "import/no-cycle": "error",
    "unused-imports/no-unused-imports": "error"
  }
}
```
