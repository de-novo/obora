# TASK-033: Function Calling / 도구 통합

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자
- Phase: Week 5-6

## 목표
AI 에이전트가 외부 도구를 사용할 수 있도록 Function Calling / Tool 통합 구현

## 작업 내용

### 1. Tool 인터페이스 정의

**파일 위치:** `packages/agents/src/tools/types.ts`

```typescript
/**
 * 도구 정의
 */
export interface Tool<TParams = Record<string, unknown>, TResult = unknown> {
  /**
   * 도구 고유 이름
   */
  name: string;

  /**
   * 도구 설명 (LLM이 참조)
   */
  description: string;

  /**
   * 파라미터 JSON Schema (ToolParameterSchema 또는 JSONSchema 사용 가능)
   */
  parameters: ToolParameterSchema | JSONSchema;

  /**
   * 도구 실행 함수
   */
  execute(params: TParams, context: ToolContext): Promise<TResult>;

  /**
   * 도구 검증 (선택적)
   */
  validate?(params: unknown): params is TParams;

  /**
   * 도구 카테고리 (선택적)
   */
  category?: string;

  /**
   * 도구 버전 (선택적)
   */
  version?: string;

  /**
   * 부작용 여부 (읽기 전용 vs 변경)
   */
  hasSideEffects?: boolean;

  /**
   * 필요한 권한
   */
  requiredPermissions?: string[];
}

/**
 * 파라미터 스키마 (JSON Schema, 스펙 14-ai-agents.md의 JSONSchema와 일치)
 */
export interface ToolParameterSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, PropertySchema>;
  required?: string[];
  items?: ToolParameterSchema;
  enum?: (string | number | boolean)[];
  description?: string;
}

/**
 * JSON Schema (스펙 14-ai-agents.md와 일치)
 * FunctionDefinition.parameters 타입으로 사용
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
}

/**
 * 속성 스키마
 */
export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number | boolean)[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * 도구 실행 컨텍스트
 */
export interface ToolContext {
  /**
   * 세션 ID
   */
  sessionId: string;

  /**
   * 호출한 에이전트 ID
   */
  agentId: string;

  /**
   * 작업 ID (선택적)
   */
  taskId?: string;

  /**
   * 추가 메타데이터
   */
  metadata?: Record<string, unknown>;

  /**
   * 권한
   */
  permissions: Set<string>;

  /**
   * 타임아웃 (ms)
   */
  timeout?: number;

  /**
   * 실행 취소 시그널
   */
  abortSignal?: AbortSignal;
}

/**
 * 도구 실행 결과
 */
export interface ToolExecutionResult<TResult = unknown> {
  /**
   * 성공 여부
   */
  success: boolean;

  /**
   * 결과 데이터
   */
  data?: TResult;

  /**
   * 에러 정보
   */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /**
   * 실행 시간 (ms)
   */
  duration: number;

  /**
   * 메타데이터
   */
  metadata?: Record<string, unknown>;
}

/**
 * Tool Definition (OpenAI 스타일 Tool Calling)
 * LLMAdapter 타입과 일치 (packages/agents/src/llm/adapter.ts 참조)
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Tool Call (OpenAI 스타일 Tool Calling)
 * LLMAdapter 타입과 일치 (packages/agents/src/llm/adapter.ts 참조)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Function Call 요청 (레거시 호환성을 위해 유지)
 * @deprecated ToolCall 사용 권장
 */
export interface FunctionCallRequest {
  id: string;
  name: string;
  arguments: string; // JSON string
}

/**
 * Function Calling 응답
 */
export interface FunctionCallResponse {
  id: string;
  result: string; // JSON string
  error?: string;
}
```

### 2. ToolRegistry 클래스

**파일 위치:** `packages/agents/src/tools/registry.ts`

