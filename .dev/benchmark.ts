#!/usr/bin/env bun
import { parseArgs } from "util";
import { runAI, runAllParallel, runOrchestrator } from "./lib/runner";
import type { AIName, AIResponse, DebateState, OrchestratorAction } from "./lib/types";

// ============================================
// 벤치마크: 단일 AI vs 멀티 AI 비교
// ============================================

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    case: { type: "string", short: "c" },      // 특정 케이스만 실행
    single: { type: "string", short: "s" },    // 단일 AI 선택 (기본: claude)
    output: { type: "string", short: "o" },    // 결과 저장
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
벤치마크: 단일 AI vs 멀티 AI 비교

Usage:
  bun .dev/benchmark.ts                    # 모든 케이스 실행
  bun .dev/benchmark.ts -c arch            # 특정 케이스만
  bun .dev/benchmark.ts -s gemini          # 단일 AI를 gemini로
  bun .dev/benchmark.ts -o results.json    # 결과 저장

케이스:
  arch      아키텍처 의사결정
  security  보안 취약점 분석
  library   라이브러리 선택
  debug     디버깅/원인 분석
  refactor  리팩토링 전략
`);
  process.exit(0);
}

// ============================================
// 테스트 케이스 정의
// ============================================

interface BenchmarkCase {
  id: string;
  name: string;
  question: string;
  evaluationCriteria: string[];  // 평가 기준 (체크리스트)
  expectedTopics: string[];      // 반드시 언급해야 할 주제
}

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "arch",
    name: "아키텍처 의사결정",
    question: `우리 팀은 5명의 백엔드 개발자로 구성되어 있고,
새로운 e-commerce 플랫폼을 처음부터 만들려고 합니다.

현재 고민:
- 마이크로서비스 vs 모놀리스 vs 모듈러 모놀리스
- 예상 트래픽: 출시 후 1년 내 MAU 50만, 3년 내 100만
- 팀 경험: Spring Boot 위주, K8s 경험 적음

질문:
1. 어떤 아키텍처를 추천하시나요?
2. 그 이유는 무엇인가요?
3. 이 선택의 가장 큰 리스크는?
4. 대안을 선택했을 때의 장점은?`,
    evaluationCriteria: [
      "명확한 추천 제시",
      "팀 규모/경험 고려",
      "트래픽 스케일 고려",
      "리스크 분석 포함",
      "대안의 장점도 언급",
      "구체적인 다음 스텝 제안",
    ],
    expectedTopics: [
      "팀 규모",
      "K8s 러닝커브",
      "운영 복잡도",
      "확장성",
      "모듈러 모놀리스",
    ],
  },
  {
    id: "security",
    name: "보안 취약점 분석",
    question: `다음 Node.js 결제 처리 코드를 보안 관점에서 분석해주세요:

