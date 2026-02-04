# TASK-017: @obora/database 유닛 테스트

## 개요
- 우선순위: P1
- 예상 소요: 3시간
- 담당: 개발자

## 목표
@obora/database 패키지의 DuckDB 클라이언트 테스트 작성

## 작업 내용

### 1. 테스트 환경 설정
- vitest.config.ts 생성 (packages/database/)
- in-memory DuckDB 사용

### 2. duckdb-client.ts 테스트
- 데이터베이스 연결 성공
- 테이블 생성 (features, tasks, logs)
- CRUD 작업
  - 피처 생성/조회/수정/삭제
  - 태스크 생성/조회/수정/삭제
  - 로그 기록/조회
- 쿼리 에러 처리
- 커넥션 close() 검증

### 3. 인덱스 테스트
- 인덱스 생성 확인
- 쿼리 성능 (선택적)

## 완료 조건
- [ ] 테스트 커버리지 80% 이상
- [ ] in-memory DB로 빠른 테스트
- [ ] 커넥션 누수 없음

## 의존성
- TASK-010 (duckdb-setup)

## 테스트 케이스 예시
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBClient } from '../duckdb-client';

describe('DuckDBClient', () => {
  let client: DuckDBClient;

  beforeEach(async () => {
    client = new DuckDBClient(':memory:');
    await client.initialize();
  });

  afterEach(async () => {
    await client.close();
  });

  it('should create tables', async () => {
    const tables = await client.query('SHOW TABLES');
    expect(tables).toContain('features');
  });
});
```

## 참고 자료
- [DuckDB Node.js API](https://duckdb.org/docs/api/nodejs/overview)
- SPEC-010-database-schema.md
