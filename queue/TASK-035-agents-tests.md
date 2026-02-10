# TASK-035: AI 에이전트 테스트 (Mock LLM)

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자
- Phase: Week 5-6

## 목표
AI 에이전트 모듈의 포괄적인 테스트 작성 (Mock LLM 사용)

> **테스트 응답 포맷 (4모델 토론 결과)**
> - VerifierOutput: `findings` 배열 사용 (`issues` 제거)
> - 모든 출력에 `type` 필드 필수 (예: 'verification', 'analysis')
> - `score` 필드 추가 (0-100)

## 작업 내용

### 1. MockLLMAdapter 구현

> **공통 Mock 어댑터**
>
> 이 MockLLMAdapter는 TASK-030 (Pi Mono LLM Adapter 구현)에서도 사용되는 공통 Mock 어댑터입니다.
> 중복을 피하기 위해 TASK-030과 TASK-035 모두 동일한 파일을 사용합니다.
>
> **참조:** TASK-030의 MockLLMAdapter 구현 (packages/agents/src/llm/mock-adapter.ts)

**파일 위치:** `packages/agents/src/llm/mock-adapter.ts`

```typescript
import {
  LLMAdapter,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionChunk,
  ChatMessage,
} from './adapter';

/**
 * Mock 응답 생성기 타입
 */
export type MockResponseGenerator = (
  params: ChatCompletionParams
) => string | ChatCompletionResult;

/**
 * Mock 시나리오
 */
export interface MockScenario {
  match: (params: ChatCompletionParams) => boolean;
  response: string | MockResponseGenerator;
  delay?: number;
  error?: Error;
}

/**
 * 테스트용 Mock LLM 어댑터
 */
export class MockLLMAdapter implements LLMAdapter {
  readonly id = 'mock-llm';

  private defaultResponse = 'This is a mock response.';
  private responses: Map<string, string | MockResponseGenerator> = new Map();
  private scenarios: MockScenario[] = [];
  private callHistory: ChatCompletionParams[] = [];
  private simulatedDelay = 100;
  private shouldFail = false;
  private failureError: Error = new Error('Simulated failure');

  supports(feature: 'streaming' | 'function-calling' | 'json-mode'): boolean {
    return true;
  }

  /**
   * 기본 응답 설정
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  /**
   * 특정 키워드에 대한 응답 설정
   */
  setResponse(
    keyword: string,
    response: string | MockResponseGenerator
  ): void {
    this.responses.set(keyword.toLowerCase(), response);
  }

  /**
   * 시나리오 추가
   */
  addScenario(scenario: MockScenario): void {
    this.scenarios.push(scenario);
  }

  /**
   * 시뮬레이션 딜레이 설정
   */
  setDelay(ms: number): void {
    this.simulatedDelay = ms;
  }

  /**
   * 실패 모드 설정
   */
  setFailureMode(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    if (error) {
      this.failureError = error;
    }
  }

  /**
   * 호출 기록 가져오기
   */
  getCallHistory(): ChatCompletionParams[] {
    return [...this.callHistory];
  }

  /**
   * 호출 기록 초기화
   */
  clearCallHistory(): void {
    this.callHistory = [];
  }

  /**
   * 모든 설정 초기화
   */
  reset(): void {
    this.defaultResponse = 'This is a mock response.';
    this.responses.clear();
    this.scenarios = [];
    this.callHistory = [];
    this.simulatedDelay = 100;
    this.shouldFail = false;
    this.failureError = new Error('Simulated failure');
  }

  async chatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResult> {
    this.callHistory.push(params);

    // 딜레이 시뮬레이션
    await this.sleep(this.simulatedDelay);

    // 실패 모드 확인
    if (this.shouldFail) {
      throw this.failureError;
    }

    // 시나리오 매칭
    for (const scenario of this.scenarios) {
      if (scenario.match(params)) {
        if (scenario.delay) {
          await this.sleep(scenario.delay);
        }
        if (scenario.error) {
          throw scenario.error;
        }
        return this.createResult(scenario.response, params);
      }
    }

    // 키워드 매칭
    const lastUserMessage = this.getLastUserMessage(params.messages);
    if (lastUserMessage) {
      for (const [keyword, response] of this.responses.entries()) {
        if (lastUserMessage.toLowerCase().includes(keyword)) {
          return this.createResult(response, params);
        }
      }
    }

    // 기본 응답
    return this.createResult(this.defaultResponse, params);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const result = await this.chatCompletion(params);
    const content = result.message.content ?? '';

    // 스트리밍 시뮬레이션
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      await this.sleep(20);
      onChunk({
        id: result.id,
        model: result.model,
        delta: {
          role: 'assistant',
          content: words[i] + (i < words.length - 1 ? ' ' : ''),
        },
        finishReason: i === words.length - 1 ? 'stop' : undefined,
      });
    }

    return result;
  }

  private createResult(
    response: string | MockResponseGenerator,
    params: ChatCompletionParams
  ): ChatCompletionResult {
    const content = typeof response === 'function'
      ? response(params)
      : response;

    if (typeof content === 'object') {
      return content as ChatCompletionResult;
    }

    return {
      id: `mock-${Date.now()}`,
      model: 'mock-model',
      message: {
        role: 'assistant',
        content,
      },
      usage: {
        promptTokens: this.estimateTokens(params.messages),
        completionTokens: this.estimateTokens([{ role: 'assistant', content }]),
        totalTokens: 0,
      },
      finishReason: 'stop',
    };
  }

  private getLastUserMessage(messages: ChatMessage[]): string | undefined {
    const userMessages = messages.filter(m => m.role === 'user');
    return userMessages[userMessages.length - 1]?.content;
  }

  private estimateTokens(messages: ChatMessage[]): number {
    // 간단한 토큰 추정 (4글자 = 1토큰)
    return Math.ceil(
      messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) / 4
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Mock 어댑터 생성 헬퍼
 */
export function createMockLLMAdapter(config?: {
  defaultResponse?: string;
  delay?: number;
}): MockLLMAdapter {
  const adapter = new MockLLMAdapter();
  if (config?.defaultResponse) {
    adapter.setDefaultResponse(config.defaultResponse);
  }
  if (config?.delay !== undefined) {
    adapter.setDelay(config.delay);
  }
  return adapter;
}
```

### 2. LLM Adapter 테스트