```typescript
import {
  Tool,
  ToolContext,
  ToolExecutionResult,
  ToolDefinition,
} from './types';

/**
 * 도구 레지스트리
 * 도구 등록, 검색, 실행을 관리
 */
export class ToolRegistry {
  private tools: Map<string, Tool>;
  private categories: Map<string, Set<string>>;
  private aliases: Map<string, string>;

  constructor() {
    this.tools = new Map();
    this.categories = new Map();
    this.aliases = new Map();
  }

  /**
   * 도구 등록
   */
  register<TParams, TResult>(tool: Tool<TParams, TResult>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }

    this.tools.set(tool.name, tool as Tool);

    // 카테고리 등록
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);
    }
  }

  /**
   * 도구 등록 해제
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);

    // 카테고리에서 제거
    if (tool.category) {
      this.categories.get(tool.category)?.delete(name);
    }

    // 별칭 제거
    for (const [alias, target] of this.aliases.entries()) {
      if (target === name) {
        this.aliases.delete(alias);
      }
    }

    return true;
  }

  /**
   * 도구 가져오기
   */
  get(name: string): Tool | undefined {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.tools.get(resolvedName);
  }

  /**
   * 도구 존재 여부 확인
   */
  has(name: string): boolean {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.tools.has(resolvedName);
  }

  /**
   * 별칭 등록
   */
  alias(name: string, alias: string): void {
    if (!this.has(name)) {
      throw new Error(`Tool "${name}" not found`);
    }
    this.aliases.set(alias, name);
  }

  /**
   * 모든 도구 목록 반환
   */
  listTools(): Array<{
    name: string;
    description: string;
    category?: string;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
    }));
  }

  /**
   * 카테고리별 도구 목록 반환
   */
  listByCategory(category: string): Tool[] {
    const names = this.categories.get(category);
    if (!names) return [];

    return Array.from(names)
      .map(name => this.tools.get(name)!)
      .filter(Boolean);
  }

  /**
   * 모든 카테고리 목록 반환
   */
  listCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * 도구 실행
   */
  async execute<TResult = unknown>(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecutionResult<TResult>> {
    const startTime = Date.now();
    const tool = this.get(name);

    if (!tool) {
      return {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${name}" not found`,
        },
        duration: Date.now() - startTime,
      };
    }

    // 권한 확인
    if (tool.requiredPermissions) {
      const missingPermissions = tool.requiredPermissions.filter(
        p => !context.permissions.has(p)
      );
      if (missingPermissions.length > 0) {
        return {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: `Missing permissions: ${missingPermissions.join(', ')}`,
          },
          duration: Date.now() - startTime,
        };
      }
    }

    // 파라미터 검증
    if (tool.validate && !tool.validate(params)) {
      return {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Parameter validation failed',
        },
        duration: Date.now() - startTime,
      };
    }

    try {
      // 타임아웃 처리
      const timeoutMs = context.timeout ?? 30000;
      const result = await Promise.race([
        tool.execute(params, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
        ),
      ]);

      return {
        success: true,
        data: result as TResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: (error as Error).message,
          details: error,
        },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 배치 실행
   */
  async executeBatch(
    calls: Array<{ name: string; params: Record<string, unknown> }>,
    context: ToolContext
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(
      calls.map(call => this.execute(call.name, call.params, context))
    );
  }

  /**
   * Tool Definition 생성 (OpenAI 스타일 Tool Calling)
   * chatCompletion의 params.tools로 전달
   */
  toToolDefinitions(names?: string[]): ToolDefinition[] {
    const toolNames = names ?? Array.from(this.tools.keys());

    return toolNames
      .map(name => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined)
      .map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as Record<string, unknown>,
        },
      }));
  }

  /**
   * Function Calling 스키마 생성 (레거시 호환성)
   * @deprecated toToolDefinitions 사용 권장
   */
  toFunctionCallingSchema(names?: string[]): ToolDefinition[] {
    return this.toToolDefinitions(names);
  }

  /**
   * 레지스트리 초기화
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.aliases.clear();
  }

  /**
   * 등록된 도구 수 반환
   */
  get size(): number {
    return this.tools.size;
  }
}

