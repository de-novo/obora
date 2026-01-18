---
name: obora-testing
description: 테스트 패턴 및 모범 사례. 단위/통합/E2E 테스트, 모킹, 테스트 구조. 테스트 작성/리뷰 시 자동 적용.
allowed-tools: Read, Glob, Grep
user-invocable: true
---

# Testing Patterns Skill

효과적인 테스트 작성을 위한 패턴과 모범 사례를 제공하는 스킬입니다.

## 사용 시점

- 테스트 코드 작성 시
- 테스트 구조 설계 시
- 테스트 리뷰 시
- 테스트 커버리지 분석 시

## 테스트 유형

### 테스트 피라미드

```
        /\
       /  \     E2E (적음)
      /----\    - 전체 시스템 흐름
     /      \   - 느림, 불안정
    /--------\  통합 테스트 (중간)
   /          \ - 컴포넌트 간 상호작용
  /------------\- API, DB 연동
 /              \ 단위 테스트 (많음)
/----------------\ - 개별 함수/클래스
                  - 빠름, 안정적
```

### 각 유형별 특징

```yaml
단위_테스트:
  대상: 함수, 클래스, 모듈
  특징:
    - 외부 의존성 모킹
    - 빠른 실행 (ms 단위)
    - 높은 커버리지
  도구: Jest, Vitest

통합_테스트:
  대상: API 엔드포인트, 서비스 계층
  특징:
    - 실제 DB (테스트용)
    - 중간 속도 (초 단위)
    - 핵심 흐름 커버
  도구: Supertest, TestContainers

E2E_테스트:
  대상: 전체 사용자 흐름
  특징:
    - 실제 브라우저/앱
    - 느림 (분 단위)
    - 핵심 시나리오만
  도구: Playwright, Cypress
```

## 테스트 구조

### AAA 패턴 (Arrange-Act-Assert)

```typescript
describe("UserService", () => {
  describe("createUser", () => {
    it("should create a user with valid input", async () => {
      // Arrange: 테스트 데이터 준비
      const input: CreateUserInput = {
        email: "test@example.com",
        name: "Test User",
      };
      const mockRepository = createMockRepository();

      // Act: 테스트 대상 실행
      const result = await createUser(input, mockRepository);

      // Assert: 결과 검증
      expect(result.ok).toBe(true);
      expect(result.value).toMatchObject({
        email: "test@example.com",
        name: "Test User",
      });
    });
  });
});
```

### Given-When-Then (BDD 스타일)

```typescript
describe("User Registration", () => {
  describe("given valid registration data", () => {
    const validInput = { email: "test@example.com", password: "secure123" };

    describe("when user submits registration", () => {
      it("then creates account and sends verification email", async () => {
        const result = await register(validInput);

        expect(result.success).toBe(true);
        expect(mockEmailService.send).toHaveBeenCalledWith(
          expect.objectContaining({ to: validInput.email })
        );
      });
    });
  });

  describe("given duplicate email", () => {
    // ...
  });
});
```

### 테스트 네이밍

```typescript
// Good: 동작 설명
it("should return error when email is invalid")
it("should call repository.save with correct data")
it("should emit event after successful creation")

// Good: 조건 + 기대 결과
it("returns null when user not found")
it("throws ValidationError for empty name")

// Bad: 모호한 이름
it("works correctly")
it("test createUser")
it("handles edge case")
```

## 모킹 패턴

### 함수 모킹

```typescript
// Jest
const mockFn = jest.fn();
mockFn.mockReturnValue(42);
mockFn.mockResolvedValue({ data: "async result" });
mockFn.mockImplementation((x) => x * 2);

// 호출 검증
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith("arg1", "arg2");
expect(mockFn).toHaveBeenCalledTimes(3);
```

### 모듈 모킹

```typescript
// __mocks__/database.ts
export const query = jest.fn();
export const connect = jest.fn();

// 테스트 파일
jest.mock("./database");
import { query } from "./database";

beforeEach(() => {
  jest.clearAllMocks();
});

it("should query database", async () => {
  (query as jest.Mock).mockResolvedValue([{ id: 1 }]);

  const result = await fetchUsers();

  expect(query).toHaveBeenCalledWith("SELECT * FROM users");
});
```

### 의존성 주입 활용

```typescript
// 테스트하기 좋은 구조
class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly emailService: EmailService
  ) {}

  async create(input: CreateUserInput) {
    const user = await this.repository.save(input);
    await this.emailService.sendWelcome(user.email);
    return user;
  }
}

// 테스트
it("should send welcome email after creation", async () => {
  const mockRepo = { save: jest.fn().mockResolvedValue({ id: "1", email: "test@test.com" }) };
  const mockEmail = { sendWelcome: jest.fn() };

  const service = new UserService(mockRepo, mockEmail);
  await service.create({ email: "test@test.com", name: "Test" });

  expect(mockEmail.sendWelcome).toHaveBeenCalledWith("test@test.com");
});
```