**파일 위치:** `packages/agents/test/llm/adapter.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockLLMAdapter, createMockLLMAdapter } from '../../src/llm/mock-adapter';

describe('MockLLMAdapter', () => {
  let adapter: MockLLMAdapter;

  beforeEach(() => {
    adapter = new MockLLMAdapter();
  });

  describe('chatCompletion', () => {
    it('should return default response', async () => {
      const result = await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.message.content).toBe('This is a mock response.');
      expect(result.finishReason).toBe('stop');
    });

    it('should return custom response for keyword', async () => {
      adapter.setResponse('weather', 'The weather is sunny.');

      const result = await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'What is the weather today?' }],
      });

      expect(result.message.content).toBe('The weather is sunny.');
    });

    it('should support response generator', async () => {
      adapter.setResponse('greet', (params) => {
        const name = params.messages[0].content?.match(/my name is (\w+)/i)?.[1];
        return `Hello, ${name ?? 'friend'}!`;
      });

      const result = await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Hi, my name is Alice' }],
      });

      expect(result.message.content).toBe('Hello, Alice!');
    });

    it('should track call history', async () => {
      await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'First call' }],
      });
      await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Second call' }],
      });

      const history = adapter.getCallHistory();
      expect(history).toHaveLength(2);
      expect(history[0].messages[0].content).toBe('First call');
      expect(history[1].messages[0].content).toBe('Second call');
    });

    it('should throw error in failure mode', async () => {
      adapter.setFailureMode(true, new Error('API Error'));

      await expect(
        adapter.chatCompletion({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('API Error');
    });

    it('should match scenarios', async () => {
      adapter.addScenario({
        match: (params) =>
          params.messages.some(m => m.content?.includes('analyze')),
        response: '{"analysis": "result"}',
      });

      const result = await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Please analyze this data' }],
      });

      expect(result.message.content).toBe('{"analysis": "result"}');
    });

    it('should estimate token usage', async () => {
      const result = await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Hello world' }],
      });

      expect(result.usage.promptTokens).toBeGreaterThan(0);
      expect(result.usage.completionTokens).toBeGreaterThan(0);
    });
  });

  describe('streamChatCompletion', () => {
    it('should stream response in chunks', async () => {
      adapter.setDefaultResponse('Hello world from mock');
      const chunks: string[] = [];

      await adapter.streamChatCompletion(
        { messages: [{ role: 'user', content: 'Hi' }] },
        (chunk) => {
          if (chunk.delta.content) {
            chunks.push(chunk.delta.content);
          }
        }
      );

      expect(chunks.join('')).toBe('Hello world from mock');
    });

    it('should indicate finish reason on last chunk', async () => {
      adapter.setDefaultResponse('Short');
      let lastFinishReason: string | undefined;

      await adapter.streamChatCompletion(
        { messages: [{ role: 'user', content: 'Hi' }] },
        (chunk) => {
          if (chunk.finishReason) {
            lastFinishReason = chunk.finishReason;
          }
        }
      );

      expect(lastFinishReason).toBe('stop');
    });
  });

  describe('supports', () => {
    it('should support all features', () => {
      expect(adapter.supports('streaming')).toBe(true);
      expect(adapter.supports('function-calling')).toBe(true);
      expect(adapter.supports('json-mode')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      adapter.setDefaultResponse('Custom');
      adapter.setResponse('test', 'Test response');
      adapter.setFailureMode(true);
      await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      }).catch(() => {});

      adapter.reset();

      const result = await adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.message.content).toBe('This is a mock response.');
      expect(adapter.getCallHistory()).toHaveLength(1);
    });
  });
});

describe('createMockLLMAdapter', () => {
  it('should create adapter with config', async () => {
    const adapter = createMockLLMAdapter({
      defaultResponse: 'Custom default',
      delay: 0,
    });

    const result = await adapter.chatCompletion({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.message.content).toBe('Custom default');
  });
});
```

### 3. 역할별 에이전트 테스트

**파일 위치:** `packages/agents/test/roles/analyst-agent.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalystAgent, createAnalystAgent } from '../../src/roles/analyst-agent';
import { MockLLMAdapter } from '../../src/llm/mock-adapter';
import { AgentRole, AgentState, Task, AgentContext } from '../../src/roles/base-agent';

// Mock Blackboard
const createMockBlackboard = () => ({
  read: vi.fn().mockReturnValue({}),
  write: vi.fn(),
  events: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
});

describe('AnalystAgent', () => {
  let agent: AnalystAgent;
  let mockLLM: MockLLMAdapter;
  let mockBoard: ReturnType<typeof createMockBlackboard>;
  let context: AgentContext;

  beforeEach(() => {
    mockLLM = new MockLLMAdapter();
    mockBoard = createMockBlackboard();
    agent = createAnalystAgent('analyst-1', mockLLM);

    context = {
      sessionId: 'session-123',
      board: mockBoard as any,
      history: [],
    };
  });

  describe('constructor', () => {
    it('should create agent with correct role', () => {
      expect(agent.role).toBe(AgentRole.ANALYST);
    });

    it('should generate id if not provided', () => {
      const agentWithoutId = new AnalystAgent({ llm: mockLLM });
      expect(agentWithoutId.id).toMatch(/^analyst-/);
    });
  });

  describe('execute', () => {
    it('should execute task and return result', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        summary: 'Analysis complete',
        keyFindings: ['Finding 1'],
        recommendations: ['Recommendation 1'],
        confidence: 85,
        reasoning: 'Based on the data...',
      }));

      const task: Task = {
        id: 'task-1',
        type: 'analysis',
        description: 'Analyze market data',
        input: { data: 'test data' },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle LLM errors gracefully', async () => {
      mockLLM.setFailureMode(true, new Error('LLM Error'));

      const task: Task = {
        id: 'task-1',
        type: 'analysis',
        description: 'Test',
        input: {},
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('LLM Error');
    });

    it('should parse JSON response correctly', async () => {
      mockLLM.setDefaultResponse(`
Here is my analysis:
\`\`\`json
{
  "summary": "Test summary",
  "keyFindings": ["A", "B"],
  "recommendations": ["Do X"],
  "confidence": 90,
  "reasoning": "Because..."
}
\`\`\`
      `);

      const task: Task = {
        id: 'task-1',
        type: 'analysis',
        description: 'Test',
        input: {},
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.summary).toBe('Test summary');
      expect(output.keyFindings).toEqual(['A', 'B']);
    });

    it('should fallback when JSON parsing fails', async () => {
      mockLLM.setDefaultResponse('Plain text response without JSON');

      const task: Task = {
        id: 'task-1',
        type: 'analysis',
        description: 'Test',
        input: {},
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.summary).toBe('Plain text response without JSON');
    });

    it('should write result to blackboard', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        summary: 'Done',
        keyFindings: [],
        recommendations: [],
        confidence: 80,
        reasoning: '',
      }));

      const task: Task = {
        id: 'task-1',
        type: 'analysis',
        description: 'Test',
        input: {},
        priority: 1,
      };

      await agent.execute(task, context);

      expect(mockBoard.write).toHaveBeenCalledWith(
        'knowledge',
        expect.objectContaining({})
      );
      expect(mockBoard.events.emit).toHaveBeenCalledWith(
        'analysis.completed',
        expect.any(Object)
      );
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = agent.getStatus();

      expect(status.id).toBe('analyst-1');
      expect(status.role).toBe(AgentRole.ANALYST);
      expect(status.state).toBe(AgentState.IDLE);
      expect(status.errorCount).toBe(0);
    });
  });
});
```

**파일 위치:** `packages/agents/test/roles/executor-agent.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutorAgent, createExecutorAgent } from '../../src/roles/executor-agent';
import { MockLLMAdapter } from '../../src/llm/mock-adapter';
import { ToolRegistry } from '../../src/tools/registry';
import { Task, AgentContext } from '../../src/roles/base-agent';

const createMockBlackboard = () => ({
  read: vi.fn().mockReturnValue({}),
  write: vi.fn(),
  events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
});

