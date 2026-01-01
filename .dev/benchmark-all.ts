#!/usr/bin/env bun
/**
 * 전체 벤치마크 병렬 실행
 * 20개 케이스 × 3개 모드 (단일, 병렬, 토론)
 */

import { runAI, runAllParallel, runOrchestrator } from "./lib/runner";
import type { AIName, AIResponse, DebateState, OrchestratorAction } from "./lib/types";
import { BENCHMARK_CASES_V2 } from "./benchmark-cases";
import { DECISION_BENCHMARK_CASES } from "./benchmark-cases-decision";

// 모든 케이스 통합
const ALL_CASES = [
  ...BENCHMARK_CASES_V2.map(c => ({ ...c, type: "tech" as const })),
  ...DECISION_BENCHMARK_CASES.map(c => ({ ...c, type: "decision" as const })),
];

interface BenchmarkResult {
  caseId: string;
  caseName: string;
  caseType: "tech" | "decision";
  category: string;
  controversyLevel: string;
  singleAI: {
    response: string;
    timeMs: number;
  };
  multiParallel: {
    responses: { ai: string; content: string }[];
    timeMs: number;
  };
  multiDebate: {
    rounds: { ai: string; content: string; phase: string }[];
    conclusion: string;
    timeMs: number;
  };
  analysis: {
    singleLength: number;
    parallelLength: number;
    debateLength: number;
    debateRounds: number;
  };
}

// 강한 토론 실행 (반박 라운드 포함)
async function runStrongDebate(
  question: string,
  participants: AIName[]
): Promise<{ rounds: { ai: AIName; content: string; phase: string }[]; conclusion: string }> {
  const rounds: { ai: AIName; content: string; phase: string }[] = [];
  const history: { role: string; content: string }[] = [{ role: "user", content: question }];

  // Phase 1: 초기 입장 - 각 AI가 자신의 의견 제시
  console.log("      [Phase 1] 초기 입장...");
  for (const ai of participants) {
    const prompt = `주제: ${question}

당신은 이 주제에 대해 전문가로서 명확한 입장을 제시해야 합니다.
- 구체적인 선택/권장안을 제시하세요
- 그 선택의 근거를 명확히 설명하세요
- 잠재적 리스크도 언급하세요`;

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "initial" });
    history.push({ role: ai, content: response.content });
  }

  // Phase 2: 반박 라운드 - 이전 발언들의 문제점 지적
  console.log("      [Phase 2] 반박 라운드...");
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

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "rebuttal" });
    history.push({ role: `${ai}(반박)`, content: response.content });
  }

  // Phase 3: 수정된 입장 - 반박을 고려한 최종 의견
  console.log("      [Phase 3] 수정된 입장...");
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

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "revised" });
    history.push({ role: `${ai}(최종)`, content: response.content });
  }

  // Phase 4: Orchestrator 합의 도출
  console.log("      [Phase 4] 합의 도출...");
  const historyStr = history.map(m => `[${m.role}] ${m.content}`).join("\n\n---\n\n");
  const orchestratorPrompt = `토론 진행자입니다. 격렬한 토론이 끝났습니다.

전체 토론 기록:
${historyStr}

다음을 정리해주세요:
1. 합의된 부분 (모든 전문가가 동의한 점)
2. 해소되지 않은 이견 (여전히 의견이 다른 부분과 각 입장)
3. 최종 권장사항 (이견을 고려한 현실적 접근법)
4. 주의사항 (반박에서 제기된 리스크 중 반드시 고려할 것)`;

  try {
    const action = await runOrchestrator(orchestratorPrompt);
    return {
      rounds,
      conclusion: action.conclusion || "토론 완료",
    };
  } catch {
    return {
      rounds,
      conclusion: "토론 완료 (Orchestrator 오류)",
    };
  }
}

