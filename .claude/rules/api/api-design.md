---
paths:
  - "**/api/**/*.{ts,js,mts,cts}"
  - "**/routes/**/*.{ts,js,mts,cts}"
  - "**/controllers/**/*.{ts,js,mts,cts}"
  - "**/handlers/**/*.{ts,js,mts,cts}"
---

# API Design

RESTful API 설계 원칙입니다.

## 핵심 원칙

**일관성과 예측 가능성**: API는 일관된 패턴을 따라야 합니다.

## URL 설계

### 리소스 중심 설계

```
# Good - 명사 사용
GET    /users
GET    /users/:id
POST   /users
PUT    /users/:id
DELETE /users/:id

# Bad - 동사 사용
GET    /getUsers
POST   /createUser
POST   /deleteUser
```

### 복수형 사용

```
# Good
/users
/posts
/categories

# Bad
/user
/post
/category
```

### 중첩 리소스

```
# Good - 관계 표현
GET /users/:userId/posts
GET /posts/:postId/comments

# 너무 깊은 중첩 피하기 (3단계 이하)
# Bad
/users/:userId/posts/:postId/comments/:commentId/likes
```

## HTTP 메서드

| Method | 용도 | 멱등성 |
|--------|------|--------|
| GET | 조회 | Yes |
| POST | 생성 | No |
| PUT | 전체 수정 | Yes |
| PATCH | 부분 수정 | No |
| DELETE | 삭제 | Yes |

## 상태 코드

### 성공

```typescript
// 200 OK - 일반적 성공
return Response.json(data, { status: 200 });

// 201 Created - 리소스 생성
return Response.json(newUser, { status: 201 });

// 204 No Content - 성공했지만 반환 데이터 없음
return new Response(null, { status: 204 });
```

### 클라이언트 에러

```typescript
// 400 Bad Request - 잘못된 요청
// 401 Unauthorized - 인증 필요
// 403 Forbidden - 권한 없음
// 404 Not Found - 리소스 없음
// 409 Conflict - 충돌
// 422 Unprocessable Entity - 검증 실패
```

### 서버 에러

```typescript
// 500 Internal Server Error - 서버 오류
// 503 Service Unavailable - 서비스 불가
```

## 응답 형식

### 성공 응답

```typescript
// 단일 리소스
{
  "data": {
    "id": "123",
    "name": "John"
  }
}

// 목록
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

### 에러 응답

```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [
      { "field": "email", "message": "Must be valid email" }
    ]
  }
}
```

## 페이지네이션

### Offset 기반

```
GET /users?page=2&limit=20
```

### Cursor 기반 (권장)

```
GET /users?cursor=abc123&limit=20

{
  "data": [...],
  "meta": {
    "nextCursor": "def456",
    "hasMore": true
  }
}
```

## 필터링 및 정렬

```
# 필터링
GET /users?status=active&role=admin

# 정렬
GET /users?sort=createdAt:desc

# 필드 선택
GET /users?fields=id,name,email
```

## 버저닝

```
# URL 경로 (권장)
/api/v1/users
/api/v2/users

# 헤더
Accept: application/vnd.api+json;version=1
```

## 보안

### Rate Limiting

```typescript
// 헤더로 제한 정보 전달
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

### 입력 검증

```typescript
// 항상 입력 검증
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

const result = schema.safeParse(body);
if (!result.success) {
  return Response.json(
    { error: formatZodError(result.error) },
    { status: 422 }
  );
}
```

## 금지 사항

- URL에 동사 사용
- 상태 코드 무시 (항상 200 반환)
- 에러 메시지에 민감 정보 노출
- 검증 없이 입력 사용
