# Next.js Conventions

Next.js 프로젝트의 일관된 개발 규칙입니다.

## 핵심 원칙

**App Router 필수 사용**: Next.js 13+ App Router를 기본으로 사용합니다.

## App Router

### 디렉토리 구조

```
app/
├── layout.tsx          # Root layout
├── page.tsx            # Home page
├── providers.tsx       # Client providers (QueryClient 등)
├── globals.css
├── components/         # Shared components
├── [feature]/
│   ├── page.tsx
│   └── [id]/
│       └── page.tsx
└── api/
    └── [resource]/
        └── route.ts    # API Route Handler
```

### 파일 명명 규칙

| 파일명 | 용도 |
|--------|------|
| `page.tsx` | 라우트 페이지 |
| `layout.tsx` | 레이아웃 |
| `loading.tsx` | 로딩 UI |
| `error.tsx` | 에러 바운더리 |
| `not-found.tsx` | 404 페이지 |
| `route.ts` | API 엔드포인트 |

### Server vs Client Components

```tsx
// Server Component (기본값)
// 서버에서 실행, 번들 크기 감소
export default function ServerPage() {
  return <div>Server rendered</div>;
}

// Client Component
// 브라우저에서 실행, interactivity 필요 시
"use client";

export default function ClientPage() {
  const [state, setState] = useState();
  return <div>Client rendered</div>;
}
```

### 사용 기준

```yaml
Server_Component:
  - 데이터 fetching (직접 DB 접근)
  - 민감한 정보 접근 (API keys, tokens)
  - 정적 콘텐츠 렌더링
  - SEO 중요 페이지

Client_Component:
  - 상태 관리 (useState, useReducer)
  - 이벤트 핸들러 (onClick, onChange)
  - 브라우저 API (localStorage, window)
  - TanStack Query 사용
  - 실시간 업데이트
```

## 금지 사항

### Pages Router 사용 금지

```typescript
// Bad - Pages Router
// pages/index.tsx
// pages/api/users.ts

// Good - App Router
// app/page.tsx
// app/api/users/route.ts
```

### getServerSideProps / getStaticProps 금지

```typescript
// Bad - Legacy data fetching
export async function getServerSideProps() { }
export async function getStaticProps() { }

// Good - Server Component에서 직접 fetch
async function getData() {
  const res = await fetch('...');
  return res.json();
}

export default async function Page() {
  const data = await getData();
  return <div>{data}</div>;
}
```

## API Route Handler

### 구조

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const data = await fetchUsers();
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // 검증 로직
  const user = await createUser(body);
  return NextResponse.json({ success: true, data: user });
}
```

### Dynamic Route

```typescript
// app/api/users/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUser(id);
  return NextResponse.json({ success: true, data: user });
}
```

## 요약

```yaml
필수:
  - App Router 사용
  - Server/Client Component 구분
  - API Route Handler (route.ts) 사용

금지:
  - Pages Router
  - getServerSideProps / getStaticProps
  - pages/ 디렉토리 사용
```