// 단일 케이스 실행
async function runSingleCase(testCase: typeof ALL_CASES[0]): Promise<BenchmarkResult> {
  // Gemini API 에러로 임시 제외
  const multiAIs: AIName[] = ["claude", "codex"];
  const question = testCase.question;

  console.log(`\n🔄 [${testCase.id}] 시작...`);

  // 1. 단일 AI
  const singleStart = Date.now();
  const singleResponse = await runAI("claude", question);
  const singleTime = Date.now() - singleStart;
  console.log(`   ✅ 단일 AI 완료 (${(singleTime/1000).toFixed(1)}s)`);

  // 2. 병렬
  const parallelStart = Date.now();
  const parallelResponses = await runAllParallel(multiAIs, question);
  const parallelTime = Date.now() - parallelStart;
  console.log(`   ✅ 병렬 완료 (${(parallelTime/1000).toFixed(1)}s)`);

  // 3. 강한 토론 (반박 포함)
  const debateStart = Date.now();
  console.log(`   🔥 강한 토론 시작...`);
  const debateResult = await runStrongDebate(question, multiAIs);
  const debateTime = Date.now() - debateStart;
  const phases = [...new Set(debateResult.rounds.map(r => r.phase))];
  console.log(`   ✅ 토론 완료 (${(debateTime/1000).toFixed(1)}s, ${debateResult.rounds.length}발언, ${phases.length}단계)`);

  console.log(`✅ [${testCase.id}] 완료 (총 ${((singleTime + parallelTime + debateTime)/1000).toFixed(1)}s)`);

  return {
    caseId: testCase.id,
    caseName: testCase.name,
    caseType: testCase.type,
    category: testCase.category,
    controversyLevel: testCase.controversyLevel,
    singleAI: {
      response: singleResponse.content,
      timeMs: singleTime,
    },
    multiParallel: {
      responses: parallelResponses.map(r => ({ ai: r.ai, content: r.content })),
      timeMs: parallelTime,
    },
    multiDebate: {
      rounds: debateResult.rounds,
      conclusion: debateResult.conclusion,
      timeMs: debateTime,
    },
    analysis: {
      singleLength: singleResponse.content.length,
      parallelLength: parallelResponses.reduce((sum, r) => sum + r.content.length, 0),
      debateLength: debateResult.rounds.reduce((sum, r) => sum + r.content.length, 0),
      debateRounds: debateResult.rounds.length,
    },
  };
}

// 결과 요약 출력
function printSummary(results: BenchmarkResult[]) {
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                        📊 전체 벤치마크 결과 요약                              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  // 시간 통계
  const avgSingleTime = results.reduce((sum, r) => sum + r.singleAI.timeMs, 0) / results.length;
  const avgParallelTime = results.reduce((sum, r) => sum + r.multiParallel.timeMs, 0) / results.length;
  const avgDebateTime = results.reduce((sum, r) => sum + r.multiDebate.timeMs, 0) / results.length;

  console.log("\n⏱️  평균 응답 시간");
  console.log(`   단일 AI:   ${(avgSingleTime/1000).toFixed(1)}s`);
  console.log(`   병렬 모드: ${(avgParallelTime/1000).toFixed(1)}s (${(avgParallelTime/avgSingleTime).toFixed(1)}x)`);
  console.log(`   토론 모드: ${(avgDebateTime/1000).toFixed(1)}s (${(avgDebateTime/avgSingleTime).toFixed(1)}x)`);

  // 길이 통계
  const avgSingleLen = results.reduce((sum, r) => sum + r.analysis.singleLength, 0) / results.length;
  const avgParallelLen = results.reduce((sum, r) => sum + r.analysis.parallelLength, 0) / results.length;
  const avgDebateLen = results.reduce((sum, r) => sum + r.analysis.debateLength, 0) / results.length;

  console.log("\n📏 평균 응답 길이");
  console.log(`   단일 AI:   ${avgSingleLen.toFixed(0)}자`);
  console.log(`   병렬 모드: ${avgParallelLen.toFixed(0)}자 (${(avgParallelLen/avgSingleLen).toFixed(1)}x)`);
  console.log(`   토론 모드: ${avgDebateLen.toFixed(0)}자 (${(avgDebateLen/avgSingleLen).toFixed(1)}x)`);

  // 카테고리별 결과
  console.log("\n📂 카테고리별 결과");
  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const avgDebate = catResults.reduce((sum, r) => sum + r.multiDebate.timeMs, 0) / catResults.length;
    console.log(`   ${cat}: ${catResults.length}건, 평균 토론 시간 ${(avgDebate/1000).toFixed(1)}s`);
  }

  // 개별 결과 테이블
  console.log("\n📋 개별 케이스 결과");
  console.log("─".repeat(90));
  console.log(`${"케이스".padEnd(30)} ${"유형".padEnd(10)} ${"단일".padStart(8)} ${"병렬".padStart(8)} ${"토론".padStart(8)} ${"라운드".padStart(6)}`);
  console.log("─".repeat(90));

  for (const r of results) {
    const name = r.caseName.slice(0, 28).padEnd(30);
    const type = r.caseType.padEnd(10);
    const single = `${(r.singleAI.timeMs/1000).toFixed(1)}s`.padStart(8);
    const parallel = `${(r.multiParallel.timeMs/1000).toFixed(1)}s`.padStart(8);
    const debate = `${(r.multiDebate.timeMs/1000).toFixed(1)}s`.padStart(8);
    const rounds = `${r.multiDebate.rounds.length}`.padStart(6);
    console.log(`${name} ${type} ${single} ${parallel} ${debate} ${rounds}`);
  }
  console.log("─".repeat(90));
}