\`\`\`javascript
app.post('/api/payment', async (req, res) => {
  const { userId, amount, cardNumber, cvv } = req.body;

  // 결제 처리
  const payment = await db.query(
    \`INSERT INTO payments (user_id, amount, card_last4)
     VALUES (\${userId}, \${amount}, '\${cardNumber.slice(-4)}')\`
  );

  // 외부 결제 게이트웨이 호출
  const result = await fetch('http://payment-gateway.com/charge', {
    method: 'POST',
    body: JSON.stringify({ card: cardNumber, cvv, amount })
  });

  // 로깅
  console.log(\`Payment processed: user=\${userId}, amount=\${amount}, card=\${cardNumber}\`);

  res.json({ success: true, paymentId: payment.id });
});
\`\`\`

질문:
1. 잠재적 보안 취약점은?
2. 각 취약점의 심각도는? (Critical/High/Medium/Low)
3. 수정 방안은?`,
    evaluationCriteria: [
      "SQL Injection 식별",
      "민감정보 로깅 문제 식별",
      "HTTPS 미사용 식별",
      "입력 검증 부재 식별",
      "CVV 저장/전송 문제 식별",
      "심각도 분류 정확성",
      "구체적인 수정 코드 제시",
    ],
    expectedTopics: [
      "SQL Injection",
      "로깅",
      "HTTPS",
      "PCI-DSS",
      "입력 검증",
      "prepared statement",
    ],
  },
  {
    id: "library",
    name: "라이브러리 선택",
    question: `2025년 기준, 새로운 크로스플랫폼 모바일 앱을 만들려고 합니다.

상황:
- 팀: 프론트엔드 개발자 3명 (React 경험 풍부, 네이티브 경험 없음)
- 앱 특성: 실시간 채팅 + 지도 + 카메라 기능 필요
- 출시 목표: iOS/Android 동시 출시, 6개월 내
- 성능: 60fps 스크롤, 부드러운 애니메이션 필수

선택지:
A) React Native
B) Flutter
C) Kotlin Multiplatform (KMP)

질문:
1. 어떤 것을 추천하시나요?
2. 각 선택지의 장단점은?
3. 우리 상황에서 가장 큰 리스크는?`,
    evaluationCriteria: [
      "팀 경험 고려한 추천",
      "실시간 채팅 구현 난이도 분석",
      "네이티브 기능(카메라, 지도) 접근성 비교",
      "성능(60fps) 달성 가능성 분석",
      "6개월 타임라인 현실성 평가",
      "각 선택지 장단점 공정하게 비교",
    ],
    expectedTopics: [
      "React 경험 활용",
      "Expo",
      "네이티브 브릿지",
      "Dart 러닝커브",
      "Hot Reload",
      "커뮤니티/생태계",
    ],
  },
  {
    id: "debug",
    name: "디버깅/원인 분석",
    question: `프로덕션에서 간헐적으로 다음 에러가 발생합니다 (하루 약 50건):

\`\`\`
Error: ECONNRESET
    at TLSSocket.onHangUp (_tls_wrap.js:1124:19)
    at Object.onceWrapper (events.js:416:28)
    at TLSSocket.emit (events.js:326:22)
    at endReadableNT (_stream_readable.js:1241:12)
    at processTicksAndRejections (internal/process/task_queues.js:82:21)
\`\`\`

환경:
- Node.js 18 + Express
- AWS ELB → EC2 (Auto Scaling)
- 외부 API 3개 호출 (결제, 배송, 알림)
- Redis 세션 스토어 사용
- 평균 응답 시간: 200ms, 에러 시: 30초 후 타임아웃

관찰된 패턴:
- 주로 피크 시간(오후 2-4시)에 발생
- 특정 API 엔드포인트에 집중되지 않음
- 재시도하면 대부분 성공

질문:
1. 가능한 원인들은?
2. 각 원인의 가능성은?
3. 디버깅을 위해 어떤 정보를 더 수집해야 하나요?
4. 임시 완화 방법은?`,
    evaluationCriteria: [
      "Connection Pool 고갈 가능성 언급",
      "ELB Idle Timeout 문제 언급",
      "외부 API 타임아웃 분석",
      "Keep-Alive 설정 확인 제안",
      "Redis 연결 문제 가능성",
      "구체적인 디버깅 단계 제시",
      "임시 완화책 제안",
    ],
    expectedTopics: [
      "Connection Pool",
      "Keep-Alive",
      "Idle Timeout",
      "Circuit Breaker",
      "Retry",
      "모니터링/메트릭",
    ],
  },
  {
    id: "refactor",
    name: "리팩토링 전략",
    question: `10년 된 Java 8 + Spring Boot 1.5 모놀리스를 현대화하려고 합니다.

현재 상태:
- 코드: 50만 줄, 테스트 커버리지 15%
- DB: 단일 MySQL, 300개 테이블
- 배포: 2주에 1번, 수동 배포 (3시간 소요)
- 장애: 월 2-3회 (주로 배포 직후)

목표:
- Java 21 + Spring Boot 3
- 테스트 커버리지 60% 이상
- CI/CD 파이프라인 구축
- 주 1회 배포 가능

제약:
- 팀: 6명 (모두 레거시에 익숙)
- 기간: 18개월
- 서비스 중단 최소화 필수

질문:
1. 권장하는 마이그레이션 전략은?
2. 어떤 순서로 진행해야 하나요?
3. 가장 큰 리스크와 대응 방안은?`,
    evaluationCriteria: [
      "빅뱅 vs 점진적 마이그레이션 분석",
      "Strangler Fig 패턴 언급",
      "테스트 우선 전략 제안",
      "Java 버전 단계별 업그레이드 계획",
      "Spring Boot 마이그레이션 주의점",
      "DB 마이그레이션 전략",
      "롤백 계획 포함",
      "현실적인 타임라인",
    ],
    expectedTopics: [
      "Strangler Fig",
      "테스트 커버리지",
      "CI/CD",
      "Feature Flag",
      "점진적 마이그레이션",
      "롤백",
    ],
  },
];

