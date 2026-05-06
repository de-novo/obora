import { describe, expect, it, vi, beforeEach } from "vitest";

import type {
  ChatCompletionChunk,
  ChatCompletionResult,
  LLMAdapter,
} from "../../llm/adapter";
import { listPiAIModels, listPiAIProviders, PiAIAdapter } from "../../llm/pi-ai-adapter";
import { RetryExhaustedError, withRetry } from "../../llm/retry-handler";

type PiAIContent =
  | { type: "text"; text: string }
  | {
      type: "toolCall";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    };

type AssistantLike = {
  role: "assistant";
  content: PiAIContent[];
  api: string;
  provider: string;
  model: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
  stopReason: "stop" | "length" | "toolUse" | "aborted" | "error";
  timestamp: number;
  errorMessage?: string;
};

type ModelLike = {
  id: string;
  provider: string;
  api: string;
  baseUrl: string;
};

type ContextLike = {
  systemPrompt?: string;
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
};

type OptionsLike = {
  apiKey: string;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
};

type CompleteCall = [ModelLike, ContextLike, OptionsLike];

type StreamEvent =
  | { type: "text_delta"; delta: string }
  | {
      type: "toolcall_end";
      toolCall: {
        id: string;
        name: string;
        arguments?: Record<string, unknown>;
      };
    };

const piAiMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  getModel: vi.fn(),
  getModels: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  complete: piAiMocks.complete,
  getModel: piAiMocks.getModel,
  getModels: piAiMocks.getModels,
  stream: piAiMocks.stream,
}));

function assistant(overrides: Partial<AssistantLike> = {}): AssistantLike {
  return {
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    api: "openai-completions",
    provider: "openai",
    model: "gpt-4o-mini",
    usage: {
      input: 11,
      output: 7,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 18,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 123,
    ...overrides,
  };
}

function successfulResult(content = "ok"): ChatCompletionResult {
  return {
    id: "ok",
    model: "test-model",
    message: { role: "assistant", content },
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    finishReason: "stop",
  };
}

function createStream(events: StreamEvent[], finalResponse: AssistantLike) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    result: vi.fn(async () => finalResponse),
  };
}

