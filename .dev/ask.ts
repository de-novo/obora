#!/usr/bin/env bun
import { parseArgs } from "util";
import type { AIName, AIResponse, Config, Message, DebateState, OrchestratorAction } from "./lib/types";
import { runAI, runAllParallel, runOrchestrator, loadConfig, getDefaultConfig } from "./lib/runner";

// CLI parsing
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    debate: { type: "boolean", short: "d", default: false },
    file: { type: "string", short: "f" },
    config: { type: "string", short: "c" },
    orchestrator: { type: "string", short: "o" },
    participants: { type: "string", short: "p" },
    summary: { type: "boolean", short: "s", default: false },
    json: { type: "boolean", default: false },
    output: { type: "string" },
    quiet: { type: "boolean", short: "q", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Usage: bun .dev/ask.ts [options] "question"

Options:
  -d, --debate          Debate mode (Orchestrator)
  -f, --file <path>     Question file
  -c, --config <path>   Config file (default: .dev/config.yaml)
  -o, --orchestrator    Orchestrator AI (claude, gemini, codex)
  -p, --participants    Participating AIs (comma separated)
  -s, --summary         Summarize Parallel mode results
  --json                JSON output
  --output <path>       Save results to file
  -q, --quiet           Quiet mode
  -h, --help            Help
`);
  process.exit(0);
}

// Get question
async function getQuestion(): Promise<string> {
  // From file
  if (values.file) {
    const file = Bun.file(values.file);
    return await file.text();
  }

  // From positional args
  if (positionals.length > 0) {
    return positionals.join(" ");
  }

  // From stdin
  const stdin = await Bun.stdin.text();
  if (stdin.trim()) {
    return stdin.trim();
  }

  throw new Error("Please provide a question");
}

// Load config
async function getConfig(): Promise<Config> {
  const configPath = values.config || ".dev/config.yaml";

  try {
    const config = await loadConfig(configPath);

    // Override with CLI options
    if (values.orchestrator) {
      config.orchestrator.ai = values.orchestrator as AIName;
    }
    if (values.participants) {
      config.participants = values.participants.split(",") as AIName[];
    }

    return config;
  } catch {
    return getDefaultConfig();
  }
}

// Output function
function log(message: string) {
  if (!values.quiet) {
    console.log(message);
  }
}

// ============================================
// Parallel Mode
// ============================================
async function runParallel(question: string, config: Config) {
  log(`\n[You] ${question}\n`);
  log(`--- Parallel Mode: ${config.participants.join(", ")} ---\n`);

  const responses = await runAllParallel(config.participants, question);

  for (const res of responses) {
    log(`[${res.ai}]`);
    log(res.content);
    log("");
  }

  if (values.summary) {
    log(`--- Orchestrator (${config.orchestrator.ai}) Summary ---\n`);
    const summaryPrompt = `The following are responses from multiple AIs to the question "${question}".\n\n` +
      responses.map(res => `[${res.ai}]\n${res.content}`).join("\n\n") +
      "\n\nPlease summarize the commonalities, differences, and optimal conclusion from these responses.";

    const summaryRes = await runAI(config.orchestrator.ai, summaryPrompt);
    log(summaryRes.content);
    log("");
    return { responses, summary: summaryRes };
  }

  return responses;
}

// ============================================
// Debate Mode (Orchestrator) - Hybrid Turn Management
// ============================================
async function runDebate(question: string, config: Config) {
  const orchestratorAI = config.orchestrator.ai;
  const participants = config.participants;

  log(`\n[You] ${question}\n`);
  log(`--- Debate Mode | Orchestrator: ${orchestratorAI} | Participants: ${participants.join(", ")} ---\n`);

  const state: DebateState = {
    topic: question,
    history: [{ role: "user", content: question }],
    round: 0,
    speakCounts: Object.fromEntries(participants.map(p => [p, 0])) as Record<AIName, number>,
  };

  // ========== Phase 1: Initial Round - All AIs speak once sequentially ==========
  log(`=== Phase 1: Initial Statements (${participants.length} participants) ===\n`);

  for (const ai of participants) {
    state.round++;
    log(`--- Round ${state.round} ---\n`);

    const speakPrompt = buildSpeakPrompt(state);
    const speakRes = await runAI(ai, speakPrompt);

    log(`[${ai}] 🎤`);
    log(speakRes.content);
    log("");

    state.history.push({ role: ai, content: speakRes.content });
    state.speakCounts[ai]++;
  }

  // ========== Phase 2: Rebuttal Round - Orchestrator assigns turns ==========
  const maxRebuttalRounds = config.settings.max_rounds - participants.length;

  if (maxRebuttalRounds > 0) {
    log(`=== Phase 2: Rebuttal Rounds (max ${maxRebuttalRounds}) ===\n`);
  }

  while (state.round < config.settings.max_rounds) {
    state.round++;
    log(`--- Round ${state.round} (Rebuttal) ---\n`);

    // Orchestrator selects rebutter or decides to end
    const orchestratorPrompt = buildOrchestratorPrompt(state, participants);
    log(`[O] Deciding...`);

    let action: OrchestratorAction;
    try {
      action = await runOrchestrator(orchestratorPrompt);
    } catch (e) {
      // fallback: select AI with fewer statements
      const sorted = [...participants].sort((a, b) =>
        (state.speakCounts[a] || 0) - (state.speakCounts[b] || 0)
      );
      action = { action: "select", target: sorted[0], reason: "fallback" };
    }

    // End decision
    if (action.action === "end") {
      log(`\n[O] Debate Ended`);
      log(`📋 Conclusion: ${action.conclusion || "Consensus reached"}`);
      if (action.reason) log(`   Reason: ${action.reason}`);
      log("");
      state.history.push({ role: "orchestrator", content: `END: ${action.conclusion}` });
      break;
    }

    let selectedAI = action.target as AIName;
    if (!selectedAI || !participants.includes(selectedAI)) {
      // Invalid selection → fallback
      const sorted = [...participants].sort((a, b) =>
        (state.speakCounts[a] || 0) - (state.speakCounts[b] || 0)
      );
      selectedAI = sorted[0];
      log(`    → ${selectedAI} selected (fallback)\n`);
    } else {
      log(`    → ${selectedAI} selected`);
      if (action.reason) log(`       (${action.reason})`);
      log("")
    }

    // Selected AI rebuts
    const rebuttalPrompt = buildRebuttalPrompt(state);
    const speakRes = await runAI(selectedAI, rebuttalPrompt);

    log(`[${selectedAI}] 🔄 Rebuttal`);
    log(speakRes.content);
    log("");

    state.history.push({ role: selectedAI, content: speakRes.content });
    state.speakCounts[selectedAI]++;
  }

  return state;
}

// Orchestrator prompt (for rebuttal rounds)
function buildOrchestratorPrompt(state: DebateState, participants: AIName[]): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  const countsStr = Object.entries(state.speakCounts)
    .map(([ai, count]) => `${ai}: ${count} times`)
    .join(", ");

  const lastSpeaker = state.history.length > 1
    ? state.history[state.history.length - 1].role
    : "none";

  return `AI Debate Moderator (Rebuttal Round). Decide one of the following:
1. Select an AI that needs to rebut/supplement (action: "select")
2. End if sufficient discussion (action: "end")

Topic: ${state.topic}
Current Round: ${state.round} (all AIs have spoken at least once)
Statement counts: ${countsStr}
Last speaker: ${lastSpeaker}
Participants: ${participants.join(", ")}

Conversation history:
${historyStr}

Decision criteria:
- Provide rebuttal opportunity if there's disagreement
- End if consensus formed or discussion is sufficient
- Prioritize AIs with fewer statements
- Exclude the last speaker`;
}

// Initial statement prompt
function buildSpeakPrompt(state: DebateState): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  return `Current debate:
Topic: ${state.topic}

Conversation so far:
${historyStr}

You have been given the floor. Please share your opinion on the topic.
You may reference other AI opinions if available, but present your own perspective.
Please elaborate your arguments fully.`;
}

// Rebuttal prompt
function buildRebuttalPrompt(state: DebateState): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  return `Current debate:
Topic: ${state.topic}

Conversation so far:
${historyStr}

This is your opportunity to rebut or supplement.
- You may agree/disagree/supplement other AI opinions
- You may present new perspectives
- If you see points of consensus, please mention them`;
}

// ============================================
// Main
// ============================================
async function main() {
  try {
    const question = await getQuestion();
    const config = await getConfig();

    let result: unknown;

    if (values.debate) {
      result = await runDebate(question, config);
    } else {
      result = await runParallel(question, config);
    }

    // JSON output
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    // Save to file
    if (values.output) {
      await Bun.write(values.output, JSON.stringify(result, null, 2));
      log(`Results saved: ${values.output}`);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