## 비동기 테스트

### Promise 테스트

```typescript
// async/await (권장)
it("should fetch user data", async () => {
  const user = await fetchUser("123");
  expect(user.name).toBe("John");
});

// 에러 테스트
it("should throw for invalid id", async () => {
  await expect(fetchUser("invalid")).rejects.toThrow(NotFoundError);
});

// 또는 try-catch
it("should throw for invalid id", async () => {
  try {
    await fetchUser("invalid");
    fail("Expected error to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundError);
  }
});
```

### 타이머 테스트

```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it("should debounce function calls", () => {
  const callback = jest.fn();
  const debounced = debounce(callback, 1000);

  debounced();
  debounced();
  debounced();

  expect(callback).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1000);

  expect(callback).toHaveBeenCalledTimes(1);
});
```

## 테스트 데이터

### Factory 패턴

```typescript
// factories/user.ts
export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    createdAt: new Date(),
    ...overrides,
  };
}

export function createUsers(count: number, overrides: Partial<User> = {}): User[] {
  return Array.from({ length: count }, () => createUser(overrides));
}

// 사용
it("should filter active users", () => {
  const users = [
    createUser({ status: "active" }),
    createUser({ status: "inactive" }),
    createUser({ status: "active" }),
  ];

  const result = filterActive(users);

  expect(result).toHaveLength(2);
});
```

### Fixture 파일

```typescript
// fixtures/users.json
{
  "validUser": {
    "email": "valid@example.com",
    "name": "Valid User"
  },
  "invalidEmail": {
    "email": "not-an-email",
    "name": "Test"
  }
}

// 사용
import fixtures from "./fixtures/users.json";

it("should reject invalid email", async () => {
  const result = await createUser(fixtures.invalidEmail);
  expect(result.ok).toBe(false);
});
```

## React/컴포넌트 테스트

### Testing Library 패턴

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("LoginForm", () => {
  it("should submit form with email and password", async () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    // 사용자처럼 상호작용
    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });
  });

  it("should show validation error for invalid email", async () => {
    render(<LoginForm onSubmit={jest.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), "invalid");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
  });
});
```

### 쿼리 우선순위

```yaml
접근성_우선:
  1. getByRole      # 접근성 역할
  2. getByLabelText # 폼 요소
  3. getByPlaceholderText
  4. getByText      # 텍스트 콘텐츠

시맨틱_쿼리:
  5. getByAltText   # 이미지
  6. getByTitle

테스트_ID_최후:
  7. getByTestId    # 다른 방법 없을 때만
```

## 모범 사례

### 테스트 격리

```typescript
// Good: 각 테스트 독립적
beforeEach(() => {
  // 상태 초기화
  jest.clearAllMocks();
  cleanup();
});

afterEach(() => {
  // 부작용 정리
});

// Bad: 테스트 간 상태 공유
let sharedState;  // 피해야 함
```

### 구현이 아닌 동작 테스트

```typescript
// Bad: 구현 세부사항 테스트
it("should call internal method", () => {
  const spy = jest.spyOn(service, "_privateMethod");
  service.process();
  expect(spy).toHaveBeenCalled();
});

// Good: 관찰 가능한 동작 테스트
it("should return processed result", () => {
  const result = service.process({ input: "data" });
  expect(result).toEqual({ output: "processed data" });
});
```

### 적절한 Assertion

```typescript
// Good: 구체적인 assertion
expect(result).toEqual({ id: "1", name: "John" });
expect(array).toHaveLength(3);
expect(fn).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));

// Bad: 너무 느슨한 assertion
expect(result).toBeTruthy();
expect(array.length).toBeGreaterThan(0);
```

## 체크리스트

### 테스트 구조

- [ ] AAA 또는 Given-When-Then 패턴 사용
- [ ] 명확한 테스트 이름
- [ ] 하나의 테스트에 하나의 assertion 개념
- [ ] 테스트 간 격리

### 모킹

- [ ] 외부 의존성만 모킹
- [ ] 구현이 아닌 계약 모킹
- [ ] 모킹 정리 (clearAllMocks)

### 비동기

- [ ] async/await 사용
- [ ] 적절한 타임아웃 설정
- [ ] 에러 케이스 테스트

### 유지보수

- [ ] Factory/Fixture 활용
- [ ] DRY하되 가독성 유지
- [ ] 적절한 테스트 커버리지 (70-80% 권장)

## 참조

- [Testing Library Docs](https://testing-library.com/docs/)
- [Jest Docs](https://jestjs.io/docs/getting-started)
- [Vitest Docs](https://vitest.dev/)
- [Kent C. Dodds - Testing JavaScript](https://testingjavascript.com/)
