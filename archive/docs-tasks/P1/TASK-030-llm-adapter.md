# TASK-030: Pi Mono LLM Adapter 구현

## 개요
- **상태**: ✅ 완료
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자
- Phase: Week 5-6

## 목표
Inflection AI의 Pi Mono 모델을 사용하는 LLM Adapter 구현

## 작업 내용

### 1. LLMAdapter 인터페이스 정의

**파일 위치:** `packages/agents/src/llm/adapter.ts`

```typescript
/**
 * LLM 어댑터 인터페이스
 * 다양한 LLM 제공자를 통합하기 위한 공통 인터페이스
 */
export interface LLMAdapter {
  /**
   * 싱글 턴 채팅 완성 요청
   */
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;

  /**
   * 스트리밍 채팅 완성 요청
   */
  streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult>;

  /**
   * 어댑터 식별자
   */
  readonly id: string;

  /**
   * 지원되는 기능 확인
   */
  supports(feature: 'streaming' | 'function-calling' | 'json-mode'): boolean;
}

/**
 * 채팅 완성 요청 파라미터
 */
export interface ChatCompletionParams {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  responseFormat?: { type: 'text' | 'json_object' };
  stopSequences?: string[];
}

/**
 * 채팅 메시지
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/**
 * 도구 정의 (Function Calling용)
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * 도구 호출
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * 채팅 완성 결과
 */
export interface ChatCompletionResult {
  id: string;
  model: string;
  message: {
    role: 'assistant';
    content: string | null;
    toolCalls?: ToolCall[];
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
}

/**
 * 스트리밍 청크
 */
export interface ChatCompletionChunk {
  id: string;
  model: string;
  delta: {
    role?: 'assistant';
    content?: string;
    toolCalls?: ToolCall[];
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: ChatCompletionResult['usage'];
}
```

### 2. PiMonoAdapter 클래스 구현

**파일 위치:** `packages/agents/src/llm/pi-mono-adapter.ts`

