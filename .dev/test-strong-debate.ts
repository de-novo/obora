#!/usr/bin/env bun
/**
 * Strong debate mode single test
 * Verify that rebuttal rounds work correctly
 */

import { runAI, runOrchestrator } from "./lib/runner";
import type { AIName } from "./lib/types";

// Test question (choose something controversial)
const TEST_QUESTION = `
B2B SaaS startup (Series A, 5 developers).
Currently running a monolithic Node.js backend. Should we migrate to microservices?
10 enterprise clients, 5,000 MAU, $25,000 monthly revenue.
`;

async function runStrongDebate(question: string, participants: AIName[]) {
  const rounds: { ai: AIName; content: string; phase: string }[] = [];
  const history: { role: string; content: string }[] = [{ role: "user", content: question }];

  // Phase 1: Initial positions
  console.log("\n━━━ Phase 1: Initial Positions ━━━");
  for (const ai of participants) {
    const prompt = `Topic: ${question}

You must present a clear position as an expert on this topic.
- Provide a specific recommendation
- Clearly explain the reasoning behind your choice
- Also mention potential risks`;

    console.log(`\n[${ai}] Speaking...`);
    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "initial" });
    history.push({ role: ai, content: response.content });

    // Print summary (first 200 chars)
    console.log(`[${ai}] ${response.content.slice(0, 200)}...`);
  }

  // Phase 2: Rebuttal round
  console.log("\n━━━ Phase 2: Rebuttal Round ━━━");
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

    console.log(`\n[${ai}] Rebutting...`);
    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "rebuttal" });
    history.push({ role: `${ai}(rebuttal)`, content: response.content });

    console.log(`[${ai} rebuttal] ${response.content.slice(0, 200)}...`);
  }

  // Phase 3: Revised positions
  console.log("\n━━━ Phase 3: Revised Positions ━━━");
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

    console.log(`\n[${ai}] Final position...`);
    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content, phase: "revised" });
    history.push({ role: `${ai}(final)`, content: response.content });

    console.log(`[${ai} final] ${response.content.slice(0, 200)}...`);
  }

  // Phase 4: Orchestrator consensus
  console.log("\n━━━ Phase 4: Building Consensus ━━━");
  const historyStr = history.map(m => `[${m.role}] ${m.content}`).join("\n\n---\n\n");
  const orchestratorPrompt = `You are the debate moderator. An intense debate has concluded.

Full debate transcript:
${historyStr}

Please summarize:
1. Points of agreement (what all experts agreed on)
2. Unresolved disagreements (where opinions still differ and each position)
3. Final recommendation (practical approach considering disagreements)
4. Cautions (risks raised in rebuttals that must be considered)`;

  const action = await runOrchestrator(orchestratorPrompt);

  return { rounds, conclusion: action.conclusion || "Debate completed" };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           🔥 Strong Debate Test (with Rebuttal Rounds)        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("\n📋 Test Question:");
  console.log(TEST_QUESTION);

  const startTime = Date.now();
  // Gemini excluded due to API errors
  const participants: AIName[] = ["claude", "codex"];

  try {
    const result = await runStrongDebate(TEST_QUESTION, participants);
    const elapsed = (Date.now() - startTime) / 1000;

    console.log("\n\n");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║                       📊 Debate Results                       ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");

    // Statements by phase
    const phases = {
      initial: result.rounds.filter(r => r.phase === "initial"),
      rebuttal: result.rounds.filter(r => r.phase === "rebuttal"),
      revised: result.rounds.filter(r => r.phase === "revised"),
    };

    console.log(`\n⏱️  Total time: ${elapsed.toFixed(1)}s`);
    console.log(`📝 Total statements: ${result.rounds.length}`);
    console.log(`   - Initial positions: ${phases.initial.length}`);
    console.log(`   - Rebuttals: ${phases.rebuttal.length}`);
    console.log(`   - Revised positions: ${phases.revised.length}`);

    console.log("\n━━━ Final Conclusion ━━━");
    console.log(result.conclusion);

    // Save results
    const outputPath = `.dev/test-strong-debate-result.json`;
    await Bun.write(outputPath, JSON.stringify({
      question: TEST_QUESTION,
      rounds: result.rounds,
      conclusion: result.conclusion,
      elapsedSeconds: elapsed,
      timestamp: new Date().toISOString(),
    }, null, 2));
    console.log(`\n💾 Results saved: ${outputPath}`);

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
