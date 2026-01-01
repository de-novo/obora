#!/usr/bin/env bun
/**
 * Full benchmark parallel execution
 * 20 cases × 3 modes (single, parallel, debate)
 */

import { runAI, runAllParallel, runOrchestrator } from "./lib/runner";
import type { AIName, AIResponse, DebateState, OrchestratorAction } from "./lib/types";
import { BENCHMARK_CASES_V2 } from "./benchmark-cases";
import { DECISION_BENCHMARK_CASES } from "./benchmark-cases-decision";

// Merge all cases
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

// Run strong debate (with rebuttal rounds)
async function runStrongDebate(
  question: string,
  participants: AIName[]
): Promise<{ rounds: { ai: AIName; content: string; phase: string }[]; conclusion: string }> {
  const rounds: { ai: AIName; content: string; phase: string }[] = [];
  const history: { role: string; content: string }[] = [{ role: "user", content: question }];

  // Phase 1: Initial positions - each AI presents their opinion
  console.log("      [Phase 1] Initial positions...");
  for (const ai of participants) {
    const prompt = `Topic: ${question}

You must present a clear position as an expert on this topic.
- Provide a specific recommendation
- Clearly explain the reasoning behind your choice
- Also mention potential risks`;

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "initial" });
    history.push({ role: ai, content: response.content });
  }

  // Phase 2: Rebuttal round - point out problems in previous statements
  console.log("      [Phase 2] Rebuttal round...");
  for (const ai of participants) {
    const othersOpinions = history
      .filter(h => h.role !== "user" && h.role !== ai)
      .map(h => `[${h.role}] ${h.content}`)
      .join("\n\n---\n\n");

    const prompt = `Topic: ${question}

Other experts' opinions:
${othersOpinions}

Your role: Critical Reviewer
Point out problems, gaps, and underestimated risks in the above opinions.
- Find weaknesses even if you agree
- Avoid phrases like "Good point, but..."
- Provide specific counterexamples or failure scenarios
- Specify conditions under which the approach could fail`;

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "rebuttal" });
    history.push({ role: `${ai}(rebuttal)`, content: response.content });
  }

  // Phase 3: Revised positions - final opinion considering rebuttals
  console.log("      [Phase 3] Revised positions...");
  for (const ai of participants) {
    const allHistory = history
      .filter(h => h.role !== "user")
      .map(h => `[${h.role}] ${h.content}`)
      .join("\n\n---\n\n");

    const prompt = `Topic: ${question}

Discussion so far:
${allHistory}

Considering other experts' rebuttals:
1. Revise your initial position if needed
2. Defend with stronger evidence if you maintain your position
3. Present your final recommendation`;

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "revised" });
    history.push({ role: `${ai}(final)`, content: response.content });
  }

  // Phase 4: Orchestrator consensus
  console.log("      [Phase 4] Building consensus...");
  const historyStr = history.map(m => `[${m.role}] ${m.content}`).join("\n\n---\n\n");
  const orchestratorPrompt = `You are the debate moderator. An intense debate has concluded.

Full debate transcript:
${historyStr}

Please summarize:
1. Points of agreement (what all experts agreed on)
2. Unresolved disagreements (where opinions still differ and each position)
3. Final recommendation (practical approach considering disagreements)
4. Cautions (risks raised in rebuttals that must be considered)`;

  try {
    const action = await runOrchestrator(orchestratorPrompt);
    return {
      rounds,
      conclusion: action.conclusion || "Debate completed",
    };
  } catch {
    return {
      rounds,
      conclusion: "Debate completed (Orchestrator error)",
    };
  }
}