/**
 * 전역 도구 레지스트리
 */
export const globalToolRegistry = new ToolRegistry();
```

### 3. Tool 데코레이터

**파일 위치:** `packages/agents/src/tools/decorators.ts`

```typescript
import { Tool, ToolParameterSchema, ToolContext } from './types';
import { globalToolRegistry } from './registry';

/**
 * 도구 메타데이터
 */
interface ToolMetadata {
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  category?: string;
  version?: string;
  hasSideEffects?: boolean;
  requiredPermissions?: string[];
}

/**
 * 도구 데코레이터
 * 클래스 메서드를 도구로 변환
 */
export function tool(metadata: ToolMetadata) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    const toolDef: Tool = {
      name: metadata.name,
      description: metadata.description,
      parameters: metadata.parameters ?? {
        type: 'object',
        properties: {},
      },
      category: metadata.category,
      version: metadata.version,
      hasSideEffects: metadata.hasSideEffects ?? true,
      requiredPermissions: metadata.requiredPermissions,
      async execute(params, context) {
        return originalMethod.call(target, params, context);
      },
    };

    // 전역 레지스트리에 등록
    globalToolRegistry.register(toolDef);

    return descriptor;
  };
}

/**
 * 파라미터 스키마 빌더
 */
export class ParameterSchemaBuilder {
  private schema: ToolParameterSchema = {
    type: 'object',
    properties: {},
    required: [],
  };

  string(name: string, description: string, options?: {
    required?: boolean;
    enum?: string[];
    default?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  }): this {
    this.schema.properties[name] = {
      type: 'string',
      description,
      ...options,
    };
    if (options?.required) {
      this.schema.required!.push(name);
    }
    return this;
  }

  number(name: string, description: string, options?: {
    required?: boolean;
    minimum?: number;
    maximum?: number;
    default?: number;
  }): this {
    this.schema.properties[name] = {
      type: 'number',
      description,
      ...options,
    };
    if (options?.required) {
      this.schema.required!.push(name);
    }
    return this;
  }

  boolean(name: string, description: string, options?: {
    required?: boolean;
    default?: boolean;
  }): this {
    this.schema.properties[name] = {
      type: 'boolean',
      description,
      ...options,
    };
    if (options?.required) {
      this.schema.required!.push(name);
    }
    return this;
  }

  array(name: string, description: string, items: PropertySchema, options?: {
    required?: boolean;
  }): this {
    this.schema.properties[name] = {
      type: 'array',
      description,
      items,
    };
    if (options?.required) {
      this.schema.required!.push(name);
    }
    return this;
  }

  object(name: string, description: string, properties: Record<string, PropertySchema>, options?: {
    required?: boolean;
  }): this {
    this.schema.properties[name] = {
      type: 'object',
      description,
      properties,
    };
    if (options?.required) {
      this.schema.required!.push(name);
    }
    return this;
  }

  build(): ToolParameterSchema {
    return this.schema;
  }
}

/**
 * 파라미터 스키마 빌더 생성
 */
export function params(): ParameterSchemaBuilder {
  return new ParameterSchemaBuilder();
}
```

### 4. 도구 실행 핸들러

**파일 위치:** `packages/agents/src/tools/executor.ts`

```typescript
import {
  FunctionCallRequest,
  FunctionCallResponse,
  ToolContext,
  ToolExecutionResult,
} from './types';
import { ToolRegistry } from './registry';

/**
 * 도구 실행 핸들러
 * LLM의 Function Calling 응답을 처리
 */
