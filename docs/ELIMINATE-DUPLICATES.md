# Duplicate Code Elimination Plan

중복 코드 제거를 위한 구체적인 계획입니다.

## 개요

코드베이스 전반에서 발견된 중복을 제거하여 유지보수성과 개발 효율을 향상합니다.

---

## 1. 공통 유틸리티 패키지 생성 (@obora/utils)

### 현재 상황

`cn` helper가 다음 위치에 중복 정의되어 있습니다:

- `/presets/ui/shadcn/nextjs/lib/utils.ts`
- `/packages/dashboard/lib/utils.ts`
- `/packages/project-templates/templates/apps/shared-ui/files/src/lib/utils.ts`

### 계획

1. **패키지 생성**

   ```bash
   mkdir -p packages/utils/src
   ```

2. **기존 구현 확인**

   ```bash
   # 모든 cn helper 구현 검색
   grep -r "cn\|className\|clsx\|tw-merge" presets/ui/shadcn/
   grep -r "cn\|className\|clsx\|tw-merge" packages/dashboard/lib/
   grep -r "cn\|className\|clsx\|tw-merge" packages/project-templates/
   ```

3. **최적 구현 선택**
   - 가장 완전한 구현 선택
   - 의존성(`clsx`, `tailwind-merge`) 확인

4. **패키지 설정**

   ```json
   {
     "name": "@obora/utils",
     "version": "0.1.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "import": "./dist/index.js",
         "types": "./dist/index.d.ts"
       }
     },
     "dependencies": {
       "clsx": "^2.1.1",
       "tailwind-merge": "^2.5.0"
     }
   }
   ```

5. **index.ts 작성**

   ```typescript
   export { cn } from "./cn";
   ```

6. **기존 파일 업데이트**
   - `presets/ui/shadcn/`에서 `@obora/utils`로 임포트
   - `packages/dashboard/lib/utils.ts`에서 `@obora/utils`로 임포트
   - `packages/project-templates/templates/apps/shared-ui/files/src/lib/utils.ts`에서 `@obora/utils`로 임포트

### 예상 효과

- ✅ 코드 중복 제거 (~50줄)
- ✅ 단일 진실 원천 (Single Source of Truth)
- ✅ 유지보수성 향상 (유틸리티 변경 시 한 곳만 수정)

---

## 2. 공통 타입 패키지 생성 (@obora/types)

### 현재 상황

인증 관련 타입이 여러 프리셋에 중복 정의되어 있습니다:

- `AuthUser`, `Session`, `SignInRequest`, `SignUpRequest` 등

### 계획

1. **패키지 생성**

   ```bash
   mkdir -p packages/types/src
   ```

2. **인증 타입 추출**
   - `better-auth`: `AuthUser`, `Session`, `AuthConfig`
   - `clerk`: `AuthUser`, `Session`
   - 공통 필드 식별 (`id`, `email`, `name`, `createdAt`, etc.)

3. **표준 인터페이스 정의**

   ```typescript
   // packages/types/src/auth.ts
   export interface AuthUser {
     id: string;
     email: string;
     name?: string;
     avatarUrl?: string;
     emailVerified?: boolean;
     createdAt: Date;
   }

   export interface Session {
     id: string;
     userId: string;
     expiresAt: Date;
   }
   ```

4. **패키지 설정**

   ```json
   {
     "name": "@obora/types",
     "version": "0.1.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts"
   }
   ```

5. **index.ts 작성**
   ```typescript
   export type * from "./auth";
   ```

### 예상 효과

- ✅ 타입 정의 중복 제거
- ✅ 프리셋 간 타입 호환성 보장
- ✅ 인증 공급자 교체 용이 (동일 인터페이스 사용)

---

## 3. JSON.parse() 스키마 검증 (런타임 안전성)

### 현재 상황

`project-config.ts`에서 `JSON.parse()` 결과에 런타임 검증 없이 타입 단언(`as Type`)을 사용하고 있습니다.

### 대상 파일

- `/packages/project-config/src/project-config.ts` (Line 75, 154, 279, 643, 708)

### 계획

