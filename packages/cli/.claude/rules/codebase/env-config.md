---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/.env*"
  - "**/config/**/*"
---

# Environment Configuration

환경 변수 및 설정 관리 원칙입니다.

## 핵심 원칙

**환경 분리**: 환경별 설정을 코드와 분리합니다.

## 환경 변수

### 네이밍 규칙

```bash
# Good - UPPER_SNAKE_CASE
DATABASE_URL=
API_KEY=
NEXT_PUBLIC_APP_URL=

# Bad
databaseUrl=
apiKey=
```

### 필수 변수 검증

```typescript
// Good - 시작 시 검증
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]),
});

export const env = envSchema.parse(process.env);

// Bad - 런타임에 실패
const dbUrl = process.env.DATABASE_URL!;  // undefined일 수 있음
```

### 타입 안전 접근

```typescript
// Good
import { env } from "@/config/env";
const url = env.DATABASE_URL;  // 타입 안전

// Bad
const url = process.env.DATABASE_URL;  // string | undefined
```

## .env 파일 구조

```
.env                 # 기본값 (버전 관리 가능, 민감정보 X)
.env.local           # 로컬 오버라이드 (gitignore)
.env.development     # 개발 환경
.env.production      # 프로덕션 환경
.env.test            # 테스트 환경
.env.example         # 템플릿 (버전 관리, 값 없음)
```

### .env.example 유지

```bash
# .env.example - 필요한 변수 목록
DATABASE_URL=
API_KEY=
NEXT_PUBLIC_APP_URL=

# 실제 값은 .env.local에
```

## 설정 모듈화

```typescript
// config/database.ts
export const databaseConfig = {
  url: env.DATABASE_URL,
  maxConnections: env.DB_MAX_CONNECTIONS,
  ssl: env.NODE_ENV === "production",
};

// config/auth.ts
export const authConfig = {
  jwtSecret: env.JWT_SECRET,
  tokenExpiry: env.TOKEN_EXPIRY,
};
```

## 금지 사항

### 하드코딩된 설정

```typescript
// Bad
const apiUrl = "https://api.example.com";
const timeout = 5000;

// Good
const apiUrl = env.API_URL;
const timeout = env.REQUEST_TIMEOUT;
```

### 민감 정보 커밋

```bash
# .gitignore
.env.local
.env.*.local
*.pem
*.key
```

### 클라이언트 노출

```typescript
// Bad - 서버 전용 변수를 클라이언트에 노출
const apiKey = process.env.API_KEY;  // 클라이언트 번들에 포함

// Good - NEXT_PUBLIC_ 접두사로 명시
const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
```

## 환경별 동작

```typescript
// 환경 확인
const isDev = env.NODE_ENV === "development";
const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

// 환경별 설정
const config = {
  logLevel: isProd ? "info" : "debug",
  enableMock: isTest,
  apiUrl: isDev ? "http://localhost:3000" : env.API_URL,
};
```

## 비밀 관리

```typescript
// 프로덕션에서는 환경 변수 대신 비밀 관리 서비스 사용
// - AWS Secrets Manager
// - HashiCorp Vault
// - Vercel Environment Variables (encrypted)

// 로컬에서만 .env 파일 사용
if (isDev) {
  dotenv.config();
}
```