describe('ExecutorAgent', () => {
  let agent: ExecutorAgent;
  let mockLLM: MockLLMAdapter;
  let toolRegistry: ToolRegistry;
  let mockBoard: ReturnType<typeof createMockBlackboard>;
  let context: AgentContext;

  beforeEach(() => {
    mockLLM = new MockLLMAdapter();
    toolRegistry = new ToolRegistry();
    mockBoard = createMockBlackboard();

    agent = createExecutorAgent('executor-1', mockLLM, toolRegistry);

    context = {
      sessionId: 'session-123',
      board: mockBoard as any,
      history: [],
    };
  });

  describe('execute with tools', () => {
    it('should execute tool when specified in response', async () => {
      // 도구 등록
      toolRegistry.register({
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return { result: 'tool executed' };
        },
      });

      mockLLM.setDefaultResponse(JSON.stringify({
        action: 'Execute test tool',
        tool: 'test_tool',
        parameters: {},
        steps: ['Call tool'],
        expectedOutcome: 'Success',
      }));

      const task: Task = {
        id: 'task-1',
        type: 'execution',
        description: 'Execute something',
        input: {},
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
    });

    it('should work without tool registry', async () => {
      const agentWithoutTools = createExecutorAgent('executor-2', mockLLM);

      mockLLM.setDefaultResponse(JSON.stringify({
        action: 'Simple action',
        parameters: {},
        steps: ['Step 1'],
        expectedOutcome: 'Done',
      }));

      const task: Task = {
        id: 'task-1',
        type: 'execution',
        description: 'Test',
        input: {},
        priority: 1,
      };

      const result = await agentWithoutTools.execute(task, context);

      expect(result.success).toBe(true);
    });
  });

  describe('setToolRegistry', () => {
    it('should allow setting tool registry after construction', () => {
      const agentWithoutTools = createExecutorAgent('executor-3', mockLLM);
      const newRegistry = new ToolRegistry();

      agentWithoutTools.setToolRegistry(newRegistry);

      // 내부적으로 설정되었는지 확인 (private이므로 간접 테스트)
      expect(() => agentWithoutTools.setToolRegistry(newRegistry)).not.toThrow();
    });
  });
});
```

**파일 위치:** `packages/agents/test/roles/verifier-agent.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VerifierAgent, createVerifierAgent } from '../../src/roles/verifier-agent';
import { MockLLMAdapter } from '../../src/llm/mock-adapter';
import { AgentRole, AgentState, Task, AgentContext } from '../../src/roles/base-agent';

const createMockBlackboard = () => ({
  read: vi.fn().mockReturnValue({}),
  write: vi.fn(),
  events: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
});

describe('VerifierAgent', () => {
  let agent: VerifierAgent;
  let mockLLM: MockLLMAdapter;
  let mockBoard: ReturnType<typeof createMockBlackboard>;
  let context: AgentContext;

  beforeEach(() => {
    mockLLM = new MockLLMAdapter();
    mockBoard = createMockBlackboard();
    agent = createVerifierAgent('verifier-1', mockLLM);

    context = {
      sessionId: 'session-123',
      board: mockBoard as any,
      history: [],
    };
  });

  describe('constructor', () => {
    it('should create agent with correct role', () => {
      expect(agent.role).toBe(AgentRole.VERIFIER);
    });

    it('should generate id if not provided', () => {
      const agentWithoutId = new VerifierAgent({ llm: mockLLM });
      expect(agentWithoutId.id).toMatch(/^verifier-/);
    });
  });

  describe('execute - 검증 성공 테스트', () => {
    it('should verify valid output', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: true,
        score: 95,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'passed', evidence: 'All fields present' },
          { name: 'accuracy', description: 'Check accuracy', status: 'passed', evidence: 'Data verified' },
        ],
        findings: [],
        suggestions: [],
      }));

      const task: Task = {
        id: 'task-1',
        type: 'verification',
        description: 'Verify analysis result',
        input: {
          output: { summary: 'Test result', confidence: 90 },
          criteria: ['completeness', 'accuracy'],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');

      const output = result.output as any;
      expect(output.passed).toBe(true);
      expect(output.score).toBe(95);
      expect(output.findings).toHaveLength(0);
    });

    it('should verify with high confidence', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: true,
        score: 98,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'passed', evidence: 'Complete' },
          { name: 'accuracy', description: 'Check accuracy', status: 'passed', evidence: 'Accurate' },
          { name: 'consistency', description: 'Check consistency', status: 'passed', evidence: 'Consistent' },
          { name: 'relevance', description: 'Check relevance', status: 'passed', evidence: 'Relevant' },
        ],
        findings: [],
        suggestions: [],
      }));

      const task: Task = {
        id: 'task-2',
        type: 'verification',
        description: 'High confidence verification',
        input: {
          output: { data: 'well-structured output' },
          criteria: ['quality', 'consistency'],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.passed).toBe(true);
      expect(output.score).toBeGreaterThanOrEqual(95);
    });
  });

  describe('execute - 검증 실패 테스트', () => {
    it('should reject invalid output', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 45,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'failed', evidence: 'Missing fields' },
          { name: 'accuracy', description: 'Check accuracy', status: 'passed', evidence: 'Data correct' },
          { name: 'consistency', description: 'Check consistency', status: 'passed', evidence: 'Consistent' },
          { name: 'relevance', description: 'Check relevance', status: 'failed', evidence: 'Off-topic' },
        ],
        findings: [
          {
            id: 'f-1',
            type: 'error',
            severity: 'high',
            description: 'Missing required fields',
            location: 'output.summary',
          },
          {
            id: 'f-2',
            type: 'warning',
            severity: 'medium',
            description: 'Partial off-topic content',
            location: 'output.details',
          },
        ],
        suggestions: [
          'Add missing summary field',
          'Review relevance of details section',
        ],
      }));

      const task: Task = {
        id: 'task-3',
        type: 'verification',
        description: 'Verify incomplete output',
        input: {
          output: { incomplete: 'data' },
          criteria: ['completeness', 'relevance'],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.passed).toBe(false);
      expect(output.findings).toHaveLength(2);
      expect(output.findings[0].severity).toBe('high');
      expect(output.suggestions).toHaveLength(2);
    });

    it('should reject output with critical errors', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 15,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'failed', evidence: 'Missing core' },
          { name: 'accuracy', description: 'Check accuracy', status: 'failed', evidence: 'Factual errors' },
          { name: 'consistency', description: 'Check consistency', status: 'failed', evidence: 'Inconsistent' },
          { name: 'relevance', description: 'Check relevance', status: 'failed', evidence: 'Irrelevant' },
        ],
        findings: [
          {
            id: 'f-1',
            type: 'error',
            severity: 'critical',
            description: 'Factual errors detected',
            location: 'output.facts',
          },
          {
            id: 'f-2',
            type: 'error',
            severity: 'critical',
            description: 'Missing core information',
            location: 'output',
          },
        ],
        suggestions: ['Correct factual errors', 'Add missing core information'],
      }));

      const task: Task = {
        id: 'task-4',
        type: 'verification',
        description: 'Verify output with critical errors',
        input: {
          output: { facts: 'incorrect information' },
          criteria: ['accuracy', 'completeness'],
        },
        priority: 2, // Higher priority for critical verification
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.passed).toBe(false);
      expect(output.findings.filter((f: any) => f.severity === 'critical')).toHaveLength(2);
    });
  });

  describe('execute - 오류 감지 테스트', () => {
    it('should detect errors in output', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 30,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'passed', evidence: 'Complete' },
          { name: 'accuracy', description: 'Check accuracy', status: 'failed', evidence: 'Errors found' },
          { name: 'consistency', description: 'Check consistency', status: 'failed', evidence: 'Contradictions' },
          { name: 'relevance', description: 'Check relevance', status: 'passed', evidence: 'Relevant' },
        ],
        findings: [
          {
            id: 'f-1',
            type: 'error',
            severity: 'high',
            description: 'Invalid JSON structure',
            location: 'output.metadata',
          },
          {
            id: 'f-2',
            type: 'error',
            severity: 'high',
            description: 'Contradictory statements',
            location: 'output.conclusions',
          },
        ],
        suggestions: ['Fix JSON syntax', 'Review logical consistency'],
      }));

      const task: Task = {
        id: 'task-5',
        type: 'verification',
        description: 'Detect syntax and logic errors',
        input: {
          output: { metadata: '{invalid}' },
          criteria: ['syntax', 'logic'],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.passed).toBe(false);
      expect(output.findings.some((f: any) => f.description.includes('JSON'))).toBe(true);
      expect(output.findings.some((f: any) => f.description.includes('Contradictory'))).toBe(true);
    });

    it('should categorize errors by severity', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 25,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'passed', evidence: 'OK' },
          { name: 'accuracy', description: 'Check accuracy', status: 'passed', evidence: 'OK' },
          { name: 'consistency', description: 'Check consistency', status: 'failed', evidence: 'Issues' },
          { name: 'relevance', description: 'Check relevance', status: 'passed', evidence: 'OK' },
        ],
        findings: [
          { id: 'f-1', type: 'error', severity: 'critical', description: 'Major error', location: 'root' },
          { id: 'f-2', type: 'error', severity: 'high', description: 'Format issue', location: 'section' },
          { id: 'f-3', type: 'warning', severity: 'medium', description: 'Style preference', location: 'paragraph' },
          { id: 'f-4', type: 'info', severity: 'low', description: 'Minor nit', location: 'line' },
        ],
        suggestions: ['Fix critical first', 'Then high', 'Then medium'],
      }));

      const task: Task = {
        id: 'task-6',
        type: 'verification',
        description: 'Categorize error severity',
        input: { output: {}, criteria: ['all'] },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.findings).toHaveLength(4);
      expect(output.findings[0].severity).toBe('critical');
      expect(output.findings[3].severity).toBe('low');
    });
  });

  describe('execute - 검증 결과 보고 테스트', () => {
    it('should report verification results to blackboard', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: true,
        score: 93,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'passed', evidence: 'Complete' },
        ],
        findings: [],
        suggestions: [],
      }));

      const task: Task = {
        id: 'task-7',
        type: 'verification',
        description: 'Verify and report',
        input: { output: { result: 'ok' }, criteria: ['completeness'] },
        priority: 1,
      };

      await agent.execute(task, context);

      expect(mockBoard.write).toHaveBeenCalledWith(
        'knowledge',
        expect.objectContaining({})
      );
      expect(mockBoard.events.emit).toHaveBeenCalledWith(
        'verification.completed',
        expect.objectContaining({
          agentId: 'verifier-1',
        })
      );
    });

    it('should report with detailed findings on failure', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 40,
        checks: [
          { name: 'completeness', description: 'Check completeness', status: 'failed', evidence: 'Incomplete' },
        ],
        findings: [
          { id: 'f-1', type: 'error', severity: 'high', description: 'Missing data', location: 'section' },
        ],
        suggestions: ['Add missing data'],
      }));

      const task: Task = {
        id: 'task-8',
        type: 'verification',
        description: 'Verify incomplete result',
        input: { output: { partial: 'data' }, criteria: ['completeness'] },
        priority: 1,
      };

      await agent.execute(task, context);

      expect(mockBoard.write).toHaveBeenCalledWith(
        'knowledge',
        expect.objectContaining({})
      );
      expect(mockBoard.events.emit).toHaveBeenCalledWith(
        'verification.completed',
        expect.objectContaining({
          agentId: 'verifier-1',
        })
      );
    });

    it('should include verification history in report', async () => {
      // First verification
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 65,
        checks: [{ name: 'style', description: 'Check style', status: 'failed', evidence: 'Style issues' }],
        findings: [{ id: 'f-1', type: 'warning', severity: 'medium', description: 'Style issue', location: 'text' }],
        suggestions: ['Fix style'],
      }));

      await agent.execute({
        id: 'task-9',
        type: 'verification',
        description: 'First verification',
        input: { output: { text: 'content' }, criteria: ['style'] },
        priority: 1,
      }, context);

      // Second verification (after fix)
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: true,
        score: 95,
        checks: [{ name: 'style', description: 'Check style', status: 'passed', evidence: 'Style OK' }],
        findings: [],
        suggestions: [],
      }));

      const result = await agent.execute({
        id: 'task-10',
        type: 'verification',
        description: 'Re-verification after fix',
        input: { output: { text: 'fixed content' }, criteria: ['style'] },
        priority: 1,
      }, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.passed).toBe(true);
      expect(output.score).toBeGreaterThan(90);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = agent.getStatus();

      expect(status.id).toBe('verifier-1');
      expect(status.role).toBe(AgentRole.VERIFIER);
      expect(status.state).toBe(AgentState.IDLE);
      expect(status.errorCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      mockLLM.setFailureMode(true, new Error('LLM Error'));

      const task: Task = {
        id: 'task-11',
        type: 'verification',
        description: 'Test error handling',
        input: { output: {}, criteria: [] },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('LLM Error');
    });

    it('should fallback when JSON parsing fails', async () => {
      mockLLM.setDefaultResponse('Plain text response without JSON');

      const task: Task = {
        id: 'task-12',
        type: 'verification',
        description: 'Test JSON fallback',
        input: { output: {}, criteria: [] },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.type).toBe('verification');
      expect(output.passed).toBe(false);
      expect(output.score).toBe(0);
    });

    it('should emit critical event for critical findings', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'verification',
        passed: false,
        score: 10,
        checks: [],
        findings: [
          { id: 'f-1', type: 'error', severity: 'critical', description: 'Critical issue', location: 'root' },
        ],
        suggestions: [],
      }));

      const task: Task = {
        id: 'task-13',
        type: 'verification',
        description: 'Test critical event',
        input: { output: {}, criteria: [] },
        priority: 1,
      };

      await agent.execute(task, context);

      expect(mockBoard.events.emit).toHaveBeenCalledWith(
        'verification.critical',
        expect.objectContaining({
          agentId: 'verifier-1',
        })
      );
    });
  });
});
```

**파일 위치:** `packages/agents/test/roles/director-agent.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectorAgent, createDirectorAgent } from '../../src/roles/director-agent';
import { MockLLMAdapter } from '../../src/llm/mock-adapter';
import { AgentRole, AgentState, Task, AgentContext, MeetingPhase } from '../../src/roles/base-agent';

