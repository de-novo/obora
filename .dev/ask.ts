#!/usr/bin/env bun
import { parseArgs } from "util";
import type { AIName, AIResponse, Config, Message, DebateState } from "./lib/types";
import { runAI, runAllParallel, loadConfig, getDefaultConfig } from "./lib/runner";

// CLI 파싱
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    debate: { type: "boolean", short: "d", default: false },
    file: { type: "string", short: "f" },
    config: { type: "string", short: "c" },
    orchestrator: { type: "string", short: "o" },
    participants: { type: "string", short: "p" },
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

  return responses;
}

// ============================================
// Debate 모드 (Orchestrator)
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

  while (state.round < config.settings.max_rounds) {
    state.round++;
    log(`--- Round ${state.round} ---\n`);

    // 1. 발언권 요청
    const requestPrompt = buildRequestPrompt(state, participants);
    log(`[O] 발언권 요청 중...`);

    const requests = await Promise.all(
      participants.map(async (ai) => {
        const res = await runAI(ai, requestPrompt);
        const wants = res.content.toUpperCase().includes("REQUEST");
        return { ai, wants };
      })
    );

    const requestStatus = requests
      .map(r => `${r.ai}: ${r.wants ? "✋" : "💤"}`)
      .join("  ");
    log(`    ${requestStatus}`);

    const requesters = requests.filter(r => r.wants).map(r => r.ai);

    if (requesters.length === 0) {
      log(`\n모든 AI가 PASS. 토론 종료.\n`);
      break;
    }

    // 2. Orchestrator가 발언자 선택
    const selectPrompt = buildSelectPrompt(state, requesters);
    const selectRes = await runAI(orchestratorAI, selectPrompt);

    // SELECT: xxx 또는 END: xxx 파싱
    const selectContent = selectRes.content;

    if (selectContent.includes("END:")) {
      const conclusion = selectContent.split("END:")[1]?.trim() || "토론 종료";
      log(`\n[O] 토론 종료`);
      log(`📋 결론: ${conclusion}\n`);
      state.history.push({ role: "orchestrator", content: `END: ${conclusion}` });
      break;
    }

    // SELECT: xxx 파싱
    let selectedAI: AIName | null = null;
    for (const ai of requesters) {
      if (selectContent.toLowerCase().includes(ai)) {
        selectedAI = ai;
        break;
      }
    }

    if (!selectedAI) {
      selectedAI = requesters[0]; // fallback
    }

    log(`    → ${selectedAI} 선택\n`);

    // 3. 선택된 AI 발언
    const speakPrompt = buildSpeakPrompt(state);
    const speakRes = await runAI(selectedAI, speakPrompt);

    log(`[${selectedAI}] 🎤`);
    log(speakRes.content);
    log("");

    // 상태 업데이트
    state.history.push({ role: selectedAI, content: speakRes.content });
    state.speakCounts[selectedAI]++;
  }

  return state;
}

// 발언권 요청 프롬프트
function buildRequestPrompt(state: DebateState, participants: AIName[]): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  return `현재 토론:
주제: ${state.topic}

지금까지 대화:
${historyStr}

발언권을 요청하시겠습니까?

응답:
- REQUEST - 할 말이 있음
- PASS - 지금은 패스

한 단어로만 응답해주세요.`;
}

// Orchestrator 선택 프롬프트
function buildSelectPrompt(state: DebateState, requesters: AIName[]): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  const countsStr = Object.entries(state.speakCounts)
    .map(([ai, count]) => `${ai}: ${count}회`)
    .join(", ");

  return `당신은 AI 토론의 진행자(Orchestrator)입니다.

현재 토론:
주제: ${state.topic}

지금까지 대화:
${historyStr}

발언 횟수: ${countsStr}

발언권을 요청한 AI: ${requesters.join(", ")}

다음 중 하나를 선택하세요:
1. 발언자 선택: "SELECT: AI이름" (예: SELECT: gemini)
2. 토론 종료: "END: 결론 요약"

고려사항:
- 발언 기회가 적었던 AI 우선
- 토론 흐름에 맞는 AI 선택
- 직전 발언자는 가급적 피함
- 합의에 도달했으면 END

응답:`;
}

// 발언 프롬프트
function buildSpeakPrompt(state: DebateState): string {
  const historyStr = state.history
    .map(m => `[${m.role}] ${m.content}`)
    .join("\n\n");

  return `현재 토론:
주제: ${state.topic}

지금까지 대화:
${historyStr}

발언권이 주어졌습니다. 의견을 말씀해주세요.
다른 AI 의견에 동의, 반박, 보충할 수 있습니다.
간결하게 핵심만 말씀해주세요.`;
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