// ============================================
// 벤치마크 실행
// ============================================

interface BenchmarkResult {
  caseId: string;
  caseName: string;
  singleAI: {
    ai: AIName;
    response: string;
    timeMs: number;
  };
  multiParallel: {
    responses: AIResponse[];
    timeMs: number;
  };
  multiDebate: {
    rounds: { ai: AIName; content: string }[];
    conclusion: string;
    timeMs: number;
  };
  evaluation?: {
    singleScore: number;
    parallelScore: number;
    debateScore: number;
    topicsCovered: {
      single: string[];
      parallel: string[];
      debate: string[];
    };
  };
}

// 토론 실행 함수
async function runDebateForBenchmark(
  question: string,
  participants: AIName[]
): Promise<{ rounds: { ai: AIName; content: string }[]; conclusion: string }> {
  const state: DebateState = {
    topic: question,
    history: [{ role: "user", content: question }],
    round: 0,
    speakCounts: Object.fromEntries(participants.map(p => [p, 0])) as Record<AIName, number>,
  };

  const rounds: { ai: AIName; content: string }[] = [];

  // Phase 1: 각 AI 1회씩 발언
  for (const ai of participants) {
    state.round++;
    const historyStr = state.history.map(m => `[${m.role}] ${m.content}`).join("\n\n");
    const prompt = `현재 토론:\n주제: ${state.topic}\n\n지금까지 대화:\n${historyStr}\n\n발언권이 주어졌습니다. 주제에 대한 의견을 말씀해주세요.`;

    const response = await runAI(ai, prompt);
    rounds.push({ ai, content: response.content });
    state.history.push({ role: ai, content: response.content });
    state.speakCounts[ai]++;
  }

  // Phase 2: 반박 라운드 (최대 2회)
  const maxRebuttals = 2;
  for (let i = 0; i < maxRebuttals; i++) {
    state.round++;

    const historyStr = state.history.map(m => `[${m.role}] ${m.content}`).join("\n\n");
    const countsStr = Object.entries(state.speakCounts).map(([ai, count]) => `${ai}: ${count}회`).join(", ");

    const orchestratorPrompt = `AI 토론 진행자 (반박 라운드). 다음 중 하나를 결정하세요:
1. 반박/보충이 필요한 AI 선택 (action: "select")
2. 충분한 논의가 되었으면 종료 (action: "end")

주제: ${state.topic}
발언 횟수: ${countsStr}
참여자: ${participants.join(", ")}

대화 기록:
${historyStr}

판단 기준: 의견 대립이 있으면 반박 기회 제공, 합의가 형성되면 종료`;

    let action: OrchestratorAction;
    try {
      action = await runOrchestrator(orchestratorPrompt);
    } catch {
      // fallback: 종료
      action = { action: "end", conclusion: "토론 완료" };
    }

    if (action.action === "end") {
      return {
        rounds,
        conclusion: action.conclusion || "합의 도달",
      };
    }

    const selectedAI = (action.target as AIName) || participants[i % participants.length];
    const rebuttalPrompt = `현재 토론:\n주제: ${state.topic}\n\n지금까지 대화:\n${historyStr}\n\n반박 또는 보충 발언 기회입니다. 다른 AI 의견에 동의/반박/보충할 수 있습니다.`;

    const response = await runAI(selectedAI, rebuttalPrompt);
    rounds.push({ ai: selectedAI, content: response.content });
    state.history.push({ role: selectedAI, content: response.content });
    state.speakCounts[selectedAI]++;
  }

  return {
    rounds,
    conclusion: "최대 라운드 도달",
  };
}

