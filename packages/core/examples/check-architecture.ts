import { AnthropicAdapter } from '../src/llm/adapters/anthropic'
import { OpenAIAdapter } from '../src/llm/adapters/openai'
import { createDebatePattern } from '../src/patterns'
import { createNoopContext } from '../src/runtime'

const TOPIC = `
Obora 프로젝트의 새로운 아키텍처를 평가해주세요:

## 현재 구조
\`\`\`
packages/core/src/
├── llm/
│   ├── types.ts          # ChatModel, RunEvent, RunHandle
│   └── adapters/         # AnthropicAdapter, OpenAIAdapter, GoogleAdapter
├── runtime/
│   ├── types.ts          # Runnable<I,O>, RunContext
│   ├── context.ts        # createRunContext()
│   └── executor.ts       # AgentExecutor
├── patterns/
│   ├── types.ts          # Pattern<I,O>, PatternRunHandle, PatternEvent
│   ├── cross-check.ts    # CrossCheckPattern
│   ├── ensemble.ts       # EnsemblePattern
│   ├── sequential.ts     # SequentialPattern
│   ├── parallel.ts       # ParallelPattern
│   └── debate.ts         # DebatePattern (NEW)
├── skills/
│   ├── loader.ts         # SkillLoader
│   └── types.ts          # Skill, SkillFrontmatter
├── engine/
│   ├── DebateEngine.ts   # Legacy (847 lines)
│   └── types.ts          # Re-exports from patterns/debate
└── providers/            # ClaudeProvider, OpenAIProvider, GeminiProvider
\`\`\`

## 주요 변경
1. DebatePattern: Pattern<DebateInput, DebateResult> 인터페이스 구현
2. ChatModel 기반 LLM 호출 (Provider 대신)
3. PatternRunHandle로 스트리밍 통합
4. Skill loading 지원
5. engine/types.ts가 patterns/debate.ts를 re-export

## 질문
1. 이 구조가 확장 가능한가?
2. 레거시 DebateEngine을 제거해도 되는가?
3. 개선할 점이 있는가?
`

async function main() {
  const claude = new AnthropicAdapter()
  const openai = new OpenAIAdapter()

  const pattern = createDebatePattern({
    participants: [
      { id: 'claude', name: 'Claude', model: claude },
      { id: 'openai', name: 'OpenAI', model: openai },
    ],
    orchestrator: { id: 'judge', name: 'Judge', model: claude },
    mode: 'strong',
  })

  console.log('🚀 Starting architecture review debate...\n')
  const startTime = Date.now()

  const ctx = createNoopContext()
  const handle = pattern.run(ctx, { topic: TOPIC })

  for await (const event of handle.events()) {
    if (event.type === 'phase_start') {
      const phase = (event as any).phase?.toUpperCase()
      console.log(`\n${'═'.repeat(60)}`)
      console.log(`📍 Phase: ${phase}`)
      console.log('═'.repeat(60))
    }
    if (event.type === 'agent_start') {
      const name = (event as any).agentName
      console.log(`\n[${name}]`)
    }
    if (event.type === 'token') {
      process.stdout.write((event as any).text || '')
    }
  }

  const result = await handle.result()
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`\n\n${'═'.repeat(60)}`)
  console.log('📊 DEBATE RESULTS')
  console.log('═'.repeat(60))
  console.log(`⏱️  Duration: ${elapsed}s`)
  console.log(`📝 Rounds: ${result.rounds.length}`)
  console.log(`🔄 Position Changes: ${result.positionChanges.length}`)
  console.log(`❓ Unresolved: ${result.unresolvedDisagreements.length}`)

  if (result.positionChanges.length > 0) {
    console.log('\n🔄 Position Changes:')
    for (const change of result.positionChanges) {
      console.log(`   - ${change.participant}: ${change.reason}`)
    }
  }
}

main().catch(console.error)
