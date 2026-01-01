#!/usr/bin/env bun
import { parseArgs } from "util";
import type { AIName, AIResponse, Config, Message, DebateState, OrchestratorAction } from "./lib/types";
import { runAI, runAllParallel, runOrchestrator, loadConfig, getDefaultConfig } from "./lib/runner";

// CLI 파싱
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
Usage: bun .dev/ask.ts [options] "질문"

Options:
  -d, --debate          토론 모드 (Orchestrator)
  -f, --file <path>     질문 파일
  -c, --config <path>   설정 파일 (기본: .dev/config.yaml)
  -o, --orchestrator    Orchestrator AI (claude, gemini, codex)
  -p, --participants    참여 AI (쉼표 구분)
  -s, --summary         Parallel 모드 결과 요약
  --json                JSON 출력
  --output <path>       결과 저장 파일
  -q, --quiet           조용한 모드
  -h, --help            도움말
`);
  process.exit(0);
}

// 질문 가져오기
async function getQuestion(): Promise<string> {
  // 파일에서
  if (values.file) {
    const file = Bun.file(values.file);
    return await file.text();
  }

  // positional에서
  if (positionals.length > 0) {
    return positionals.join(" ");
  }

  // stdin에서
  const stdin = await Bun.stdin.text();
  if (stdin.trim()) {
    return stdin.trim();
  }

  throw new Error("질문을 입력해주세요");
}

// 설정 로드
async function getConfig(): Promise<Config> {
  const configPath = values.config || ".dev/config.yaml";

  try {
    const config = await loadConfig(configPath);

    // CLI 옵션으로 오버라이드
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

// 출력 함수
function log(message: string) {
  if (!values.quiet) {
    console.log(message);
  }
}

// ============================================
// Parallel 모드
// ============================================
async function runParallel(question: string, config: Config) {
  log(`\n[You] ${question}\n`);
  log(`--- Parallel 모드: ${config.participants.join(", ")} ---\n`);

  const responses = await runAllParallel(config.participants, question);

  for (const res of responses) {
    log(`[${res.ai}]`);
    log(res.content);
    log("");
  }

  if (values.summary) {
    log(`--- Orchestrator (${config.orchestrator.ai}) Summary ---\n`);
    const summaryPrompt = `다음은 동일한 질문 "${question}"에 대한 여러 AI들의 답변입니다.\n\n` +
      responses.map(res => `[${res.ai}]\n${res.content}`).join("\n\n") +
      "\n\n위 답변들을 종합하여 공통점, 차이점, 그리고 최적의 결론을 요약해주세요.";

    const summaryRes = await runAI(config.orchestrator.ai, summaryPrompt);
    log(summaryRes.content);
    log("");
    return { responses, summary: summaryRes };
  }

  return responses;
}

// ============================================
// Debate 모드 (Orchestrator) - 하이브리드 턴 관리
// ============================================
async function runDebate(question: string, config: Config) {
  const orchestratorAI = config.orchestrator.ai;
  const participants = config.participants;

  log(`\n[You] ${question}\n`);
  log(`--- Debate 모드 | Orchestrator: ${orchestratorAI} | 참여: ${participants.join(", ")} ---\n`);

  const state: DebateState = {
    topic: question,
    history: [{ role: "user", content: question }],
    round: 0,
    speakCounts: Object.fromEntries(participants.map(p => [p, 0])) as Record<AIName, number>,
  };

  // ========== Phase 1: 초기 라운드 - 모든 AI 1회씩 순차 발언 ==========
  log(`=== Phase 1: 초기 발언 (${participants.length}명) ===\n`);

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

  // ========== Phase 2: 반박 라운드 - Orchestrator가 배분 ==========
  const maxRebuttalRounds = config.settings.max_rounds - participants.length;

  if (maxRebuttalRounds > 0) {
    log(`=== Phase 2: 반박 라운드 (최대 ${maxRebuttalRounds}회) ===\n`);
  }

  while (state.round < config.settings.max_rounds) {
    state.round++;
    log(`--- Round ${state.round} (반박) ---\n`);

    // Orchestrator가 반박자 선택 또는 종료 결정
    const orchestratorPrompt = buildOrchestratorPrompt(state, participants);
    log(`[O] 판단 중...`);

    let action: OrchestratorAction;
    try {
      action = await runOrchestrator(orchestratorPrompt);
    } catch (e) {
      // fallback: 발언 적은 AI 선택
      const sorted = [...participants].sort((a, b) =>
        (state.speakCounts[a] || 0) - (state.speakCounts[b] || 0)
      );
      action = { action: "select", target: sorted[0], reason: "fallback" };
    }

    // 종료 판단
    if (action.action === "end") {
      log(`\n[O] 토론 종료`);
      log(`📋 결론: ${action.conclusion || "합의 도달"}`);
      if (action.reason) log(`   이유: ${action.reason}`);
      log("");
      state.history.push({ role: "orchestrator", content: `END: ${action.conclusion}` });
      break;
    }

    let selectedAI = action.target as AIName;
    if (!selectedAI || !participants.includes(selectedAI)) {
      // 유효하지 않은 선택 → fallback
      const sorted = [...participants].sort((a, b) =>
        (state.speakCounts[a] || 0) - (state.speakCounts[b] || 0)
      );
      selectedAI = sorted[0];
      log(`    → ${selectedAI} 선택 (fallback)\n`);
    } else {
      log(`    → ${selectedAI} 선택`);
      if (action.reason) log(`       (${action.reason})`);
      log("")
    }

    // 선택된 AI 반박
    const rebuttalPrompt = buildRebuttalPrompt(state);
    const speakRes = await runAI(selectedAI, rebuttalPrompt);

    log(`[${selectedAI}] 🔄 반박`);
    log(speakRes.content);
    log("");

    state.history.push({ role: selectedAI, content: speakRes.content });
    state.speakCounts[selectedAI]++;
  }

  return state;
}

// Orchestrator 프롬프트 (반박 라운드용)
function buildOrchestratorPrompt(state: DebateState, participants: AIName[]): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  const countsStr = Object.entries(state.speakCounts)
    .map(([ai, count]) => `${ai}: ${count}회`)
    .join(", ");

  const lastSpeaker = state.history.length > 1
    ? state.history[state.history.length - 1].role
    : "없음";

  return `AI 토론 진행자 (반박 라운드). 다음 중 하나를 결정하세요:
