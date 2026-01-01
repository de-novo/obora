#!/usr/bin/env bun
/**
 * Test: Verify AI SDK integration works
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... bun packages/core/examples/test-ai-sdk.ts
 */

import { ClaudeProvider, OpenAIProvider, GeminiProvider } from '../src';

async function testProvider(name: string, provider: any) {
  console.log(`\n━━━ Testing ${name} ━━━`);

  // Test availability
  const available = await provider.isAvailable();
  console.log(`Available: ${available ? '✅' : '❌'}`);

  if (!available) {
    console.log('Skipping (not available)');
    return;
  }

  // Test streaming
  console.log('\nStreaming test:');
  try {
    let output = '';
    for await (const { chunk, done } of provider.stream('Say "Hello, AI SDK!" in 5 words or less.')) {
      if (!done && chunk) {
        process.stdout.write(chunk);
        output += chunk;
      }
    }
    console.log('\n✅ Streaming works!');
  } catch (error) {
    console.log(`❌ Streaming error: ${error}`);
  }

  // Test regular execution
  console.log('\nRegular execution test:');
  try {
    const result = await provider.run('What is 2+2? Answer with just the number.');
    console.log(`Response: ${result.content.trim()}`);
    console.log('✅ Execution works!');
  } catch (error) {
    console.log(`❌ Execution error: ${error}`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              🧪 AI SDK Integration Test                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Test Claude (needs ANTHROPIC_API_KEY)
  if (process.env.ANTHROPIC_API_KEY) {
    await testProvider('Claude (API)', new ClaudeProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
    }));
  } else {
    console.log('\n⚠️  ANTHROPIC_API_KEY not set, skipping Claude API test');
  }

  // Test OpenAI (needs OPENAI_API_KEY)
  if (process.env.OPENAI_API_KEY) {
    await testProvider('OpenAI (API)', new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
    }));
  } else {
    console.log('\n⚠️  OPENAI_API_KEY not set, skipping OpenAI API test');
  }

  // Test Gemini (needs GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (googleKey) {
    await testProvider('Gemini (API)', new GeminiProvider({
      apiKey: googleKey,
    }));
  } else {
    console.log('\n⚠️  GOOGLE_API_KEY not set, skipping Gemini API test');
  }

  console.log('\n\n✅ Test complete!');
}

main().catch(console.error);