const createMockBlackboard = () => ({
  read: vi.fn().mockReturnValue({}),
  write: vi.fn(),
  events: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
});

describe('DirectorAgent', () => {
  let agent: DirectorAgent;
  let mockLLM: MockLLMAdapter;
  let mockBoard: ReturnType<typeof createMockBlackboard>;
  let context: AgentContext;

  beforeEach(() => {
    mockLLM = new MockLLMAdapter();
    mockBoard = createMockBlackboard();
    agent = createDirectorAgent('director-1', mockLLM);

    context = {
      sessionId: 'session-123',
      board: mockBoard as any,
      history: [],
    };
  });

  describe('constructor', () => {
    it('should create agent with correct role', () => {
      expect(agent.role).toBe(AgentRole.DIRECTOR);
    });

    it('should generate id if not provided', () => {
      const agentWithoutId = new DirectorAgent({ llm: mockLLM });
      expect(agentWithoutId.id).toMatch(/^director-/);
    });
  });

  describe('execute - 회의 진행 테스트', () => {
    it('should coordinate meeting flow', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'coordination',
        agenda: 'Project Review',
        participants: ['analyst', 'executor', 'verifier'],
        steps: [
          { step: 1, description: 'Introduce agenda', assignee: 'director', dependencies: [], estimatedDuration: '5min' },
          { step: 2, description: 'Analyst presents findings', assignee: 'analyst', dependencies: ['step-1'], estimatedDuration: '10min' },
          { step: 3, description: 'Executor reviews tasks', assignee: 'executor', dependencies: ['step-1'], estimatedDuration: '5min' },
        ],
        timeline: ['5min: Agenda intro', '15min: Presentations', '20min: Next steps'],
        expectedOutcome: 'All participants aligned on project goals',
      }));

      const task: Task = {
        id: 'task-1',
        type: 'coordination',
        description: 'Start meeting',
        input: {
          topic: 'Project Review',
          participants: ['analyst', 'executor', 'verifier'],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');

      const output = result.output as any;
      expect(output.type).toBe('coordination');
      expect(output.agenda).toBe('Project Review');
      expect(output.participants).toHaveLength(3);
      expect(output.steps).toHaveLength(3);
      expect(output.timeline).toHaveLength(3);
    });

    it('should progress through meeting phases', async () => {
      // Opening phase
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'coordination',
        agenda: 'Discussion kickoff',
        participants: ['analyst'],
        steps: [
          { step: 1, description: 'Introduce topic', assignee: 'director', dependencies: [], estimatedDuration: '2min' },
        ],
        timeline: ['2min: Introduction'],
        expectedOutcome: 'Discussion started',
      }));

      const openingResult = await agent.execute({
        id: 'task-2a',
        type: 'coordination',
        description: 'Opening',
        input: { topic: 'Discussion' },
        priority: 1,
      }, context);

      expect((openingResult.output as any).agenda).toBe('Discussion kickoff');

      // Discussion phase
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'coordination',
        agenda: 'Discussion moderation',
        participants: ['analyst', 'verifier'],
        steps: [
          { step: 1, description: 'Analyst presents', assignee: 'analyst', dependencies: [], estimatedDuration: '5min' },
          { step: 2, description: 'Verifier reviews', assignee: 'verifier', dependencies: ['step-1'], estimatedDuration: '3min' },
        ],
        timeline: ['5min: Analyst', '8min: Verifier', '10min: Conclusion'],
        expectedOutcome: 'All viewpoints heard',
      }));

      const discussionResult = await agent.execute({
        id: 'task-2b',
        type: 'coordination',
        description: 'Discussion',
        input: { phase: 'discussion' },
        priority: 1,
      }, context);

      expect((discussionResult.output as any).steps).toHaveLength(2);

      // Closing phase
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'coordination',
        agenda: 'Meeting conclusion',
        participants: ['analyst', 'verifier'],
        steps: [
          { step: 1, description: 'Summarize discussion', assignee: 'director', dependencies: [], estimatedDuration: '2min' },
        ],
        timeline: ['2min: Summary'],
        expectedOutcome: 'Meeting concluded with action items',
      }));

      const closingResult = await agent.execute({
        id: 'task-2c',
        type: 'coordination',
        description: 'Closing',
        input: { phase: 'closing' },
        priority: 1,
      }, context);

      expect((closingResult.output as any).expectedOutcome).toContain('concluded');
    });

    it('should handle participant turn transitions', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        type: 'coordination',
        agenda: 'Turn management',
        participants: ['analyst', 'executor'],
        steps: [
          { step: 1, description: 'Analyst speaks', assignee: 'analyst', dependencies: [], estimatedDuration: '5min' },
          { step: 2, description: 'Transition to executor', assignee: 'executor', dependencies: ['step-1'], estimatedDuration: '5min' },
        ],
        timeline: ['0-5min: Analyst', '5-10min: Executor'],
        expectedOutcome: 'Smooth transition completed',
      }));

      const task: Task = {
        id: 'task-3',
        type: 'coordination',
        description: 'Transition to next speaker',
        input: {
          currentSpeaker: 'analyst',
          reason: 'timeout',
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.steps[1].assignee).toBe('executor');
      expect(output.timeline).toContain('5-10min: Executor');
    });
  });

  describe('execute - 투표 관리 테스트', () => {
    it('should manage voting process', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'voting',
        action: 'initiate_vote',
        voteId: 'vote-001',
        proposal: 'Approve the analysis result',
        options: ['approve', 'reject', 'abstain'],
        voters: ['analyst', 'executor', 'verifier'],
        votingMethod: 'majority',
        timeLimit: 60,
      }));

      const task: Task = {
        id: 'task-4',
        type: 'direct',
        description: 'Start voting on proposal',
        input: {
          proposal: 'Approve the analysis result',
          voters: ['analyst', 'executor', 'verifier'],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.phase).toBe('voting');
      expect(output.action).toBe('initiate_vote');
      expect(output.options).toEqual(['approve', 'reject', 'abstain']);
      expect(output.voters).toHaveLength(3);
      expect(output.votingMethod).toBe('majority');
    });

    it('should collect and count votes', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'voting',
        action: 'tally_votes',
        voteId: 'vote-002',
        proposal: 'Next step decision',
        votes: [
          { voter: 'analyst', option: 'option_a', timestamp: Date.now() },
          { voter: 'executor', option: 'option_a', timestamp: Date.now() },
          { voter: 'verifier', option: 'option_b', timestamp: Date.now() },
        ],
        results: {
          option_a: { count: 2, percentage: 66.7 },
          option_b: { count: 1, percentage: 33.3 },
          abstain: { count: 0, percentage: 0 },
        },
        winner: 'option_a',
        status: 'completed',
      }));

      const task: Task = {
        id: 'task-5',
        type: 'direct',
        description: 'Tally votes',
        input: {
          voteId: 'vote-002',
          votes: [
            { voter: 'analyst', option: 'option_a' },
            { voter: 'executor', option: 'option_a' },
            { voter: 'verifier', option: 'option_b' },
          ],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.action).toBe('tally_votes');
      expect(output.votes).toHaveLength(3);
      expect(output.results.option_a.count).toBe(2);
      expect(output.results.option_b.count).toBe(1);
      expect(output.winner).toBe('option_a');
      expect(output.status).toBe('completed');
    });

    it('should handle tie votes', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'voting',
        action: 'tally_votes',
        voteId: 'vote-003',
        proposal: 'Tie scenario',
        votes: [
          { voter: 'analyst', option: 'yes' },
          { voter: 'executor', option: 'no' },
          { voter: 'verifier', option: 'abstain' },
        ],
        results: {
          yes: { count: 1, percentage: 33.3 },
          no: { count: 1, percentage: 33.3 },
          abstain: { count: 1, percentage: 33.3 },
        },
        winner: null,
        status: 'tie',
        tieBreaker: 'director',
      }));

      const task: Task = {
        id: 'task-6',
        type: 'direct',
        description: 'Handle tie vote',
        input: {
          votes: [
            { voter: 'analyst', option: 'yes' },
            { voter: 'executor', option: 'no' },
            { voter: 'verifier', option: 'abstain' },
          ],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.winner).toBeNull();
      expect(output.status).toBe('tie');
      expect(output.tieBreaker).toBe('director');
    });
  });

  describe('execute - 합의 도출 테스트', () => {
    it('should reach consensus', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'consensus',
        action: 'check_consensus',
        consensusLevel: 'unanimous',
        agreement: {
          topic: 'Project timeline',
          decision: '2 weeks extension approved',
          participants: ['analyst', 'executor', 'verifier'],
          confidence: 0.95,
        },
        disagreements: [],
        pathToConsensus: [
          'Initial proposal',
          'Discussion of concerns',
          'Compromise reached',
          'Final agreement',
        ],
      }));

      const task: Task = {
        id: 'task-7',
        type: 'direct',
        description: 'Check for consensus',
        input: {
          topic: 'Project timeline',
          positions: [
            { agent: 'analyst', position: 'approve' },
            { agent: 'executor', position: 'approve' },
            { agent: 'verifier', position: 'approve' },
          ],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.consensusLevel).toBe('unanimous');
      expect(output.agreement.decision).toBe('2 weeks extension approved');
      expect(output.disagreements).toHaveLength(0);
      expect(output.confidence).toBeGreaterThan(0.9);
    });

    it('should reach majority consensus', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'consensus',
        action: 'check_consensus',
        consensusLevel: 'majority',
        agreement: {
          topic: 'Implementation approach',
          decision: 'Use library X',
          participants: ['analyst', 'executor', 'verifier'],
          majorityRatio: 0.67,
          confidence: 0.85,
        },
        disagreements: [
          {
            agent: 'verifier',
            concern: 'Security concerns with library X',
            severity: 'medium',
          },
        ],
        pathToConsensus: [
          'Analyst proposes library X',
          'Executor agrees',
          'Verifier expresses security concerns',
          'Security review conducted',
          'Majority approves with conditions',
        ],
      }));

      const task: Task = {
        id: 'task-8',
        type: 'direct',
        description: 'Majority consensus with concerns',
        input: {
          topic: 'Implementation approach',
          positions: [
            { agent: 'analyst', position: 'library X' },
            { agent: 'executor', position: 'library X' },
            { agent: 'verifier', position: 'concerns' },
          ],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.consensusLevel).toBe('majority');
      expect(output.majorityRatio).toBeGreaterThan(0.5);
      expect(output.disagreements).toHaveLength(1);
      expect(output.disagreements[0].agent).toBe('verifier');
    });

    it('should mediate partial consensus', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'consensus',
        action: 'mediate',
        consensusLevel: 'partial',
        agreement: {
          topic: 'Feature prioritization',
          agreedItems: ['Feature A', 'Feature B'],
          pendingItems: ['Feature C'],
          participants: ['analyst', 'executor', 'verifier'],
        },
        disagreements: [
          {
            agent: 'analyst',
            concern: 'Feature C should be prioritized',
            severity: 'low',
          },
          {
            agent: 'executor',
            concern: 'Feature C needs more research',
            severity: 'low',
          },
        ],
        mediationSuggestions: [
          'Research Feature C more thoroughly',
          'Revisit Feature C prioritization in next sprint',
        ],
      }));

      const task: Task = {
        id: 'task-9',
        type: 'direct',
        description: 'Mediate partial agreement',
        input: {
          topic: 'Feature prioritization',
          positions: [
            { agent: 'analyst', agreed: ['A', 'B'], pending: ['C'] },
            { agent: 'executor', agreed: ['A', 'B'], pending: ['C'] },
          ],
        },
        priority: 1,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.consensusLevel).toBe('partial');
      expect(output.agreement.agreedItems).toEqual(['Feature A', 'Feature B']);
      expect(output.mediationSuggestions).toBeDefined();
    });
  });

  describe('execute - 에스컬레이션 테스트', () => {
    it('should escalate when consensus fails', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'escalation',
        action: 'escalate',
        escalationLevel: 'human',
        reason: 'Unable to reach consensus after multiple attempts',
        context: {
          topic: 'Critical architecture decision',
          attempts: 3,
          lastConsensusLevel: 'none',
          deadlockReason: 'Fundamental disagreement on approach',
        },
        escalationDetails: {
          escalateTo: 'human_supervisor',
          priority: 'high',
          requires: 'Decision on architecture approach',
          background: [
            'Analyst prefers approach A',
            'Executor prefers approach B',
            'Verifier has concerns with both',
          ],
        },
        recommendedActions: [
          'Schedule human review',
          'Provide additional data for human decision',
        ],
      }));

      const task: Task = {
        id: 'task-10',
        type: 'direct',
        description: 'Escalate failed consensus',
        input: {
          attempts: 3,
          topic: 'Critical architecture decision',
        },
        priority: 2, // Higher priority for escalation
      };

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.phase).toBe('escalation');
      expect(output.escalationLevel).toBe('human');
      expect(output.escalationDetails.escalateTo).toBe('human_supervisor');
      expect(output.escalationDetails.priority).toBe('high');
    });

    it('should provide escalation context', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'escalation',
        action: 'prepare_escalation_package',
        escalationLevel: 'human',
        context: {
          sessionId: 'session-123',
          meetingId: 'meeting-001',
          topic: 'Feature scope',
          attempts: 5,
          history: [
            { phase: 'opening', action: 'introduce_agenda' },
            { phase: 'discussion', action: 'moderate', result: 'debate' },
            { phase: 'voting', action: 'tally_votes', result: 'tie' },
            { phase: 'consensus', action: 'check_consensus', result: 'failed' },
          ],
        },
        escalationDetails: {
          escalateTo: 'product_manager',
          urgency: 'immediate',
          requires: 'Decision on feature scope',
          attachments: [
            { type: 'summary', content: 'Discussion summary' },
            { type: 'positions', content: 'Agent positions' },
            { type: 'alternatives', content: 'Considered alternatives' },
          ],
        },
        deadline: Date.now() + 3600000, // 1 hour
      }));

      const task: Task = {
        id: 'task-11',
        type: 'direct',
        description: 'Prepare escalation package',
        input: {
          history: [
            { phase: 'opening', result: 'started' },
            { phase: 'discussion', result: 'debate' },
            { phase: 'voting', result: 'tie' },
          ],
        },
        priority: 2,
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.escalationDetails.attachments).toBeDefined();
      expect(output.escalationDetails.attachments).toHaveLength(3);
      expect(output.deadline).toBeDefined();
    });

    it('should handle critical escalation', async () => {
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'escalation',
        action: 'critical_escalation',
        escalationLevel: 'critical',
        reason: 'Deadlock on critical system decision with deadline approaching',
        context: {
          topic: 'System migration strategy',
          deadline: Date.now() + 7200000, // 2 hours
          attempts: 4,
          impact: 'high',
        },
        escalationDetails: {
          escalateTo: 'technical_lead',
          priority: 'critical',
          requires: 'Immediate decision on migration strategy',
          recommendedDecision: 'Postpone migration for 2 weeks',
        },
        notificationChannels: ['email', 'slack', 'sms'],
      }));

      const task: Task = {
        id: 'task-12',
        type: 'direct',
        description: 'Critical escalation',
        input: {
          deadline: Date.now() + 7200000,
          impact: 'high',
        },
        priority: 3, // Highest priority
      };

      const result = await agent.execute(task, context);

      const output = result.output as any;
      expect(output.escalationLevel).toBe('critical');
      expect(output.escalationDetails.priority).toBe('critical');
      expect(output.notificationChannels).toContain('email');
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = agent.getStatus();

      expect(status.id).toBe('director-1');
      expect(status.role).toBe(AgentRole.DIRECTOR);
      expect(status.state).toBe(AgentState.IDLE);
      expect(status.errorCount).toBe(0);
    });

    it('should track meeting statistics', async () => {
      // Run a meeting
      mockLLM.setDefaultResponse(JSON.stringify({
        phase: 'opening',
        action: 'introduce_agenda',
        agenda: ['A', 'B'],
        participants: ['analyst'],
        nextSpeaker: 'analyst',
        timeAllocation: {},
      }));

      await agent.execute({
        id: 'task-13',
        type: 'direct',
        description: 'Meeting 1',
        input: {},
        priority: 1,
      }, context);

      const status = agent.getStatus();
      expect(status.meetingsDirected).toBeGreaterThan(0);
    });
  });

  describe('configureMeeting', () => {
    it('should allow custom meeting configuration', () => {
      const agent = new DirectorAgent({
        llm: mockLLM,
        maxParticipants: 10,
        defaultTimeLimit: 1800, // 30 minutes
      });

      expect(() => agent.configureMeeting({ 
        votingMethod: 'consensus',
        strictness: 'moderate' 
      })).not.toThrow();
    });

    it('should set time limits per phase', () => {
      agent.configureMeeting({
        phaseTimeLimits: {
          opening: 300,    // 5 minutes
          discussion: 900, // 15 minutes
          voting: 300,     // 5 minutes
          closing: 300,    // 5 minutes
        },
      });

      const status = agent.getStatus();
      expect(status.config?.phaseTimeLimits).toBeDefined();
    });
  });
});
```

### 4. 프롬프트 템플릿 테스트

**파일 위치:** `packages/agents/test/prompts/template.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { PromptTemplate } from '../../src/prompts/template';