1. 반박/보충이 필요한 AI 선택 (action: "select")
2. 충분한 논의가 되었으면 종료 (action: "end")

주제: ${state.topic}
현재 라운드: ${state.round} (모든 AI가 최소 1회씩 발언 완료)
발언 횟수: ${countsStr}
직전 발언자: ${lastSpeaker}
참여자: ${participants.join(", ")}

대화 기록:
${historyStr}

판단 기준:
- 의견 대립이 있으면 반박 기회 제공
- 합의가 형성되었거나 논의가 충분하면 종료
- 발언 적은 AI 우선 고려
- 직전 발언자는 제외`;
}

// 초기 발언 프롬프트
function buildSpeakPrompt(state: DebateState): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  return `현재 토론:
주제: ${state.topic}

지금까지 대화:
${historyStr}

발언권이 주어졌습니다. 주제에 대한 의견을 말씀해주세요.
다른 AI 의견이 있다면 참고하되, 자신만의 관점을 제시해주세요.
충분히 논거를 펼쳐주세요.`;
}

// 반박 프롬프트
function buildRebuttalPrompt(state: DebateState): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  return `현재 토론:
주제: ${state.topic}

지금까지 대화:
${historyStr}

반박 또는 보충 발언 기회입니다.
- 다른 AI 의견에 동의/반박/보충할 수 있습니다
- 새로운 관점을 제시할 수도 있습니다
- 합의점이 보이면 그것을 언급해주세요`;
}

// ============================================
// 메인
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

    // JSON 출력
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    // 파일 저장
    if (values.output) {
      await Bun.write(values.output, JSON.stringify(result, null, 2));
      log(`결과 저장: ${values.output}`);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
