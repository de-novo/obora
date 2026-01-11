---
paths:
  - "**/db/**/*.{ts,js,mts,cts}"
  - "**/database/**/*.{ts,js,mts,cts}"
  - "**/repositories/**/*.{ts,js,mts,cts}"
  - "**/models/**/*.{ts,js,mts,cts}"
  - "**/schema/**/*.{ts,js,mts,cts}"
  - "**/migrations/**/*.{ts,js,sql}"
---

# Database

데이터베이스 설계 및 쿼리 원칙입니다.

## 핵심 원칙

**데이터 무결성 우선**: 성능보다 데이터 정확성이 중요합니다.

## 스키마 설계

### 테이블 명명

```sql
-- Good - 복수형, snake_case
CREATE TABLE users (...);
CREATE TABLE order_items (...);

-- Bad
CREATE TABLE User (...);
CREATE TABLE OrderItem (...);
```

### 컬럼 명명

```sql
-- Good - snake_case
id, created_at, updated_at, user_id

-- Bad - camelCase
userId, createdAt
```

### 기본 컬럼

```sql
-- 모든 테이블에 포함
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 외래 키 명명

```sql
-- Good - 참조테이블_id
user_id, post_id, category_id

-- 관계 명확히
author_id, reviewer_id  -- 같은 users 테이블 참조하지만 역할 구분
```

## 쿼리 최적화

### 인덱스 사용

```sql
-- 자주 검색되는 컬럼
CREATE INDEX idx_users_email ON users(email);

-- 복합 인덱스 (검색 순서 고려)
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
```

### N+1 문제 방지

```typescript
// Bad - N+1 쿼리
const users = await db.query("SELECT * FROM users");
for (const user of users) {
  const posts = await db.query("SELECT * FROM posts WHERE user_id = ?", [user.id]);
}

// Good - JOIN 사용
const usersWithPosts = await db.query(`
  SELECT u.*, p.*
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
`);

// Good - ORM eager loading
const users = await User.findAll({
  include: [{ model: Post }]
});
```

### SELECT * 지양

```typescript
// Bad
SELECT * FROM users;

// Good - 필요한 컬럼만
SELECT id, name, email FROM users;
```

## 트랜잭션

### 원자성 보장

```typescript
// Good - 트랜잭션으로 묶기
await db.transaction(async (tx) => {
  await tx.insert(orders).values(orderData);
  await tx.update(inventory).set({ stock: stock - 1 });
});

// Bad - 개별 쿼리
await db.insert(orders).values(orderData);
await db.update(inventory).set({ stock: stock - 1 });  // 실패하면?
```

### 적절한 격리 수준

```typescript
await db.transaction(async (tx) => {
  // ...
}, { isolationLevel: "serializable" });
```

## 마이그레이션

### 마이그레이션 원칙

```sql
-- Good - 롤백 가능한 변경
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- 위험 - 데이터 손실 가능
ALTER TABLE users DROP COLUMN phone;
```

### 순차적 마이그레이션

```
migrations/
  001_create_users.sql
  002_create_posts.sql
  003_add_user_phone.sql
```

### 무중단 배포 고려

```sql
-- Step 1: 새 컬럼 추가 (nullable)
ALTER TABLE users ADD COLUMN new_email VARCHAR(255);

-- Step 2: 데이터 마이그레이션 (백그라운드)
UPDATE users SET new_email = email;

-- Step 3: 애플리케이션 배포

-- Step 4: 이전 컬럼 제거
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users RENAME COLUMN new_email TO email;
```

## 보안

### SQL 인젝션 방지

```typescript
// Good - 파라미터 바인딩
await db.query("SELECT * FROM users WHERE id = ?", [userId]);

// Bad - 문자열 연결
await db.query(`SELECT * FROM users WHERE id = ${userId}`);
```

### 민감 데이터 처리

```typescript
// 비밀번호 해싱
const hashedPassword = await bcrypt.hash(password, 12);

// 조회 시 민감 정보 제외
SELECT id, name, email FROM users;  -- password 제외
```

## 소프트 삭제

```sql
-- 소프트 삭제 구현
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- 조회 시 필터링
SELECT * FROM users WHERE deleted_at IS NULL;
```

## 금지 사항

- 프로덕션에서 수동 DELETE/UPDATE (백업 없이)
- 인덱스 없는 대용량 테이블 스캔
- 트랜잭션 없는 다중 테이블 수정
- 하드코딩된 쿼리 값