export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  /**
   * 단일 Function Call 처리
   */
  async handleFunctionCall(
    call: FunctionCallRequest,
    context: ToolContext
  ): Promise<FunctionCallResponse> {
    let params: Record<string, unknown>;

    try {
      params = JSON.parse(call.arguments);
    } catch (e) {
      return {
        id: call.id,
        result: '',
        error: `Invalid JSON arguments: ${(e as Error).message}`,
      };
    }

    const result = await this.registry.execute(call.name, params, context);

    if (result.success) {
      return {
        id: call.id,
        result: JSON.stringify(result.data),
      };
    } else {
      return {
        id: call.id,
        result: '',
        error: result.error?.message ?? 'Unknown error',
      };
    }
  }

  /**
   * 다중 Function Call 처리
   */
  async handleFunctionCalls(
    calls: FunctionCallRequest[],
    context: ToolContext
  ): Promise<FunctionCallResponse[]> {
    return Promise.all(
      calls.map(call => this.handleFunctionCall(call, context))
    );
  }

  /**
   * Function Call 결과를 메시지로 변환
   */
  formatAsMessages(
    responses: FunctionCallResponse[]
  ): Array<{ role: 'tool'; content: string; toolCallId: string }> {
    return responses.map(response => ({
      role: 'tool' as const,
      content: response.error
        ? `Error: ${response.error}`
        : response.result,
      toolCallId: response.id,
    }));
  }
}

/**
 * 도구 실행 체인
 * 도구 호출 시퀀스 관리
 */
export class ToolExecutionChain {
  private steps: Array<{
    toolName: string;
    params: Record<string, unknown> | ((prev: unknown) => Record<string, unknown>);
  }> = [];

  constructor(private executor: ToolExecutor) {}

  /**
   * 도구 호출 추가
   */
  then(
    toolName: string,
    params: Record<string, unknown> | ((prev: unknown) => Record<string, unknown>)
  ): this {
    this.steps.push({ toolName, params });
    return this;
  }

  /**
   * 체인 실행
   */
  async execute(context: ToolContext): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    let prevResult: unknown = undefined;

    for (const step of this.steps) {
      const params = typeof step.params === 'function'
        ? step.params(prevResult)
        : step.params;

      const result = await this.executor.handleFunctionCall(
        {
          id: `chain-${Date.now()}-${results.length}`,
          name: step.toolName,
          arguments: JSON.stringify(params),
        },
        context
      );

      const executionResult: ToolExecutionResult = {
        success: !result.error,
        data: result.error ? undefined : JSON.parse(result.result),
        error: result.error
          ? { code: 'EXECUTION_ERROR', message: result.error }
          : undefined,
        duration: 0,
      };

      results.push(executionResult);

      if (!executionResult.success) {
        break; // 에러 시 체인 중단
      }

      prevResult = executionResult.data;
    }

    return results;
  }
}
```

### 5. 내장 도구 구현

**파일 위치:** `packages/agents/src/tools/builtin/index.ts`

```typescript
import { Tool, ToolContext } from '../types';
import { params } from '../decorators';

/**
 * 현재 시간 조회 도구
 */
export const getCurrentTimeTool: Tool<{}, string> = {
  name: 'get_current_time',
  description: 'Get the current date and time in ISO format',
  parameters: {
    type: 'object',
    properties: {},
  },
  category: 'utility',
  hasSideEffects: false,
  async execute() {
    return new Date().toISOString();
  },
};

/**
 * 계산기 도구
 */
export const calculatorTool: Tool<{ expression: string }, number> = {
  name: 'calculator',
  description: 'Evaluate a mathematical expression',
  parameters: params()
    .string('expression', 'Mathematical expression to evaluate', { required: true })
    .build(),
  category: 'utility',
  hasSideEffects: false,
  async execute(params) {
    // 안전한 수학 표현식 평가 (mathjs 사용)
    try {
      // mathjs import 필요: import { evaluate } from 'mathjs';
      // @ts-ignore - mathjs는 실제 구현에서 별도 의존성으로 추가됨
      const { evaluate } = await import('mathjs');
      return evaluate(params.expression);
    } catch (e) {
      throw new Error(`Invalid expression: ${(e as Error).message}`);
    }
  },
};

/**
 * JSON 파싱 도구
 */
