---
name: obora-api-docs
description: API 문서화 패턴. OpenAPI/Swagger, TSDoc, REST API 문서 형식. API 문서 작성 시 자동 적용.
allowed-tools: Read, Glob, Grep
user-invocable: true
---

# API Documentation Patterns Skill

API 문서화를 위한 표준 형식과 패턴을 제공하는 스킬입니다.

## 사용 시점

- REST API 문서 작성 시
- OpenAPI/Swagger 스펙 작성 시
- 함수/메서드 문서화 (TSDoc/JSDoc)
- API 클라이언트 가이드 작성 시

## REST API 문서 형식

### 엔드포인트 문서 구조

```markdown
### `METHOD /api/path/:param`

**설명**: 엔드포인트의 목적을 한 줄로

**인증**: 필요 여부 (Bearer Token, API Key 등)

**Path Parameters**:
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| param | string | Yes | 설명 |

**Query Parameters**:
| 이름 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| limit | number | 20 | 페이지 크기 |

**Request Body**:
```json
{
  "field": "string (required)",
  "optional": "string (optional, default: 'value')"
}
```

**Response**:
- `200 OK`: 성공
- `400 Bad Request`: 유효성 오류
- `401 Unauthorized`: 인증 실패
- `404 Not Found`: 리소스 없음

**Response Body** (200):
```json
{
  "success": true,
  "data": { ... }
}
```

**예시**:
```bash
curl -X METHOD https://api.example.com/api/path/123 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```
```

### 응답 형식 표준

```yaml
성공_응답:
  code: 2xx
  body:
    success: true
    data: <실제 데이터>
    meta: <페이지네이션 등> (선택)

에러_응답:
  code: 4xx, 5xx
  body:
    success: false
    error:
      code: "ERROR_CODE"
      message: "사용자 친화적 메시지"
      details: [] (선택, 필드별 오류)
```

## OpenAPI 3.0 스펙

### 기본 구조

```yaml
openapi: 3.0.0
info:
  title: API 이름
  version: 1.0.0
  description: API 설명

servers:
  - url: https://api.example.com
    description: Production
  - url: https://staging-api.example.com
    description: Staging

paths:
  /users:
    get:
      summary: 사용자 목록 조회
      tags: [Users]
      # ...
    post:
      summary: 사용자 생성
      tags: [Users]
      # ...

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
```

### Path Item 상세

```yaml
paths:
  /users/{id}:
    get:
      summary: 사용자 조회
      description: ID로 사용자 정보 조회
      operationId: getUserById
      tags:
        - Users
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
          description: 사용자 UUID
      responses:
        '200':
          description: 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '404':
          description: 사용자 없음
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
```

### 스키마 정의

```yaml
components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
      properties:
        id:
          type: string
          format: uuid
          description: 사용자 고유 ID
          example: "550e8400-e29b-41d4-a716-446655440000"
        email:
          type: string
          format: email
          description: 이메일 주소
          example: "user@example.com"
        name:
          type: string
          description: 이름
          example: "John Doe"
        createdAt:
          type: string
          format: date-time
          description: 생성 시간

    Error:
      type: object
      required:
        - success
        - error
      properties:
        success:
          type: boolean
          example: false
        error:
          type: object
          properties:
            code:
              type: string
              example: "VALIDATION_ERROR"
            message:
              type: string
              example: "Invalid input data"
```

### 인증 정의

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: 읽기 권한
            write: 쓰기 권한
```

## TSDoc/JSDoc 형식

### 함수 문서화

```typescript
/**
 * 사용자를 생성합니다.
 *
 * @param input - 사용자 생성에 필요한 정보
 * @param options - 추가 옵션 (선택)
 * @returns 생성된 사용자 정보
 * @throws {ValidationError} 입력이 유효하지 않은 경우
 * @throws {ConflictError} 이메일이 이미 존재하는 경우
 *
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: "john@example.com",
 *   name: "John Doe"
 * });
 * console.log(user.id); // "uuid..."
 * ```
 *
 * @see {@link updateUser} 사용자 수정
 * @see {@link deleteUser} 사용자 삭제
 */
export async function createUser(
  input: CreateUserInput,
  options?: CreateUserOptions
): Promise<User> {
  // ...
}
```

### 인터페이스/타입 문서화

```typescript
/**
 * 사용자 생성 입력 데이터
 */
export interface CreateUserInput {
  /** 이메일 주소 (고유, 필수) */
  email: string;

  /** 사용자 이름 */
  name: string;

  /**
   * 사용자 역할
   * @default "user"
   */
  role?: "admin" | "user";
}

/**
 * 사용자 정보
 */
export interface User {
  /** 고유 식별자 (UUID v4) */
  readonly id: string;

  /** 이메일 주소 */
  email: string;

  /** 사용자 이름 */
  name: string;

  /** 생성 시간 (ISO 8601) */
  readonly createdAt: Date;

  /** 수정 시간 (ISO 8601) */
  readonly updatedAt: Date;
}
```

### 클래스 문서화

```typescript
/**
 * 사용자 서비스
 *
 * 사용자 CRUD 작업을 처리합니다.
 *
 * @example
 * ```typescript
 * const userService = new UserService(repository);
 * const user = await userService.create({ email: "...", name: "..." });
 * ```
 */
export class UserService {
  /**
   * UserService 인스턴스 생성
   * @param repository - 사용자 저장소
   */
  constructor(private readonly repository: UserRepository) {}

  /**
   * 사용자 생성
   * @param input - 생성 데이터
   */
  async create(input: CreateUserInput): Promise<User> {
    // ...
  }
}
```

## 문서화 체크리스트

### REST API

- [ ] 모든 엔드포인트에 설명 포함
- [ ] Path/Query 파라미터 문서화
- [ ] Request Body 스키마 정의
- [ ] 모든 응답 코드 문서화
- [ ] 에러 응답 형식 통일
- [ ] 인증 요구사항 명시
- [ ] curl 예시 포함

### OpenAPI

- [ ] info 섹션 완성 (title, version, description)
- [ ] servers 섹션 정의
- [ ] tags로 엔드포인트 그룹화
- [ ] components/schemas에 재사용 가능한 스키마
- [ ] securitySchemes 정의
- [ ] operationId 고유하게 설정

### TSDoc

- [ ] public 함수/메서드 문서화
- [ ] 파라미터 @param 태그
- [ ] 반환값 @returns 태그
- [ ] 예외 @throws 태그
- [ ] 사용 예시 @example
- [ ] 관련 함수 @see 링크

## 모범 사례

### 버저닝

```yaml
URL_버저닝:
  /api/v1/users
  /api/v2/users

헤더_버저닝:
  Accept: application/vnd.api+json;version=1

권장: URL 버저닝 (명확하고 캐시 친화적)
```

### 페이지네이션

```yaml
커서_기반: (권장)
  request: ?cursor=abc&limit=20
  response:
    data: [...]
    meta:
      nextCursor: "def"
      hasMore: true

오프셋_기반:
  request: ?page=2&limit=20
  response:
    data: [...]
    meta:
      page: 2
      totalPages: 10
      totalItems: 200
```

### 필터링/정렬

```yaml
필터링:
  ?status=active
  ?status[]=active&status[]=pending
  ?createdAt[gte]=2024-01-01

정렬:
  ?sort=createdAt (오름차순)
  ?sort=-createdAt (내림차순)
  ?sort=name,-createdAt (복합)
```

## 참조

- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [TSDoc](https://tsdoc.org/)
- [JSON:API](https://jsonapi.org/)
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines)