describe('PromptTemplate', () => {
  describe('render', () => {
    it('should substitute simple variables', () => {
      const template = new PromptTemplate('Hello {{name}}!');
      const result = template.render({ name: 'Alice' });

      expect(result).toBe('Hello Alice!');
    });

    it('should handle multiple variables', () => {
      const template = new PromptTemplate('{{greeting}} {{name}}, welcome to {{place}}!');
      const result = template.render({
        greeting: 'Hello',
        name: 'Bob',
        place: 'wonderland',
      });

      expect(result).toBe('Hello Bob, welcome to wonderland!');
    });

    it('should handle missing variables with empty string', () => {
      const template = new PromptTemplate('Hello {{name}}!');
      const result = template.render({});

      expect(result).toBe('Hello !');
    });

    it('should handle default values', () => {
      const template = new PromptTemplate('Hello {{name|Guest}}!');
      const result = template.render({});

      expect(result).toBe('Hello Guest!');
    });

    it('should override default values when provided', () => {
      const template = new PromptTemplate('Hello {{name|Guest}}!');
      const result = template.render({ name: 'Alice' });

      expect(result).toBe('Hello Alice!');
    });
  });

  describe('conditionals', () => {
    it('should render if block when condition is truthy', () => {
      const template = new PromptTemplate('{{#if showGreeting}}Hello!{{/if}}');
      const result = template.render({ showGreeting: true });

      expect(result).toBe('Hello!');
    });

    it('should not render if block when condition is falsy', () => {
      const template = new PromptTemplate('{{#if showGreeting}}Hello!{{/if}}');
      const result = template.render({ showGreeting: false });

      expect(result).toBe('');
    });

    it('should handle unless blocks', () => {
      const template = new PromptTemplate('{{#unless hidden}}Visible{{/unless}}');

      expect(template.render({ hidden: false })).toBe('Visible');
      expect(template.render({ hidden: true })).toBe('');
    });

    it('should consider empty array as falsy', () => {
      const template = new PromptTemplate('{{#if items}}Has items{{/if}}');

      expect(template.render({ items: [] })).toBe('');
      expect(template.render({ items: ['a'] })).toBe('Has items');
    });

    it('should consider empty string as falsy', () => {
      const template = new PromptTemplate('{{#if name}}Name: {{name}}{{/if}}');

      expect(template.render({ name: '' })).toBe('');
      expect(template.render({ name: 'Alice' })).toBe('Name: Alice');
    });
  });

  describe('getVariables', () => {
    it('should extract all variables', () => {
      const template = new PromptTemplate('{{a}} {{b}} {{c}}');
      const variables = template.getVariables();

      expect(variables).toContain('a');
      expect(variables).toContain('b');
      expect(variables).toContain('c');
    });

    it('should not include duplicates', () => {
      const template = new PromptTemplate('{{a}} {{a}} {{b}}');
      const variables = template.getVariables();

      expect(variables.filter(v => v === 'a')).toHaveLength(1);
    });
  });

  describe('merge', () => {
    it('should merge two templates', () => {
      const t1 = new PromptTemplate('Part 1: {{a}}');
      const t2 = new PromptTemplate('Part 2: {{b}}');
      const merged = t1.merge(t2);

      const result = merged.render({ a: 'A', b: 'B' });

      expect(result).toContain('Part 1: A');
      expect(result).toContain('Part 2: B');
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const original = new PromptTemplate('Hello {{name}}!');
      const cloned = original.clone();

      const result1 = original.render({ name: 'Alice' });
      const result2 = cloned.render({ name: 'Bob' });

      expect(result1).toBe('Hello Alice!');
      expect(result2).toBe('Hello Bob!');
    });
  });
});
```

**파일 위치:** `packages/agents/test/prompts/registry.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PromptTemplateRegistry } from '../../src/prompts/registry';