export const parseJsonTool: Tool<{ json: string }, unknown> = {
  name: 'parse_json',
  description: 'Parse a JSON string into an object',
  parameters: params()
    .string('json', 'JSON string to parse', { required: true })
    .build(),
  category: 'utility',
  hasSideEffects: false,
  async execute(params) {
    return JSON.parse(params.json);
  },
};

/**
 * 텍스트 검색 도구
 */
export const searchTextTool: Tool<{
  text: string;
  query: string;
  caseSensitive?: boolean;
}, { found: boolean; matches: string[] }> = {
  name: 'search_text',
  description: 'Search for a query string within text',
  parameters: params()
    .string('text', 'Text to search in', { required: true })
    .string('query', 'Query string to find', { required: true })
    .boolean('caseSensitive', 'Whether to perform case-sensitive search', {
      default: false,
    })
    .build(),
  category: 'text',
  hasSideEffects: false,
  async execute(params) {
    const text = params.caseSensitive
      ? params.text
      : params.text.toLowerCase();
    const query = params.caseSensitive
      ? params.query
      : params.query.toLowerCase();

    const matches: string[] = [];
    let index = text.indexOf(query);

    while (index !== -1) {
      matches.push(params.text.substring(index, index + params.query.length));
      index = text.indexOf(query, index + 1);
    }

    return {
      found: matches.length > 0,
      matches,
    };
  },
};

/**
 * HTTP 요청 도구
 */
export const httpRequestTool: Tool<{
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}, { status: number; headers: Record<string, string>; body: string }> = {
  name: 'http_request',
  description: 'Make an HTTP request to a URL',
  parameters: params()
    .string('url', 'URL to request', { required: true })
    .string('method', 'HTTP method', {
      enum: ['GET', 'POST', 'PUT', 'DELETE'],
      default: 'GET',
    })
    .object('headers', 'Request headers', {})
    .string('body', 'Request body')
    .build(),
  category: 'network',
  hasSideEffects: true,
  requiredPermissions: ['network'],
  async execute(params, context) {
    const controller = new AbortController();
    const timeout = context.timeout ?? 30000;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(params.url, {
        method: params.method ?? 'GET',
        headers: params.headers,
        body: params.body,
        signal: controller.signal,
      });

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const body = await response.text();

      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

/**
 * 랜덤 생성 도구
 */
export const randomGeneratorTool: Tool<{
  type: 'number' | 'string' | 'uuid';
  min?: number;
  max?: number;
  length?: number;
}, string | number> = {
  name: 'random_generator',
  description: 'Generate random values (numbers, strings, or UUIDs)',
  parameters: params()
    .string('type', 'Type of random value to generate', {
      required: true,
      enum: ['number', 'string', 'uuid'],
    })
    .number('min', 'Minimum value for numbers', { default: 0 })
    .number('max', 'Maximum value for numbers', { default: 100 })
    .number('length', 'Length for string generation', { default: 10 })
    .build(),
  category: 'utility',
  hasSideEffects: false,
  async execute(params) {
    switch (params.type) {
      case 'number':
        const min = params.min ?? 0;
        const max = params.max ?? 100;
        return Math.floor(Math.random() * (max - min + 1)) + min;

      case 'string':
        const length = params.length ?? 10;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length }, () =>
          chars.charAt(Math.floor(Math.random() * chars.length))
        ).join('');

      case 'uuid':
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });

      default:
        throw new Error(`Unknown type: ${params.type}`);
    }
  },
};

/**
 * 내장 도구 목록
 */
export const builtinTools: Tool[] = [
  getCurrentTimeTool,
  calculatorTool,
  parseJsonTool,
  searchTextTool,
  httpRequestTool,
  randomGeneratorTool,
];

/**
 * 내장 도구 등록
 */
export function registerBuiltinTools(registry: ToolRegistry): void {
  for (const tool of builtinTools) {
    registry.register(tool);
  }
}
```

### 6. 내보내기 설정

**파일 위치:** `packages/agents/src/tools/index.ts`

```typescript
export * from './types';
export * from './registry';
export * from './decorators';
export * from './executor';
export * from './builtin';