describe("provider adapter conformance", () => {
  beforeEach(() => {
    piAiMocks.complete.mockReset();
    piAiMocks.getModel.mockReset();
    piAiMocks.getModels.mockReset();
    piAiMocks.stream.mockReset();

    piAiMocks.getModel.mockImplementation((provider: string, modelId: string): ModelLike => ({
      id: modelId,
      provider,
      api: "openai-completions",
      baseUrl: "https://provider.test/v1",
    }));
    piAiMocks.getModels.mockImplementation((provider: string): ModelLike[] => [
      {
        id: "gpt-4o-mini",
        provider,
        api: "openai-completions",
        baseUrl: "https://provider.test/v1",
      },
    ]);
  });

  it("normalizes provider text, tool-call, usage, and context contracts", async () => {
    const abort = new AbortController();
    piAiMocks.complete.mockResolvedValueOnce(
      assistant({
        content: [
          { type: "text", text: "Plan accepted. " },
          {
            type: "toolCall",
            id: "provider-call-1",
            name: "deploy",
            arguments: { environment: "staging" },
          },
        ],
        stopReason: "toolUse",
      })
    );

    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
      baseUrl: "https://override.test/v1",
    });

    const result = await adapter.chatCompletion(
      {
        messages: [
          { role: "system", content: "You are a release assistant." },
          { role: "system", content: "Return compact answers." },
          { role: "user", content: "Deploy the build" },
          {
            role: "assistant",
            content: "I need a tool.",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "deploy", arguments: "{\"environment\":\"staging\"}" },
              },
              {
                id: "call-2",
                type: "function",
                function: { name: "audit", arguments: "not-json" },
              },
            ],
          },
          { role: "tool", toolCallId: "call-1", content: "deployed" },
          { role: "tool", toolCallId: "missing-call", content: "fallback name" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "deploy",
              description: "Deploy a build",
              parameters: {
                type: "object",
                properties: { environment: { type: "string" } },
                required: ["environment"],
              },
            },
          },
        ],
        temperature: 0.3,
        maxTokens: 256,
      },
      { signal: abort.signal }
    );

    expect(result).toMatchObject({
      id: "openai-gpt-4o-mini-123",
      model: "gpt-4o-mini",
      message: {
        role: "assistant",
        content: "Plan accepted. ",
        toolCalls: [
          {
            id: "provider-call-1",
            type: "function",
            function: {
              name: "deploy",
              arguments: JSON.stringify({ environment: "staging" }),
            },
          },
        ],
      },
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      },
      finishReason: "tool_calls",
    });

    const [model, context, options] = piAiMocks.complete.mock.calls[0] as CompleteCall;
    expect(model.baseUrl).toBe("https://override.test/v1");
    expect(context.systemPrompt).toBe(
      "You are a release assistant.\n\nReturn compact answers."
    );
    expect(context.tools).toEqual([
      {
        name: "deploy",
        description: "Deploy a build",
        parameters: {
          type: "object",
          properties: { environment: { type: "string" } },
          required: ["environment"],
        },
      },
    ]);
    expect(context.messages[1]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: expect.arrayContaining([
          { type: "text", text: "I need a tool." },
          {
            type: "toolCall",
            id: "call-1",
            name: "deploy",
            arguments: { environment: "staging" },
          },
          {
            type: "toolCall",
            id: "call-2",
            name: "audit",
            arguments: { raw: "not-json" },
          },
        ]),
      })
    );
    expect(context.messages[2]).toEqual(
      expect.objectContaining({
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "deploy",
        content: [{ type: "text", text: "deployed" }],
      })
    );
    expect(context.messages[3]).toEqual(
      expect.objectContaining({
        role: "toolResult",
        toolCallId: "missing-call",
        toolName: "tool",
      })
    );
    expect(options).toMatchObject({
      apiKey: "test-key",
      signal: abort.signal,
      temperature: 0.3,
      maxTokens: 256,
    });
  });

  it("exposes provider capabilities, catalog listings, and fallback context values", async () => {
    piAiMocks.getModels.mockImplementation((provider: string): ModelLike[] => {
      if (provider === "openai") {
        return [
          {
            id: "gpt-4o-mini",
            provider,
            api: "openai-completions",
            baseUrl: "https://provider.test/v1",
          },
        ];
      }

      if (provider === "anthropic") {
        throw new Error("catalog unavailable");
      }

      return [];
    });
    piAiMocks.complete.mockResolvedValueOnce(
      assistant({
        content: [
          {
            type: "toolCall",
            id: "provider-call-empty",
            name: "lookup",
            arguments: {},
          },
        ],
      })
    );

    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      adapterId: "pi-openai",
    });

    expect(adapter.id).toBe("pi-openai");
    expect(adapter.supports("streaming")).toBe(true);
    expect(adapter.supports("function-calling")).toBe(true);
    expect(adapter.supports("json-mode")).toBe(false);
    expect(listPiAIProviders()).toEqual(["openai"]);
    expect(listPiAIModels("openai")).toEqual(["gpt-4o-mini"]);

    const result = await adapter.chatCompletion({
      model: "gpt-4o-mini",
      messages: [
        { role: "assistant", content: "" },
        { role: "tool", content: "tool output" },
      ],
    });

    expect(result.message).toEqual({
      role: "assistant",
      content: null,
      toolCalls: [
        {
          id: "provider-call-empty",
          type: "function",
          function: {
            name: "lookup",
            arguments: "{}",
          },
        },
      ],
    });

    const [model, context, options] = piAiMocks.complete.mock.calls[0] as CompleteCall;
    expect(model.baseUrl).toBe("https://provider.test/v1");
    expect(options.signal).toBeUndefined();
    expect(options.temperature).toBeUndefined();
    expect(options.maxTokens).toBeUndefined();
    expect(context.systemPrompt).toBeUndefined();
    expect(context.tools).toBeUndefined();
    expect(context.messages[0]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: [],
        model: "unknown",
      })
    );
    expect(context.messages[1]).toEqual(
      expect.objectContaining({
        role: "toolResult",
        toolCallId: expect.stringMatching(/^tool-\d+$/),
        toolName: "tool",
      })
    );
  });

  it.each([
    ["stop", "stop"],
    ["length", "length"],
    ["aborted", "error"],
  ] as const)("maps provider stop reason %s to %s", async (providerReason, expected) => {
    piAiMocks.complete.mockResolvedValueOnce(assistant({ stopReason: providerReason }));
    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const result = await adapter.chatCompletion({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.finishReason).toBe(expected);
  });

  it("emits streaming text and tool-call chunks before returning the final result", async () => {
    piAiMocks.stream.mockReturnValueOnce(
      createStream(
        [
          { type: "text_delta", delta: "hel" },
          {
            type: "toolcall_end",
            toolCall: {
              id: "stream-call",
              name: "lookup",
              arguments: { q: "coverage" },
            },
          },
          { type: "text_delta", delta: "lo" },
        ],
        assistant({
          content: [
            { type: "text", text: "hello" },
            {
              type: "toolCall",
              id: "stream-call",
              name: "lookup",
              arguments: { q: "coverage" },
            },
          ],
          stopReason: "toolUse",
        })
      )
    );

    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });
    const chunks: ChatCompletionChunk[] = [];

    const result = await adapter.streamChatCompletion(
      { messages: [{ role: "user", content: "stream" }] },
      (chunk) => chunks.push(chunk)
    );

    expect(chunks.map((chunk) => chunk.delta.content ?? "").join("")).toBe("hello");
    expect(chunks.find((chunk) => chunk.delta.toolCalls)?.delta.toolCalls).toEqual([
      {
        id: "stream-call",
        type: "function",
        function: {
          name: "lookup",
          arguments: JSON.stringify({ q: "coverage" }),
        },
      },
    ]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.message.toolCalls?.[0]?.function.name).toBe("lookup");
  });

  it("streams tool calls without provider arguments as empty argument objects", async () => {
    piAiMocks.stream.mockReturnValueOnce(
      createStream(
        [
          {
            type: "toolcall_end",
            toolCall: {
              id: "stream-empty-args",
              name: "inspect",
            },
          },
        ],
        assistant({
          content: [
            {
              type: "toolCall",
              id: "stream-empty-args",
              name: "inspect",
              arguments: {},
            },
          ],
          stopReason: "toolUse",
        })
      )
    );

    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });
    const chunks: ChatCompletionChunk[] = [];

    const result = await adapter.streamChatCompletion(
      { messages: [{ role: "user", content: "stream" }] },
      (chunk) => chunks.push(chunk)
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.delta.toolCalls?.[0]?.function.arguments).toBe("{}");
    expect(result.message.content).toBeNull();
    expect(result.message.toolCalls?.[0]?.function.arguments).toBe("{}");
  });

  it("maps provider error stop reasons to thrown errors", async () => {
    piAiMocks.complete.mockResolvedValueOnce(
      assistant({ stopReason: "error", errorMessage: "provider auth rejected" })
    );
    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    await expect(
      adapter.chatCompletion({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow("provider auth rejected");

    piAiMocks.stream.mockReturnValueOnce(
      createStream([], assistant({ stopReason: "error", errorMessage: "stream failed" }))
    );
    await expect(
      adapter.streamChatCompletion({ messages: [{ role: "user", content: "hello" }] }, () => {})
    ).rejects.toThrow("stream failed");
  });

  it("uses provider error fallback messages when error details are omitted", async () => {
    piAiMocks.complete.mockResolvedValueOnce(assistant({ stopReason: "error" }));
    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    await expect(
      adapter.chatCompletion({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow("pi-ai returned error stopReason for model gpt-4o-mini");

    piAiMocks.stream.mockReturnValueOnce(createStream([], assistant({ stopReason: "error" })));
    await expect(
      adapter.streamChatCompletion({ messages: [{ role: "user", content: "hello" }] }, () => {})
    ).rejects.toThrow("pi-ai returned error stopReason for model gpt-4o-mini");
  });

  it("lists available models in unsupported model errors", async () => {
    piAiMocks.getModel.mockImplementationOnce(() => {
      throw new Error("catalog miss");
    });
    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "missing-model",
    });

    await expect(
      adapter.chatCompletion({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow("available=gpt-4o-mini");
  });

  it("reports unsupported model refs when the catalog returns no model object", async () => {
    piAiMocks.getModel.mockReturnValueOnce(undefined);
    const adapter = new PiAIAdapter({
      provider: "openai",
      apiKey: "test-key",
      model: "missing-model",
    });

    await expect(
      adapter.chatCompletion({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow("[MODEL_1002] Unsupported model ref: missing-model");
  });
});

describe("retry conformance", () => {
  it("retries streaming calls with the same public adapter contract", async () => {
    let attempts = 0;
    const flakyAdapter: LLMAdapter = {
      id: "flaky",
      supports: () => true,
      chatCompletion: async () => successfulResult(),
      streamChatCompletion: async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("timeout");
          (error as Error & { statusCode: number }).statusCode = 503;
          throw error;
        }
        return successfulResult("stream ok");
      },
    };

    const adapter = withRetry(flakyAdapter, { maxRetries: 2, baseDelay: 0, maxDelay: 0 });
    const result = await adapter.streamChatCompletion(
      { messages: [{ role: "user", content: "retry" }] },
      () => {}
    );

    expect(result.message.content).toBe("stream ok");
    expect(attempts).toBe(3);
    expect(adapter.id).toBe("flaky");
    expect(adapter.supports("streaming")).toBe(true);
  });

  it("raises RetryExhaustedError with attempts and last error metadata", async () => {
    const failingAdapter: LLMAdapter = {
      id: "failing",
      supports: () => true,
      chatCompletion: async () => {
        throw new Error("rate limit");
      },
      streamChatCompletion: async () => successfulResult(),
    };

    const adapter = withRetry(failingAdapter, { maxRetries: 1, baseDelay: 0, maxDelay: 0 });

    await expect(
      adapter.chatCompletion({ messages: [{ role: "user", content: "retry" }] })
    ).rejects.toMatchObject({
      name: "RetryExhaustedError",
      attempts: 2,
      lastError: expect.objectContaining({
        message: "rate limit",
      }),
    } satisfies Partial<RetryExhaustedError>);
  });
});
