import { LLMAdapter, ChatCompletionParams, ChatCompletionResult, ChatCompletionChunk } from "./adapter";
export declare class MockLLMAdapter implements LLMAdapter {
    private readonly responses;
    readonly id = "mock-llm";
    constructor(responses?: Record<string, string | ((params: ChatCompletionParams) => string)>);
    supports(_feature: "streaming" | "function-calling" | "json-mode"): boolean;
    chatCompletion(params: ChatCompletionParams, _options?: {
        signal?: AbortSignal;
    }): Promise<ChatCompletionResult>;
    streamChatCompletion(params: ChatCompletionParams, onChunk: (chunk: ChatCompletionChunk) => void): Promise<ChatCompletionResult>;
    setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void;
    clearResponses(): void;
}