export { globalToolRegistry as registry } from './registry';
```

## 완료 조건
- [ ] Tool 인터페이스 정의 완료
- [ ] ToolRegistry 클래스 구현 완료
- [ ] 도구 데코레이터 구현 완료
- [ ] ToolExecutor 구현 완료
- [ ] 내장 도구 5개 이상 구현 완료
- [ ] 단위 테스트 작성

## 의존성
- TASK-031 (Agent Roles)
- TASK-030 (LLM Adapter - Function Calling 지원)

## 사용 예시

### 도구 등록 및 실행
```typescript
import { ToolRegistry, registerBuiltinTools } from '@obora-kit/agents';

const registry = new ToolRegistry();
registerBuiltinTools(registry);

// 커스텀 도구 등록
registry.register({
  name: 'greet',
  description: 'Generate a greeting message',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name to greet',
      },
    },
    required: ['name'],
  },
  async execute(params) {
    return `Hello, ${params.name}!`;
  },
});

// 도구 실행
const result = await registry.execute(
  'greet',
  { name: 'Alice' },
  {
    sessionId: 'session-123',
    agentId: 'agent-1',
    permissions: new Set(['*']),
  }
);

console.log(result.data); // "Hello, Alice!"
```

### Tool Definition 생성 (OpenAI 스타일 Tool Calling)
```typescript
const tools = registry.toToolDefinitions(['calculator', 'get_current_time']);
// LLM chatCompletion의 params.tools로 전달

const llmResult = await llm.chatCompletion({
  messages: [{ role: 'user', content: 'What is 15 * 7?' }],
  tools: tools,
  toolChoice: 'auto',
});
```

### LLM Function Call 처리
```typescript
import { ToolExecutor } from '@obora-kit/agents';

const executor = new ToolExecutor(registry);

// LLM 응답에서 도구 호출 처리
if (llmResult.message.toolCalls) {
  const responses = await executor.handleFunctionCalls(
    llmResult.message.toolCalls,
    context
  );

  // 결과를 메시지로 변환하여 다시 LLM에 전달
  const toolMessages = executor.formatAsMessages(responses);
  messages.push(...toolMessages);

  // 최종 응답 요청
  const finalResult = await llm.chatCompletion({ messages });
}
```

### 도구 실행 체인
```typescript
import { ToolExecutionChain, ToolExecutor } from '@obora-kit/agents';

const executor = new ToolExecutor(registry);
const chain = new ToolExecutionChain(executor);

const results = await chain
  .then('get_current_time', {})
  .then('calculator', (prev) => ({
    expression: `2 * 12`, // 이전 결과를 사용할 수 있음
  }))
  .execute(context);
```

### 데코레이터로 도구 정의
```typescript
import { tool, params } from '@obora-kit/agents';

class MyTools {
  @tool({
    name: 'format_date',
    description: 'Format a date string',
    parameters: params()
      .string('date', 'Date string to format', { required: true })
      .string('format', 'Output format', { default: 'YYYY-MM-DD' })
      .build(),
    category: 'utility',
    hasSideEffects: false,
  })
  async formatDate(params: { date: string; format: string }) {
    // 날짜 포맷팅 로직
    return new Date(params.date).toISOString();
  }
}
```

## 엣지 케이스
1. 잘못된 JSON 인자 처리
2. 도구 실행 타임아웃 처리
3. 권한 없는 도구 호출 차단
4. 순환 도구 호출 탐지
5. 도구 중복 등록 방지
6. 존재하지 않는 도구 호출 처리
7. 체인 실행 중 에러 시 롤백 처리

## 참고 자료
- [OpenAI Function Calling 문서](https://platform.openai.com/docs/guides/function-calling)
- TASK-030: Pi Mono LLM Adapter 구현
- TASK-031: 역할별 에이전트 구현

---

*작성일: 2026-02-04*
*버전: 1.0.0*