async function runBenchmarkCase(
  testCase: BenchmarkCase,
  singleAI: AIName
): Promise<BenchmarkResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 ${testCase.name} (${testCase.id})`);
  console.log("=".repeat(60));

  const multiAIs: AIName[] = ["claude", "gemini", "codex"];

  // 1. 단일 AI 실행
  console.log(`\n[1/3] 단일 AI (${singleAI}) 실행 중...`);
  const singleStart = Date.now();
  const singleResponse = await runAI(singleAI, testCase.question);
  const singleTime = Date.now() - singleStart;
  console.log(`     완료 (${(singleTime / 1000).toFixed(1)}s)`);

  // 2. 멀티 AI 병렬 실행
  console.log(`\n[2/3] 멀티 AI 병렬 (${multiAIs.join(", ")}) 실행 중...`);
  const parallelStart = Date.now();
  const parallelResponses = await runAllParallel(multiAIs, testCase.question);
  const parallelTime = Date.now() - parallelStart;
  console.log(`     완료 (${(parallelTime / 1000).toFixed(1)}s)`);

  // 3. 멀티 AI 토론 실행
  console.log(`\n[3/3] 멀티 AI 토론 (${multiAIs.join(", ")}) 실행 중...`);
  const debateStart = Date.now();
  const debateResult = await runDebateForBenchmark(testCase.question, multiAIs);
  const debateTime = Date.now() - debateStart;
  console.log(`     완료 (${(debateTime / 1000).toFixed(1)}s, ${debateResult.rounds.length}라운드)`);

  // 결과 정리
  return {
    caseId: testCase.id,
    caseName: testCase.name,
    singleAI: {
      ai: singleAI,
      response: singleResponse.content,
      timeMs: singleTime,
    },
    multiParallel: {
      responses: parallelResponses,
      timeMs: parallelTime,
    },
    multiDebate: {
      rounds: debateResult.rounds,
      conclusion: debateResult.conclusion,
      timeMs: debateTime,
    },
  };
}

function analyzeTopics(response: string, expectedTopics: string[]): string[] {
  const found: string[] = [];
  const lowerResponse = response.toLowerCase();

  for (const topic of expectedTopics) {
    if (lowerResponse.includes(topic.toLowerCase())) {
      found.push(topic);
    }
  }
  return found;
}

function printResults(results: BenchmarkResult[], cases: BenchmarkCase[]) {
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                    📊 벤치마크 결과 요약 (3종 비교)                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  for (const result of results) {
    const testCase = cases.find(c => c.id === result.caseId)!;

    console.log(`\n┌──────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ 📋 ${result.caseName.padEnd(63)} │`);
    console.log(`├──────────────────────────────────────────────────────────────────────┤`);

    // 시간 비교
    const singleTime = (result.singleAI.timeMs / 1000).toFixed(1);
    const parallelTime = (result.multiParallel.timeMs / 1000).toFixed(1);
    const debateTime = (result.multiDebate.timeMs / 1000).toFixed(1);

    console.log(`│ ⏱️  응답 시간                                                         │`);
    console.log(`│    단일 AI:     ${singleTime.padStart(6)}s                                              │`);
    console.log(`│    병렬 모드:   ${parallelTime.padStart(6)}s                                              │`);
    console.log(`│    토론 모드:   ${debateTime.padStart(6)}s  (${result.multiDebate.rounds.length}라운드)                                  │`);

    // 토픽 커버리지
    const singleTopics = analyzeTopics(result.singleAI.response, testCase.expectedTopics);
    const parallelTopics = analyzeTopics(
      result.multiParallel.responses.map(r => r.content).join(" "),
      testCase.expectedTopics
    );
    const debateTopics = analyzeTopics(
      result.multiDebate.rounds.map(r => r.content).join(" "),
      testCase.expectedTopics
    );

    console.log(`│                                                                      │`);
    console.log(`│ 📝 주제 커버리지 (${testCase.expectedTopics.length}개 중)                                          │`);
    console.log(`│    단일 AI:   ${singleTopics.length}/${testCase.expectedTopics.length} - ${singleTopics.join(", ").slice(0, 40) || "(없음)"}`.padEnd(71) + `│`);
    console.log(`│    병렬 모드: ${parallelTopics.length}/${testCase.expectedTopics.length} - ${parallelTopics.join(", ").slice(0, 40) || "(없음)"}`.padEnd(71) + `│`);
    console.log(`│    토론 모드: ${debateTopics.length}/${testCase.expectedTopics.length} - ${debateTopics.join(", ").slice(0, 40) || "(없음)"}`.padEnd(71) + `│`);

    // 응답 길이
    const singleLen = result.singleAI.response.length;
    const parallelLen = result.multiParallel.responses.reduce((sum, r) => sum + r.content.length, 0);
    const debateLen = result.multiDebate.rounds.reduce((sum, r) => sum + r.content.length, 0);

    console.log(`│                                                                      │`);
    console.log(`│ 📏 응답 길이                                                          │`);
    console.log(`│    단일 AI:   ${singleLen.toLocaleString().padStart(6)}자                                            │`);
    console.log(`│    병렬 모드: ${parallelLen.toLocaleString().padStart(6)}자 (합계)                                      │`);
    console.log(`│    토론 모드: ${debateLen.toLocaleString().padStart(6)}자 (합계)                                      │`);

    // 토론 결론
    console.log(`│                                                                      │`);
    console.log(`│ 🎯 토론 결론: ${result.multiDebate.conclusion.slice(0, 50)}`.padEnd(71) + `│`);

    console.log(`└──────────────────────────────────────────────────────────────────────┘`);
  }

  // 총평
  console.log(`\n${"─".repeat(72)}`);
  console.log("📈 총평");
  console.log("─".repeat(72));

  let singleWins = 0;
  let parallelWins = 0;
  let debateWins = 0;

  for (const result of results) {
    const testCase = cases.find(c => c.id === result.caseId)!;
    const singleTopics = analyzeTopics(result.singleAI.response, testCase.expectedTopics);
    const parallelTopics = analyzeTopics(
      result.multiParallel.responses.map(r => r.content).join(" "),
      testCase.expectedTopics
    );
    const debateTopics = analyzeTopics(
      result.multiDebate.rounds.map(r => r.content).join(" "),
      testCase.expectedTopics
    );

    const scores = [
      { name: "단일", score: singleTopics.length },
      { name: "병렬", score: parallelTopics.length },
      { name: "토론", score: debateTopics.length },
    ].sort((a, b) => b.score - a.score);

    if (scores[0].name === "단일" && scores[0].score > scores[1].score) singleWins++;
    else if (scores[0].name === "병렬" && scores[0].score > scores[1].score) parallelWins++;
    else if (scores[0].name === "토론" && scores[0].score > scores[1].score) debateWins++;
  }

  console.log(`주제 커버리지 승리: 단일 ${singleWins}건 / 병렬 ${parallelWins}건 / 토론 ${debateWins}건`);
  console.log(`\n⚠️  주의: 이것은 자동 분석입니다. 실제 품질 평가는 수동으로 해야 합니다.`);
}

function printDetailedComparison(results: BenchmarkResult[]) {
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    📝 상세 응답 비교                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  for (const result of results) {
    console.log(`\n${"═".repeat(65)}`);
    console.log(`📋 ${result.caseName}`);
    console.log("═".repeat(65));

    // 단일 AI
    console.log(`\n${"─".repeat(65)}`);
    console.log(`🔹 단일 AI (${result.singleAI.ai})`);
    console.log("─".repeat(65));
    console.log(result.singleAI.response.slice(0, 1200) + (result.singleAI.response.length > 1200 ? "\n...(생략)" : ""));

    // 병렬 모드
    console.log(`\n${"─".repeat(65)}`);
    console.log(`🔸 병렬 모드`);
    console.log("─".repeat(65));
    for (const resp of result.multiParallel.responses) {
      console.log(`\n[${resp.ai}]`);
      console.log(resp.content.slice(0, 600) + (resp.content.length > 600 ? "\n...(생략)" : ""));
    }

    // 토론 모드
    console.log(`\n${"─".repeat(65)}`);
    console.log(`🔶 토론 모드 (${result.multiDebate.rounds.length}라운드)`);
    console.log("─".repeat(65));
    for (let i = 0; i < result.multiDebate.rounds.length; i++) {
      const round = result.multiDebate.rounds[i];
      const isRebuttal = i >= 3;
      console.log(`\n[Round ${i + 1}] ${round.ai} ${isRebuttal ? "(반박)" : ""}`);
      console.log(round.content.slice(0, 500) + (round.content.length > 500 ? "\n...(생략)" : ""));
    }
    console.log(`\n🎯 결론: ${result.multiDebate.conclusion}`);
  }
}

// ============================================
// 메인
// ============================================

async function main() {
  const singleAI = (values.single || "claude") as AIName;

  // 실행할 케이스 필터링
  let casesToRun = BENCHMARK_CASES;
  if (values.case) {
    casesToRun = BENCHMARK_CASES.filter(c => c.id === values.case);
    if (casesToRun.length === 0) {
      console.error(`Unknown case: ${values.case}`);
      console.error(`Available: ${BENCHMARK_CASES.map(c => c.id).join(", ")}`);
      process.exit(1);
    }
  }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           🧪 obora 벤치마크: 단일 AI vs 멀티 AI              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n단일 AI: ${singleAI}`);
  console.log(`멀티 AI: claude, gemini, codex (병렬)`);
  console.log(`테스트 케이스: ${casesToRun.length}개`);

  const results: BenchmarkResult[] = [];

  for (const testCase of casesToRun) {
    try {
      const result = await runBenchmarkCase(testCase, singleAI);
      results.push(result);
    } catch (error) {
      console.error(`\n❌ ${testCase.name} 실패:`, error);
    }
  }

  // 결과 출력
  printResults(results, casesToRun);
  printDetailedComparison(results);

  // 파일 저장
  if (values.output) {
    await Bun.write(values.output, JSON.stringify(results, null, 2));
    console.log(`\n💾 결과 저장: ${values.output}`);
  }

  // 평가 가이드
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    📋 수동 평가 가이드                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`
각 케이스에 대해 다음을 평가해주세요 (1-5점):

1. 정확성: 기술적으로 정확한가?
2. 완전성: 중요한 포인트를 놓치지 않았는가?
3. 실용성: 실제로 적용할 수 있는 조언인가?
4. 균형성: 장단점을 공정하게 다루었는가?
5. 통찰력: 새로운 관점이나 인사이트가 있는가?

평가 후 docs/benchmark-evaluation.md에 결과를 기록해주세요.
`);
}

main().catch(console.error);