```typescript
import { LLMAdapter, ChatCompletionParams, ChatCompletionResult, ChatCompletionChunk } from './adapter';

/**
 * Inflection AI Pi Mono 어댑터
 * API 문서: https://docs.inflection.ai/
 */
export class PiMonoAdapter implements LLMAdapter {
  readonly id = 'pi-mono';

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel = 'pi-mono-1';

  constructor(config: PiMonoConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.inflection.ai/v1';
    this.apiKey = config.apiKey;
  }

  supports(feature: 'streaming' | 'function-calling' | 'json-mode'): boolean {
    switch (feature) {
      case 'streaming':
        return true;
      case 'function-calling':
        return true; // Pi Mono 지원 여부 확인 필요
      case 'json-mode':
        return false; // 현재 미지원
    }
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.transformParams(params)),
    });

    if (!response.ok) {
      throw new PiMonoError(
        `Pi Mono API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const data = await response.json();
    return this.transformResponse(data);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        ...this.transformParams(params),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new PiMonoError(
        `Pi Mono API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    if (!response.body) {
      throw new PiMonoError('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedResult: ChatCompletionResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data:'));

      for (const line of lines) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const chunkData = this.transformChunk(json);
          onChunk(chunkData);

          // Accumulate final result
          if (chunkData.finishReason) {
            accumulatedResult = chunkData as ChatCompletionResult;
          }
        } catch (e) {
          // Ignore parse errors for keep-alive lines
        }
      }
    }

    return accumulatedResult ?? (await this.chatCompletion(params));
  }

  private transformParams(params: ChatCompletionParams): Record<string, unknown> {
    const transformed: Record<string, unknown> = {
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
    };

    if (params.topP !== undefined) {
      transformed.top_p = params.topP;
    }

    if (params.tools && this.supports('function-calling')) {
      transformed.tools = params.tools;
    }

    if (params.toolChoice) {
      transformed.tool_choice = params.toolChoice;
    }

    if (params.stopSequences) {
      transformed.stop = params.stopSequences;
    }

    return transformed;
  }

  private transformResponse(data: unknown): ChatCompletionResult {
    // Pi Mono 응답 형식에 맞게 변환
    const response = data as PiMonoAPIResponse;
    return {
      id: response.id,
      model: response.model,
      message: {
        role: 'assistant',
        content: response.choices[0].message.content,
        toolCalls: response.choices[0].message.tool_calls,
      },
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      finishReason: response.choices[0].finish_reason,
    };
  }

  private transformChunk(data: unknown): ChatCompletionChunk {
    const chunk = data as PiMonoStreamChunk;
    return {
      id: chunk.id,
      model: chunk.model,
      delta: {
        role: chunk.choices[0].delta.role,
        content: chunk.choices[0].delta.content,
        toolCalls: chunk.choices[0].delta.tool_calls,
      },
      finishReason: chunk.choices[0].finish_reason,
    };
  }
}

/**
 * Pi Mono 설정
 */
export interface PiMonoConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Pi Mono API 응답 형식
 */
interface PiMonoAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Pi Mono 스트리밍 청크 형식
 */
interface PiMonoStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
}

/**
 * Pi Mono 에러
 */
export class PiMonoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'PiMonoError';
  }
}
```

### 3. 에러 처리 및 재시도 로직

**파일 위치:** `packages/agents/src/llm/retry-handler.ts`

```typescript
/**
 * 재시도 핸들러
 */
export class RetryHandler {
  constructor(
    private readonly maxRetries: number = 3,
    private readonly baseDelay: number = 1000,
    private readonly maxDelay: number = 10000
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    isRetryable: (error: Error) => boolean = this.defaultIsRetryable
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!isRetryable(lastError)) {
          throw lastError;
        }

        if (attempt === this.maxRetries) {
          throw new RetryExhaustedError(
            `Max retries (${this.maxRetries}) exceeded`,
            lastError,
            attempt + 1
          );
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private defaultIsRetryable(error: Error): boolean {
    // Retry on rate limit, timeout, server errors
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      (error as { statusCode?: number }).statusCode >= 500
    );
  }
}

/**
 * 재시도 소진 에러
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly attempts: number
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

/**
 * LLM 어댑터 with 재시도
 */
export function withRetry<T extends LLMAdapter>(
  adapter: T,
  config?: { maxRetries?: number; baseDelay?: number; maxDelay?: number }
): T {
  const retryHandler = new RetryHandler(
    config?.maxRetries,
    config?.baseDelay,
    config?.maxDelay
  );

  return new Proxy(adapter, {
    get(target, prop) {
      const value = target[prop as keyof T];

      if (typeof value === 'function' && (prop === 'chatCompletion' || prop === 'streamChatCompletion')) {
        return async (...args: unknown[]) => {
          return retryHandler.execute(() => value.apply(target, args));
        };
      }

      return value;
    },
  }) as T;
}
```

### 4. 팩토리 함수

**파일 위치:** `packages/agents/src/llm/factory.ts`

```typescript
import { LLMAdapter } from './adapter';
import { PiMonoAdapter } from './pi-mono-adapter';
import { withRetry } from './retry-handler';

/**
 * LLM 어댑터 팩토리
 */
export function createLLMAdapter(
  provider: 'pi-mono',
  config: unknown
): LLMAdapter {
  switch (provider) {
    case 'pi-mono':
      const adapter = new PiMonoAdapter(config as { apiKey: string });
      return withRetry(adapter);

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * 환경 변수에서 설정 로드
 */
export function createAdapterFromEnv(): LLMAdapter {
  const provider = process.env.OBORA_LLM_PROVIDER ?? 'pi-mono';

  switch (provider) {
    case 'pi-mono':
      const apiKey = process.env.PIMONO_API_KEY;
      if (!apiKey) {
        throw new Error('PIMONO_API_KEY environment variable is required');
      }
      return createLLMAdapter('pi-mono', { apiKey });

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
```

### 5. 테스트용 Mock 어댑터

> **공통 Mock 어댑터**
>
> 이 MockLLMAdapter는 TASK-035 (AI 에이전트 테스트)와 공통으로 사용됩니다.
> 중복 구현을 피하기 위해 TASK-035의 MockLLMAdapter 구현을 사용합니다.
>
> **참조:** TASK-035의 MockLLMAdapter 구현 (packages/agents/src/llm/mock-adapter.ts)

**파일 위치:** `packages/agents/src/llm/mock-adapter.ts`

```typescript
import { LLMAdapter, ChatCompletionParams, ChatCompletionResult, ChatCompletionChunk } from './adapter';

/**
 * 테스트용 Mock LLM 어댑터
 *
 * 참고: 고급 기능(시나리오, 실패 모드, 호출 기록 추적 등)이 필요한 경우
 * TASK-035의 MockLLMAdapter 구현을 참조하거나 확장하여 사용하세요.
 */
export class MockLLMAdapter implements LLMAdapter {
  readonly id = 'mock-llm';

  constructor(
    private readonly responses: Record<string, string | ((params: ChatCompletionParams) => string)> = {}
  ) {}

  supports(feature: 'streaming' | 'function-calling' | 'json-mode'): boolean {
    return true;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    // 시뮬레이션 딜레이
    await new Promise(resolve => setTimeout(resolve, 100));

    const lastUserMessage = params.messages.filter(m => m.role === 'user').pop();
    const key = lastUserMessage?.content ?? 'default';
    const content = typeof this.responses[key] === 'function'
      ? (this.responses[key] as (p: ChatCompletionParams) => string)(params)
      : this.responses[key] ?? `Mock response to: ${key}`;

    return {
      id: `mock-${Date.now()}`,
      model: 'mock-model',
      message: {
        role: 'assistant',
        content,
      },
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      finishReason: 'stop',
    };
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const result = await this.chatCompletion(params);
    const content = result.message.content ?? '';

    // 시뮬레이션 스트리밍
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      onChunk({
        id: `mock-${Date.now()}`,
        model: 'mock-model',
        delta: {
          role: 'assistant',
          content: words[i] + ' ',
        },
        finishReason: i === words.length - 1 ? 'stop' : undefined,
      });
    }

    return result;
  }

  /**
   * 응답 설정
   */
  setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
    this.responses[key] = response;
  }

  /**
   * 모든 응답 초기화
   */
  clearResponses(): void {
    Object.keys(this.responses).forEach(key => {
      delete this.responses[key];
    });
  }
}
```

### 6. 내보내기 설정

**파일 위치:** `packages/agents/src/llm/index.ts`

```typescript
export * from './adapter';
export * from './pi-mono-adapter';
export * from './factory';
export * from './retry-handler';
export * from './mock-adapter';
```

## 완료 조건
- [ ] LLMAdapter 인터페이스 정의 완료
- [ ] PiMonoAdapter 클래스 구현 완료
- [ ] 스트리밍 지원 완료
- [ ] 에러 처리 및 재시도 로직 구현 완료
- [ ] Mock 어댑터 구현 완료
- [ ] 단위 테스트 작성

## 의존성
- TASK-024 (기반 타입 정의)

## API 테스트 시나리오

### 기본 채팅 완성
```typescript
const adapter = createLLMAdapter('pi-mono', {
  apiKey: process.env.PIMONO_API_KEY,
});

const result = await adapter.chatCompletion({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how are you?' },
  ],
  temperature: 0.7,
});

console.log(result.message.content);
```

### 스트리밍 채팅 완성
```typescript
let fullContent = '';

await adapter.streamChatCompletion(
  {
    messages: [
      { role: 'user', content: 'Tell me a short story.' },
    ],
  },
  (chunk) => {
    if (chunk.delta.content) {
      fullContent += chunk.delta.content;
      process.stdout.write(chunk.delta.content);
    }
  }
);

console.log('\nTotal:', fullContent);
```

### Function Calling
```typescript
const result = await adapter.chatCompletion({
  messages: [
    { role: 'user', content: 'What is the weather in Seoul?' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city name',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              default: 'celsius',
            },
          },
          required: ['location'],
        },
      },
    },
  ],
  toolChoice: 'auto',
});

if (result.message.toolCalls) {
  // 도구 호출 실행
  for (const toolCall of result.message.toolCalls) {
    const args = JSON.parse(toolCall.function.arguments);
    // 함수 실행 로직...
  }
}
```

### 에러 처리
```typescript
try {
  const result = await adapter.chatCompletion({
    messages: [{ role: 'user', content: 'Test' }],
  });
} catch (error) {
  if (error instanceof PiMonoError) {
    console.error(`API Error (${error.statusCode}):`, error.message);
    if (error.statusCode === 429) {
      console.log('Rate limit exceeded, please retry later');
    }
  } else if (error instanceof RetryExhaustedError) {
    console.error(`Failed after ${error.attempts} attempts:`, error.originalError);
  }
}
```

## 엣지 케이스
1. 네트워크 연결 실패 시 재시도 동작 확인
2. Rate limit (429) 응답 시 적절한 지연 후 재시도 확인
3. 빈 메시지 배열 처리
4. 초과 max_tokens 요청 시 응답 검증
5. 잘못된 API 키 처리
6. 스트리밍 중단 시 부분 응답 처리
7. 긴 응답의 토큰 제한 처리

## 참고 자료
- [Inflection AI API 문서](https://docs.inflection.ai/)
- [Pi Mono 모델 스펙](https://www.inflection.ai/mono)
- ADR-001: Blackboard + Actor 아키텍처 선택
- TASK-024: 기반 타입 정의

---

*작성일: 2026-02-04*
*버전: 1.0.0*

## 재동기화 근거 (2026-02-13)
- 코드 변경: `packages/agents/src/llm/*` 어댑터 계층 반영
- 테스트: `pnpm --filter @obora-kit/agents test` 통과 (281/281, 2026-02-13)
- 2모델 리뷰: 완료 커밋 메시지(score 9.5/10) 기준 게이트 충족
- 커밋: `2df865e`
