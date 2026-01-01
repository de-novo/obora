#!/usr/bin/env bun
/**
 * 강한 토론 모드 단일 테스트
 * 반박 라운드가 제대로 동작하는지 확인
 */

import { runAI, runOrchestrator } from "./lib/runner";
import type { AIName } from "./lib/types";

// 테스트 질문 (논쟁적인 것으로 선택)
const TEST_QUESTION = `
B2B SaaS 스타트업 (시리즈 A, 개발자 5명)입니다.
현재 모놀리식 Node.js 백엔드를 운영 중인데, 마이크로서비스로 전환해야 할까요?
고객사 10개, MAU 5,000명, 월 매출 3,000만원입니다.
`;

async function runStrongDebate(question: string, participants: AIName[]) {
  const rounds: { ai: AIName; content: string; phase: string }[] = [];
  const history: { role: string; content: string }[] = [{ role: "user", content: question }];

  // Phase 1: 초기 입장
  console.log("\n━━━ Phase 1: 초기 입장 ━━━");
  for (const ai of participants) {
    const prompt = `주제: ${question}

당신은 이 주제에 대해 전문가로서 명확한 입장을 제시해야 합니다.
- 구체적인 선택/권장안을 제시하세요
- 그 선택의 근거를 명확히 설명하세요
- 잠재적 리스크도 언급하세요`;

    console.log(`\n[${ai}] 발언 중...`);
    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "initial" });
    history.push({ role: ai, content: response.content });

    // 요약 출력 (처음 200자)
    console.log(`[${ai}] ${response.content.slice(0, 200)}...`);
  }

  // Phase 2: 반박 라운드
  console.log("\n━━━ Phase 2: 반박 라운드 ━━━");
  for (const ai of participants) {
    const othersOpinions = history
      .filter(h => h.role !== "user" && h.role !== ai)
      .map(h => `[${h.role}] ${h.content}`)
      .join("\n\n---\n\n");

    const prompt = `주제: ${question}

다른 전문가들의 의견:
${othersOpinions}

당신의 역할: 비판적 검토자
위 의견들에서 문제점, 놓친 부분, 과소평가된 리스크를 지적하세요.
- 동의하더라도 약점을 찾아 비판하세요
- "좋은 지적이지만..." 같은 동조는 피하세요
- 구체적인 반례나 실패 시나리오를 제시하세요
- 해당 접근법이 실패할 수 있는 조건을 명시하세요`;

    console.log(`\n[${ai}] 반박 중...`);
    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "rebuttal" });
    history.push({ role: `${ai}(반박)`, content: response.content });

    console.log(`[${ai} 반박] ${response.content.slice(0, 200)}...`);
  }

  // Phase 3: 수정된 입장
  console.log("\n━━━ Phase 3: 수정된 입장 ━━━");
  for (const ai of participants) {
    const allHistory = history
      .filter(h => h.role !== "user")
      .map(h => `[${h.role}] ${h.content}`)
      .join("\n\n---\n\n");

    const prompt = `주제: ${question}

지금까지의 토론:
${allHistory}

다른 전문가들의 반박을 고려하여:
1. 당신의 초기 입장에서 수정할 부분이 있다면 수정하세요
2. 여전히 유지하는 입장이 있다면 더 강한 근거로 방어하세요
3. 최종 권장안을 제시하세요`;

    console.log(`\n[${ai}] 최종 입장...`);
    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "revised" });
    history.push({ role: `${ai}(최종)`, content: response.content });

    console.log(`[${ai} 최종] ${response.content.slice(0, 200)}...`);
  }

  // Phase 4: Orchestrator 합의
  console.log("\n━━━ Phase 4: 합의 도출 ━━━");
  const historyStr = history.map(m => `[${m.role}] ${m.content}`).join("\n\n---\n\n");
  const orchestratorPrompt = `토론 진행자입니다. 격렬한 토론이 끝났습니다.

전체 토론 기록:
${historyStr}

다음을 정리해주세요:
1. 합의된 부분 (모든 전문가가 동의한 점)
2. 해소되지 않은 이견 (여전히 의견이 다른 부분과 각 입장)
3. 최종 권장사항 (이견을 고려한 현실적 접근법)
4. 주의사항 (반박에서 제기된 리스크 중 반드시 고려할 것)`;

  const action = await runOrchestrator(orchestratorPrompt);

  return { rounds, conclusion: action.conclusion || "토론 완료" };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           🔥 강한 토론 테스트 (반박 라운드 포함)               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("\n📋 테스트 질문:");
  console.log(TEST_QUESTION);

  const startTime = Date.now();
  // Gemini API 에러로 임시 제외
  const participants: AIName[] = ["claude", "codex"];

  try {
    const result = await runStrongDebate(TEST_QUESTION, participants);
    const elapsed = (Date.now() - startTime) / 1000;

    console.log("\n\n");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║                       📊 토론 결과                            ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");

    // 단계별 발언 수
    const phases = {
      initial: result.rounds.filter(r => r.phase === "initial"),
      rebuttal: result.rounds.filter(r => r.phase === "rebuttal"),
      revised: result.rounds.filter(r => r.phase === "revised"),
    };

    console.log(`\n⏱️  총 소요 시간: ${elapsed.toFixed(1)}초`);
    console.log(`📝 총 발언 수: ${result.rounds.length}회`);
    console.log(`   - 초기 입장: ${phases.initial.length}회`);
    console.log(`   - 반박: ${phases.rebuttal.length}회`);
    console.log(`   - 수정된 입장: ${phases.revised.length}회`);

    console.log("\n━━━ 최종 결론 ━━━");
    console.log(result.conclusion);

    // 결과 저장
    const outputPath = `.dev/test-strong-debate-result.json`;
    await Bun.write(outputPath, JSON.stringify({
      question: TEST_QUESTION,
      rounds: result.rounds,
      conclusion: result.conclusion,
      elapsedSeconds: elapsed,
      timestamp: new Date().toISOString(),
    }, null, 2));
    console.log(`\n💾 결과 저장: ${outputPath}`);

  } catch (error) {
    console.error("❌ 오류 발생:", error);
  }
}

main();