// 메인 실행
async function main() {
  const runId = Date.now();
  const outputDir = `.dev/benchmark/${runId}`;

  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              🧪 obora 전체 벤치마크 (20개 케이스 × 3개 모드)                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log(`\n총 ${ALL_CASES.length}개 케이스 실행 예정`);
  console.log(`- 기술/개발: ${BENCHMARK_CASES_V2.length}개`);
  console.log(`- 의사결정: ${DECISION_BENCHMARK_CASES.length}개`);
  console.log(`\n📁 결과 저장 위치: ${outputDir}/`);
  console.log(`\n⚠️  예상 소요 시간: 30-60분\n`);

  // 출력 디렉토리 생성
  await Bun.write(`${outputDir}/.gitkeep`, "");

  const startTime = Date.now();
  const results: BenchmarkResult[] = [];
  const errors: { caseId: string; error: string }[] = [];

  // 병렬 실행 (동시에 3개씩)
  const CONCURRENCY = 3;
  for (let i = 0; i < ALL_CASES.length; i += CONCURRENCY) {
    const batch = ALL_CASES.slice(i, i + CONCURRENCY);
    console.log(`\n━━━ 배치 ${Math.floor(i/CONCURRENCY) + 1}/${Math.ceil(ALL_CASES.length/CONCURRENCY)} ━━━`);

    const batchResults = await Promise.allSettled(
      batch.map(testCase => runSingleCase(testCase))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const caseId = batch[j].id;

      if (result.status === "fulfilled") {
        results.push(result.value);
        // 즉시 개별 파일로 저장
        const casePath = `${outputDir}/${caseId}.json`;
        await Bun.write(casePath, JSON.stringify(result.value, null, 2));
        console.log(`   💾 저장: ${casePath}`);
      } else {
        console.error(`❌ [${caseId}] 실패: ${result.reason}`);
        errors.push({ caseId, error: String(result.reason) });
        // 에러도 개별 파일로 저장
        const errorPath = `${outputDir}/${caseId}_error.json`;
        await Bun.write(errorPath, JSON.stringify({ caseId, error: String(result.reason) }, null, 2));
      }
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n\n✅ 전체 완료: ${results.length}/${ALL_CASES.length}건 성공 (${(totalTime/1000/60).toFixed(1)}분)`);

  if (errors.length > 0) {
    console.log(`\n❌ 실패한 케이스:`);
    errors.forEach(e => console.log(`   - ${e.caseId}: ${e.error.slice(0, 50)}`));
    // 에러 목록 저장
    await Bun.write(`${outputDir}/_errors.json`, JSON.stringify(errors, null, 2));
  }

  // 요약 출력
  printSummary(results);

  // 메타데이터 저장
  const meta = {
    runId,
    totalCases: ALL_CASES.length,
    successCount: results.length,
    errorCount: errors.length,
    totalTimeMs: totalTime,
    timestamp: new Date().toISOString(),
  };
  await Bun.write(`${outputDir}/_meta.json`, JSON.stringify(meta, null, 2));

  // 전체 결과도 저장 (호환성)
  const outputPath = `.dev/benchmark-results-all-${runId}.json`;
  await Bun.write(outputPath, JSON.stringify({ results, errors, totalTimeMs: totalTime }, null, 2));
  console.log(`\n💾 결과 저장: ${outputDir}/ (개별 파일)`);
  console.log(`💾 전체 결과: ${outputPath}`);
}

main().catch(console.error);