// Run single case
async function runSingleCase(testCase: typeof ALL_CASES[0]): Promise<BenchmarkResult> {
  // Gemini excluded due to API errors
  const multiAIs: AIName[] = ["claude", "codex"];
  const question = testCase.question;

  console.log(`\n🔄 [${testCase.id}] Starting...`);

  // 1. Single AI
  const singleStart = Date.now();
  const singleResponse = await runAI("claude", question);
  const singleTime = Date.now() - singleStart;
  console.log(`   ✅ Single AI done (${(singleTime/1000).toFixed(1)}s)`);

  // 2. Parallel
  const parallelStart = Date.now();
  const parallelResponses = await runAllParallel(multiAIs, question);
  const parallelTime = Date.now() - parallelStart;
  console.log(`   ✅ Parallel done (${(parallelTime/1000).toFixed(1)}s)`);

  // 3. Strong debate (with rebuttals)
  const debateStart = Date.now();
  console.log(`   🔥 Strong debate starting...`);
  const debateResult = await runStrongDebate(question, multiAIs);
  const debateTime = Date.now() - debateStart;
  const phases = [...new Set(debateResult.rounds.map(r => r.phase))];
  console.log(`   ✅ Debate done (${(debateTime/1000).toFixed(1)}s, ${debateResult.rounds.length} statements, ${phases.length} phases)`);

  console.log(`✅ [${testCase.id}] Complete (total ${((singleTime + parallelTime + debateTime)/1000).toFixed(1)}s)`);

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

// Print results summary
function printSummary(results: BenchmarkResult[]) {
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                        📊 Full Benchmark Results Summary                      ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  // Time statistics
  const avgSingleTime = results.reduce((sum, r) => sum + r.singleAI.timeMs, 0) / results.length;
  const avgParallelTime = results.reduce((sum, r) => sum + r.multiParallel.timeMs, 0) / results.length;
  const avgDebateTime = results.reduce((sum, r) => sum + r.multiDebate.timeMs, 0) / results.length;

  console.log("\n⏱️  Average Response Time");
  console.log(`   Single AI:    ${(avgSingleTime/1000).toFixed(1)}s`);
  console.log(`   Parallel:     ${(avgParallelTime/1000).toFixed(1)}s (${(avgParallelTime/avgSingleTime).toFixed(1)}x)`);
  console.log(`   Debate:       ${(avgDebateTime/1000).toFixed(1)}s (${(avgDebateTime/avgSingleTime).toFixed(1)}x)`);

  // Length statistics
  const avgSingleLen = results.reduce((sum, r) => sum + r.analysis.singleLength, 0) / results.length;
  const avgParallelLen = results.reduce((sum, r) => sum + r.analysis.parallelLength, 0) / results.length;
  const avgDebateLen = results.reduce((sum, r) => sum + r.analysis.debateLength, 0) / results.length;

  console.log("\n📏 Average Response Length");
  console.log(`   Single AI:    ${avgSingleLen.toFixed(0)} chars`);
  console.log(`   Parallel:     ${avgParallelLen.toFixed(0)} chars (${(avgParallelLen/avgSingleLen).toFixed(1)}x)`);
  console.log(`   Debate:       ${avgDebateLen.toFixed(0)} chars (${(avgDebateLen/avgSingleLen).toFixed(1)}x)`);

  // Results by category
  console.log("\n📂 Results by Category");
  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const avgDebate = catResults.reduce((sum, r) => sum + r.multiDebate.timeMs, 0) / catResults.length;
    console.log(`   ${cat}: ${catResults.length} cases, avg debate time ${(avgDebate/1000).toFixed(1)}s`);
  }

  // Individual results table
  console.log("\n📋 Individual Case Results");
  console.log("─".repeat(90));
  console.log(`${"Case".padEnd(30)} ${"Type".padEnd(10)} ${"Single".padStart(8)} ${"Parallel".padStart(8)} ${"Debate".padStart(8)} ${"Rounds".padStart(6)}`);
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

// Main execution
async function main() {
  const runId = Date.now();
  const outputDir = `.dev/benchmark/${runId}`;

  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              🧪 Obora Full Benchmark (20 cases × 3 modes)                     ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log(`\nTotal ${ALL_CASES.length} cases scheduled`);
  console.log(`- Technical: ${BENCHMARK_CASES_V2.length} cases`);
  console.log(`- Decision-making: ${DECISION_BENCHMARK_CASES.length} cases`);
  console.log(`\n📁 Output directory: ${outputDir}/`);
  console.log(`\n⚠️  Estimated time: 30-60 minutes\n`);

  // Create output directory
  await Bun.write(`${outputDir}/.gitkeep`, "");

  const startTime = Date.now();
  const results: BenchmarkResult[] = [];
  const errors: { caseId: string; error: string }[] = [];

  // Parallel execution (3 at a time)
  const CONCURRENCY = 3;
  for (let i = 0; i < ALL_CASES.length; i += CONCURRENCY) {
    const batch = ALL_CASES.slice(i, i + CONCURRENCY);
    console.log(`\n━━━ Batch ${Math.floor(i/CONCURRENCY) + 1}/${Math.ceil(ALL_CASES.length/CONCURRENCY)} ━━━`);

    const batchResults = await Promise.allSettled(
      batch.map(testCase => runSingleCase(testCase))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const caseId = batch[j].id;

      if (result.status === "fulfilled") {
        results.push(result.value);
        // Save immediately to individual file
        const casePath = `${outputDir}/${caseId}.json`;
        await Bun.write(casePath, JSON.stringify(result.value, null, 2));
        console.log(`   💾 Saved: ${casePath}`);
      } else {
        console.error(`❌ [${caseId}] Failed: ${result.reason}`);
        errors.push({ caseId, error: String(result.reason) });
        // Save error to individual file
        const errorPath = `${outputDir}/${caseId}_error.json`;
        await Bun.write(errorPath, JSON.stringify({ caseId, error: String(result.reason) }, null, 2));
      }
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n\n✅ Complete: ${results.length}/${ALL_CASES.length} succeeded (${(totalTime/1000/60).toFixed(1)} min)`);

  if (errors.length > 0) {
    console.log(`\n❌ Failed cases:`);
    errors.forEach(e => console.log(`   - ${e.caseId}: ${e.error.slice(0, 50)}`));
    // Save error list
    await Bun.write(`${outputDir}/_errors.json`, JSON.stringify(errors, null, 2));
  }

  // Print summary
  printSummary(results);

  // Save metadata
  const meta = {
    runId,
    totalCases: ALL_CASES.length,
    successCount: results.length,
    errorCount: errors.length,
    totalTimeMs: totalTime,
    timestamp: new Date().toISOString(),
  };
  await Bun.write(`${outputDir}/_meta.json`, JSON.stringify(meta, null, 2));

  // Save full results (for compatibility)
  const outputPath = `.dev/benchmark-results-all-${runId}.json`;
  await Bun.write(outputPath, JSON.stringify({ results, errors, totalTimeMs: totalTime }, null, 2));
  console.log(`\n💾 Results saved: ${outputDir}/ (individual files)`);
  console.log(`💾 Full results: ${outputPath}`);
}

main().catch(console.error);