describe('PromptTemplateRegistry', () => {
  let registry: PromptTemplateRegistry;

  beforeEach(() => {
    registry = new PromptTemplateRegistry();
  });

  describe('register', () => {
    it('should register template', () => {
      registry.register('greeting', 'Hello {{name}}!');

      expect(registry.get('greeting')).toBeDefined();
    });
  });

  describe('render', () => {
    it('should render registered template', () => {
      registry.register('greeting', 'Hello {{name}}!');

      const result = registry.render('greeting', { name: 'Alice' });

      expect(result).toBe('Hello Alice!');
    });

    it('should throw for unknown template', () => {
      expect(() => registry.render('unknown', {})).toThrow('Template not found');
    });
  });

  describe('alias', () => {
    it('should resolve alias to original template', () => {
      registry.register('greeting', 'Hello {{name}}!');
      registry.alias('greeting', 'hi');

      const result = registry.render('hi', { name: 'Bob' });

      expect(result).toBe('Hello Bob!');
    });
  });

  describe('list', () => {
    it('should list all registered templates', () => {
      registry.register('a', 'A');
      registry.register('b', 'B');

      const list = registry.list();

      expect(list).toContain('a');
      expect(list).toContain('b');
    });
  });

  describe('clear', () => {
    it('should remove all templates', () => {
      registry.register('a', 'A');
      registry.register('b', 'B');

      registry.clear();

      expect(registry.list()).toHaveLength(0);
    });
  });
});
```

### 5. 도구 통합 테스트

**파일 위치:** `packages/agents/test/tools/registry.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry';
import { Tool, ToolContext } from '../../src/tools/types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let context: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    context = {
      sessionId: 'session-1',
      agentId: 'agent-1',
      permissions: new Set(['*']),
    };
  });

  describe('register', () => {
    it('should register tool', () => {
      const tool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return 'result';
        },
      };

      registry.register(tool);

      expect(registry.has('test_tool')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      const tool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return 'result';
        },
      };

      registry.register(tool);

      expect(() => registry.register(tool)).toThrow('already registered');
    });
  });

  describe('execute', () => {
    it('should execute tool successfully', async () => {
      const tool: Tool = {
        name: 'adder',
        description: 'Adds two numbers',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
        },
        async execute(params: { a: number; b: number }) {
          return params.a + params.b;
        },
      };

      registry.register(tool);

      const result = await registry.execute('adder', { a: 2, b: 3 }, context);

      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.execute('unknown', {}, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });

    it('should check permissions', async () => {
      const tool: Tool = {
        name: 'admin_tool',
        description: 'Admin only',
        parameters: { type: 'object', properties: {} },
        requiredPermissions: ['admin'],
        async execute() {
          return 'admin result';
        },
      };

      registry.register(tool);

      const restrictedContext: ToolContext = {
        ...context,
        permissions: new Set(['user']),
      };

      const result = await registry.execute('admin_tool', {}, restrictedContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('should handle execution errors', async () => {
      const tool: Tool = {
        name: 'failing_tool',
        description: 'Always fails',
        parameters: { type: 'object', properties: {} },
        async execute() {
          throw new Error('Intentional failure');
        },
      };

      registry.register(tool);

      const result = await registry.execute('failing_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toBe('Intentional failure');
    });

    it('should handle timeout', async () => {
      const tool: Tool = {
        name: 'slow_tool',
        description: 'Takes forever',
        parameters: { type: 'object', properties: {} },
        async execute() {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return 'done';
        },
      };

      registry.register(tool);

      const timeoutContext: ToolContext = {
        ...context,
        timeout: 100,
      };

      const result = await registry.execute('slow_tool', {}, timeoutContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    }, 10000);
  });

  describe('toFunctionCallingSchema', () => {
    it('should generate schema for all tools', () => {
      registry.register({
        name: 'tool_a',
        description: 'Tool A',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input value' },
          },
        },
        async execute() {
          return 'a';
        },
      });

      registry.register({
        name: 'tool_b',
        description: 'Tool B',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return 'b';
        },
      });

      const schema = registry.toFunctionCallingSchema();

      expect(schema).toHaveLength(2);
      expect(schema[0].type).toBe('function');
      expect(schema[0].function.name).toBe('tool_a');
      expect(schema[1].function.name).toBe('tool_b');
    });

    it('should generate schema for specific tools', () => {
      registry.register({
        name: 'tool_a',
        description: 'A',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return 'a';
        },
      });

      registry.register({
        name: 'tool_b',
        description: 'B',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return 'b';
        },
      });

      const schema = registry.toFunctionCallingSchema(['tool_a']);

      expect(schema).toHaveLength(1);
      expect(schema[0].function.name).toBe('tool_a');
    });
  });

  describe('categories', () => {
    it('should group tools by category', () => {
      registry.register({
        name: 'util_1',
        description: 'Utility 1',
        parameters: { type: 'object', properties: {} },
        category: 'utility',
        async execute() {
          return 1;
        },
      });

      registry.register({
        name: 'util_2',
        description: 'Utility 2',
        parameters: { type: 'object', properties: {} },
        category: 'utility',
        async execute() {
          return 2;
        },
      });

      registry.register({
        name: 'net_1',
        description: 'Network 1',
        parameters: { type: 'object', properties: {} },
        category: 'network',
        async execute() {
          return 3;
        },
      });

      const utilityTools = registry.listByCategory('utility');
      const networkTools = registry.listByCategory('network');

      expect(utilityTools).toHaveLength(2);
      expect(networkTools).toHaveLength(1);
    });
  });
});
```

**파일 위치:** `packages/agents/test/tools/executor.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor, ToolExecutionChain } from '../../src/tools/executor';
import { ToolRegistry } from '../../src/tools/registry';
import { ToolContext } from '../../src/tools/types';

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let context: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    context = {
      sessionId: 'session-1',
      agentId: 'agent-1',
      permissions: new Set(['*']),
    };

    // 테스트 도구 등록
    registry.register({
      name: 'echo',
      description: 'Echoes input',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      async execute(params: { message: string }) {
        return { echoed: params.message };
      },
    });
  });

  describe('handleFunctionCall', () => {
    it('should handle valid function call', async () => {
      const response = await executor.handleFunctionCall(
        {
          id: 'call-1',
          name: 'echo',
          arguments: JSON.stringify({ message: 'hello' }),
        },
        context
      );

      expect(response.id).toBe('call-1');
      expect(response.error).toBeUndefined();
      expect(JSON.parse(response.result)).toEqual({ echoed: 'hello' });
    });

    it('should handle invalid JSON arguments', async () => {
      const response = await executor.handleFunctionCall(
        {
          id: 'call-1',
          name: 'echo',
          arguments: 'invalid json',
        },
        context
      );

      expect(response.error).toContain('Invalid JSON');
    });

    it('should handle unknown tool', async () => {
      const response = await executor.handleFunctionCall(
        {
          id: 'call-1',
          name: 'unknown',
          arguments: '{}',
        },
        context
      );

      expect(response.error).toContain('not found');
    });
  });

  describe('handleFunctionCalls', () => {
    it('should handle multiple calls', async () => {
      const responses = await executor.handleFunctionCalls(
        [
          { id: 'call-1', name: 'echo', arguments: JSON.stringify({ message: 'a' }) },
          { id: 'call-2', name: 'echo', arguments: JSON.stringify({ message: 'b' }) },
        ],
        context
      );

      expect(responses).toHaveLength(2);
      expect(JSON.parse(responses[0].result)).toEqual({ echoed: 'a' });
      expect(JSON.parse(responses[1].result)).toEqual({ echoed: 'b' });
    });
  });

  describe('formatAsMessages', () => {
    it('should format responses as tool messages', async () => {
      const responses = await executor.handleFunctionCalls(
        [{ id: 'call-1', name: 'echo', arguments: JSON.stringify({ message: 'test' }) }],
        context
      );

      const messages = executor.formatAsMessages(responses);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('tool');
      expect(messages[0].toolCallId).toBe('call-1');
    });
  });
});