1. **Zod 스키마 정의**

   ```typescript
   // packages/project-config/src/schemas.ts
   import { z } from "zod";

   export const projectConfigSchema = z.object({
     name: z.string(),
     version: z.string(),
     base: z.string(),
     presets: z.array(z.string()),
     // ... 기존 필드
   });
   ```

2. **검증 로직 추가**

   ```typescript
   import { projectConfigSchema } from "./schemas";

   export function loadConfigFile(filePath: string): ProjectConfig {
     const raw = fs.readFileSync(filePath, "utf-8");
     const parsed = JSON.parse(raw);

     // 런타임 검증 추가
     const result = projectConfigSchema.safeParse(parsed);
     if (!result.success) {
       throw new Error(`Invalid config file: ${result.error.message}`);
     }

     return result.data;
   }
   ```

3. **테스트 추가**

   ```typescript
   // packages/project-config/src/__tests__/config.test.ts
   describe("loadConfigFile", () => {
     it("should validate config structure", () => {
       const validConfig = { name: "my-app", presets: ["clerk"] };
       // ...
     });

     it("should throw error for invalid JSON", () => {
       const invalidJson = "{ invalid json }";
       expect(() => loadConfigFile("config.json", invalidJson)).toThrow();
     });
   });
   ```

### 예상 효과

- ✅ 런타임 타입 검증 확보
- ✅ 구체적인 에러 메시지 제공
- ✅ 잘못된 설정 파일 조기 감지

---

## 4. Dashboard `any` 타입 제거

### 현재 상황

`packages/dashboard/app/page.tsx`에서 `stats: any` 파라미터 사용이 발견되었습니다.

### 대상 파일

- `/packages/dashboard/app/page.tsx` (Line 49, 57, 65, 73)

### 계획

1. **Stats 타입 정의**

   ```typescript
   // packages/dashboard/src/types/stats.ts
   export interface StatConfig {
     totalUsers: number;
     activeUsers: number;
     totalSessions: number;
     avgSessionDuration: number;
     growthRate: number;
   }

   export interface StatCardProps {
     label: string;
     value: number;
     change?: number;
     changeType?: "increase" | "decrease" | "neutral";
   }
   ```

2. **statsConfig 객체 정의**

   ```typescript
   // packages/dashboard/app/page.tsx
   const statsConfig: StatConfig[] = [
     { label: "Total Users", value: 1234, growthRate: 5.2 },
     { label: "Active Sessions", value: 456, avgDuration: 180 },
     // ...
   ];
   ```

3. **타입 적용**
   ```typescript
   function StatsCard({ config }: StatCardProps) {
     return (
       <div>
         <h3>{config.label}</h3>
         <p>{config.value}</p>
         {config.change !== undefined && (
           <p className={config.changeType === "increase" ? "text-green" : "text-red"}>
             {config.change > 0 ? "+" : ""}{config.change}
           </p>
         )}
       </div>
     );
   }
   ```

### 예상 효과

- ✅ `any` 타입 제거
- ✅ 명확한 타입 정의
- ✅ TypeScript 컴파일 타임 에러 방지

---

## 실행 순서

| 순서 | 작업                     | 예상 시간 | 의존성 |
| ---- | ------------------------ | --------- | ------ |
| 1    | @obora/utils 패키지 생성 | 10분      | 없음   |
| 2    | @obora/types 패키지 생성 | 10분      | 없음   |
| 3    | JSON.parse() 검증 추가   | 15분      | 없음   |
| 4    | Dashboard any 제거       | 10분      | 없음   |

**총 예상 시간**: 45분

---

## 완료 기준

| 작업               | 완료 조건                                |
| ------------------ | ---------------------------------------- |
| @obora/utils 생성  | 패키지 설치 및 의존성 업데이트 완료      |
| @obora/types 생성  | 패키지 설치 및 타입 정의 완료            |
| JSON 검증 추가     | 테스트 통과                              |
| Dashboard any 제거 | `any` 타입이 모두 구체적 타입으로 교체됨 |

---

## 다음 단계

이 작업들이 완료된 후:

1. 기존 파일에서 새 패키지 임포트 업데이트
2. 문서 업데이트 (README에 중복 제거 방법 설명)
3. Git 커밋
