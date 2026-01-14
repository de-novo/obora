# TanStack Query Conventions

클라이언트 측 데이터 fetching에 TanStack Query를 사용합니다.

## 핵심 원칙

**클라이언트 API 호출은 TanStack Query로 통일**: useState + useEffect 패턴 대신 useQuery를 사용합니다.

## 설정

### Provider 구성

```tsx
// app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000,           // 1초 후 stale
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Layout에 적용

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## API 함수 분리

### 구조

```typescript
// lib/api.ts
import type { ApiResponse } from "./types";

const BASE_URL = "";

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`);
  const result: ApiResponse<T> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "API request failed");
  }

  return result.data;
}

// 개별 API 함수
export async function fetchUsers(): Promise<User[]> {
  return fetchApi<User[]>("/api/users");
}

export async function fetchUser(id: string): Promise<User> {
  return fetchApi<User>(`/api/users/${id}`);
}

// Query Keys 중앙 관리
export const queryKeys = {
  users: ["users"] as const,
  user: (id: string) => ["users", id] as const,
  posts: (userId?: string) => ["posts", { userId }] as const,
};
```

## useQuery 사용

### 기본 사용

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchUsers, queryKeys } from "@/lib/api";

export default function UsersPage() {
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: queryKeys.users,
    queryFn: fetchUsers,
  });

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return <UserList users={users} />;
}
```

### 조건부 Polling (refetchInterval)

```tsx
const { data: workflow } = useQuery({
  queryKey: queryKeys.workflow(id),
  queryFn: () => fetchWorkflow(id),
  refetchInterval: (query) => {
    const data = query.state.data;
    // 진행 중일 때만 2초마다 갱신
    const isRunning = data?.status === "running";
    return isRunning ? 2000 : false;
  },
});
```

### 고정 Polling

```tsx
const { data: stats } = useQuery({
  queryKey: queryKeys.stats,
  queryFn: fetchStats,
  refetchInterval: 5000, // 5초마다 갱신
});
```

### 조건부 실행 (enabled)

```tsx
const { data: user } = useQuery({
  queryKey: queryKeys.user(userId),
  queryFn: () => fetchUser(userId),
  enabled: !!userId, // userId가 있을 때만 실행
});
```

### 병렬 쿼리

```tsx
// 두 쿼리가 동시에 실행됨
const { data: project } = useQuery({
  queryKey: queryKeys.project(projectId),
  queryFn: () => fetchProject(projectId),
});

const { data: sessions = [] } = useQuery({
  queryKey: queryKeys.sessions(projectId),
  queryFn: () => fetchSessions(projectId),
});
```

## 금지 패턴

### useState + useEffect로 API 호출

```tsx
// Bad - 수동 상태 관리
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetch("/api/users")
    .then(res => res.json())
    .then(setData)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);

// Good - TanStack Query
const { data, isLoading, error } = useQuery({
  queryKey: ["users"],
  queryFn: fetchUsers,
});
```

### 수동 setInterval Polling

```tsx
// Bad - 수동 polling
useEffect(() => {
  const interval = setInterval(fetchData, 2000);
  return () => clearInterval(interval);
}, []);

// Good - refetchInterval 사용
const { data } = useQuery({
  queryKey: ["data"],
  queryFn: fetchData,
  refetchInterval: 2000,
});
```

### Query Key 인라인 정의

```tsx
// Bad - 일관성 없는 키
useQuery({ queryKey: ["users"], ... });
useQuery({ queryKey: ["user", id], ... });

// Good - 중앙 관리
useQuery({ queryKey: queryKeys.users, ... });
useQuery({ queryKey: queryKeys.user(id), ... });
```

## useMutation 사용

### 기본 사용

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

function CreateUserForm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newUser: CreateUserInput) => createUser(newUser),
    onSuccess: () => {
      // 캐시 무효화로 목록 갱신
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });

  const handleSubmit = (data: CreateUserInput) => {
    mutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {mutation.isPending && <Spinner />}
      {mutation.isError && <Error message={mutation.error.message} />}
    </form>
  );
}
```

## Query Key 규칙

```typescript
export const queryKeys = {
  // 엔티티별 그룹화
  users: ["users"] as const,
  user: (id: string) => ["users", id] as const,

  // 필터가 있는 경우 객체로
  posts: (filters?: { userId?: string; status?: string }) =>
    ["posts", filters] as const,

  // 중첩 리소스
  userPosts: (userId: string) => ["users", userId, "posts"] as const,
};
```

## 요약

```yaml
필수:
  - 클라이언트 API 호출은 useQuery 사용
  - Query Key는 중앙에서 관리 (queryKeys 객체)
  - API 함수는 lib/api.ts에 분리
  - Provider는 app/providers.tsx에 설정

금지:
  - useState + useEffect로 데이터 fetching
  - 수동 setInterval polling
  - 인라인 query key 정의
  - 컴포넌트 내 직접 fetch 호출

권장:
  - 조건부 polling에 refetchInterval 함수 사용
  - 의존성 있는 쿼리에 enabled 옵션 사용
  - 데이터 변경 후 invalidateQueries로 캐시 갱신
```