describe('ToolExecutionChain', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let chain: ToolExecutionChain;
  let context: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    chain = new ToolExecutionChain(executor);
    context = {
      sessionId: 'session-1',
      agentId: 'agent-1',
      permissions: new Set(['*']),
    };

    registry.register({
      name: 'double',
      description: 'Doubles a number',
      parameters: {
        type: 'object',
        properties: {
          n: { type: 'number' },
        },
      },
      async execute(params: { n: number }) {
        return params.n * 2;
      },
    });

    registry.register({
      name: 'add_one',
      description: 'Adds one',
      parameters: {
        type: 'object',
        properties: {
          n: { type: 'number' },
        },
      },
      async execute(params: { n: number }) {
        return params.n + 1;
      },
    });
  });

  it('should execute chain of tools', async () => {
    const results = await chain
      .then('double', { n: 5 })
      .then('add_one', (prev) => ({ n: prev as number }))
      .execute(context);

    expect(results).toHaveLength(2);
    expect(results[0].data).toBe(10); // 5 * 2
    expect(results[1].data).toBe(11); // 10 + 1
  });

  it('should stop on error', async () => {
    registry.register({
      name: 'fail',
      description: 'Fails',
      parameters: { type: 'object', properties: {} },
      async execute() {
        throw new Error('Failure');
      },
    });

    const results = await chain
      .then('fail', {})
      .then('double', { n: 5 })
      .execute(context);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });
});
```

## 완료 조건
- [x] MockLLMAdapter 구현 완료
- [x] LLM Adapter 테스트 작성 완료
- [x] AnalystAgent 테스트 작성 완료
- [x] ExecutorAgent 테스트 작성 완료
- [x] VerifierAgent 테스트 작성 완료
- [x] DirectorAgent 테스트 작성 완료
- [x] PromptTemplate 테스트 작성 완료
- [x] PromptTemplateRegistry 테스트 작성 완료
- [x] ToolRegistry 테스트 작성 완료
- [x] ToolExecutor 테스트 작성 완료
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공

## 의존성
- TASK-031 (Agent Roles)
- TASK-032 (Prompt Templates)
- TASK-033 (Tool Integration)

## 테스트 실행

```bash
cd packages/agents

# 모든 테스트 실행
pnpm test

# 특정 파일 테스트
pnpm test -- test/llm/adapter.test.ts

# 커버리지 포함 실행
pnpm test:coverage

# watch 모드
pnpm test:watch
```

## 엣지 케이스
1. 동시 다발적인 에이전트 실행 시 상태 격리
2. 빈 응답 처리
3. 매우 긴 응답 처리
4. 특수 문자가 포함된 프롬프트 처리
5. 순환 도구 호출 탐지
6. 메모리 누수 방지 (이벤트 리스너 정리)
7. 타임아웃 경계값 테스트

## 참고 자료
- [Vitest 공식 문서](https://vitest.dev/)
- [Vitest Mocking 가이드](https://vitest.dev/guide/mocking.html)
- TASK-030: Pi Mono LLM Adapter 구현
- TASK-031: 역할별 에이전트 구현
- TASK-032: 프롬프트 템플릿 시스템
- TASK-033: Function Calling / 도구 통합

---

*작성일: 2026-02-04*
*버전: 1.0.0*
