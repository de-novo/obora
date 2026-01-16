## 구독 기반 사용 리서치 (vibe coding 대상)

목표: API 키 없이 **기존 구독**으로 에이전트 실행이 가능한지 조사하고,
OAuth 기반 우회 사용은 **최후의 수단**으로 두기 위한 근거를 문서화한다.

### 범위

- 현재: Claude Code / Claude Agent SDK
- 추후: Codex, Gemini 등 다중 에이전트 지원
- 정책: **OAuth 우회 방식은 ToS 리스크가 높아 우선 제외**

---

## 1) Claude (Claude Code / Claude Agent SDK)

### 확인된 사실 (공식 문서 기준)

- 구독(Plan)과 API 과금은 분리됨.  
  구독이 있어도 API 사용은 별도 과금일 수 있음.  
  출처: https://support.claude.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console

- Claude Code 관련 SDK 문서 및 패키지 안내가 존재.  
  출처: https://docs.claude.com/en/docs/claude-code

- Claude Code 제품 페이지 및 요금제 정보는 별도 제공.  
  출처: https://claude.com/product/claude-code  
  출처: https://claude.com/pricing

- Claude Code는 Pro/Max 구독에서 CLI 사용이 가능함.  
  출처: https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan

### 확인된 사실 (코드베이스 검증)

- obora는 Claude Agent SDK 기반으로 워크플로우를 실행 중이며,
  CLI 로그인 기반 구독 인증 흐름이 동작함을 확인함.
  (내부 확인: 사용자 입력 기준)

### 커뮤니티 기반 정보 (참고용)

다음은 커뮤니티/레딧 기반이라 **정책 변경 가능성**이 있으며 신뢰도는 낮다.
Obora 정책 결정 시 공식 문서를 최우선으로 참고해야 함.

- Pro/Max 계정으로 CLI에서 로그인 인증이 가능한 경우가 있다는 보고
- 자동화/CI 환경에서는 API 키가 필요하다는 보고

---

## 2) OpenAI (ChatGPT 구독 vs API)

### 확인된 사실 (공식 문서 기준)

- ChatGPT 구독(Plus 등)은 **API 사용을 포함하지 않음**.  
  _“API usage is separate and billed independently.”_ 명시.  
  출처: https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus

- ChatGPT 플랫폼과 API 플랫폼은 **별도 청구/계정**으로 운영됨.  
  출처: https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform

- ChatGPT 구독을 API로 “전환”하는 것이 아니라, **API는 별도 과금 제품**임.  
  출처: https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api

### Codex 관련 (공식 문서 기준)

- Codex는 ChatGPT Plus/Pro/Business/Edu/Enterprise 구독 플랜에 포함됨.  
  출처: https://help.openai.com/en/articles/11369540-codex-in-chatgpt

- Codex CLI/IDE 확장은 **ChatGPT 로그인** 또는 **API 키 로그인**을 지원하며,  
  API 키 사용 시 OpenAI 플랫폼 계정 기준으로 과금됨.  
  출처: https://developers.openai.com/codex/auth  
  출처: https://developers.openai.com/codex/pricing

---

## 3) Gemini (구독 vs API)

### 확인된 사실 (공식 문서 기준)

- Gemini API는 **API 키/프로젝트 기반**으로 제공되며, 사용량 기반 과금(Free tier + Pay‑as‑you‑go) 구조.  
  출처: https://ai.google.dev/gemini-api/docs/billing

- Gemini API는 **API 키 발급/인증**을 전제.  
  출처: https://ai.google.dev/gemini-api/docs/api-key

### 구독과 API 분리 판단 근거 (공식 문서)

- Gemini 구독(Advanced/Pro/Ultra 등)은 **앱/웹 UI 중심의 구독 제품**으로 안내되며,  
  API 포함 여부가 공식적으로 언급되지 않음.  
  출처: https://gemini.google/subscriptions

→ 공식 문서 기준으로는 **구독과 API가 별도 제품/체계**로 운영됨이 확인됨.  
 (API는 키/빌링 필요, 구독 페이지에는 API 포함/크레딧 언급 없음)

---

## 4) OpenCode / Oh My OpenCode (오픈소스)

### 확인된 사실 (공식/프로젝트 문서 기준)

- OpenCode는 **터미널 기반 AI 코딩 에이전트**로 공개된 오픈소스 프로젝트.  
  출처: https://github.com/anomalyco/opencode

- OpenCode는 **provider-agnostic**을 지향하며 Claude/OpenAI/Google 등 다양한 모델 사용을 강조.  
  기본으로 **LSP 지원**, **TUI 중심**, **클라이언트/서버 아키텍처**를 제공.  
  출처: https://github.com/anomalyco/opencode

- OpenCode 기본 에이전트(예: `build`, `plan`)와 서브에이전트가 포함됨.  
  출처: https://github.com/anomalyco/opencode

- 에이전트 전환은 **Tab 키**로 가능하며, `plan` 에이전트는 읽기 전용(파일 편집 금지, bash 실행 시 권한 요청).  
  또한 `@general` 서브에이전트를 호출해 복잡한 탐색/다단계 작업을 수행할 수 있음.  
  출처: https://github.com/anomalyco/opencode

- 서브 에이전트는 **기본 에이전트가 특정 작업을 위해 호출하는 전문 보조 에이전트**이며,  
  메시지에서 `@멘션`으로 수동 호출 가능.  
  OpenCode에는 **General**, **Explore** 내장 서브 에이전트가 포함됨.  
  출처: https://github.com/anomalyco/opencode

- OpenCode의 **OAuth 사용 여부는 README에 명시되지 않음** → 별도 문서(인증/로그인 섹션) 확인 필요.  
  출처: https://github.com/anomalyco/opencode

- Oh My OpenCode는 OpenCode 위에 구축된 **오케스트레이션 레이어**로,  
  멀티 에이전트, 훅, MCP, LSP 지원을 강조함.  
  출처: https://ohmyopencode.com/

- OpenCode 문서에는 **도구 권한 및 도구 통합** 관련 안내가 존재.  
  출처: https://opencode.ai/docs/tools

### 참고 사항

- 위 프로젝트들은 오픈소스/커뮤니티 성격이 강하므로,  
  **모델 제공자의 구독/약관/인증 정책은 별도로 확인**해야 함.

---

## 5) Multi-model workflow 참고 자료 (공식/학술 중심)

다중 모델을 조합하는 워크플로우를 구축하기 위한 **공식 문서/학술 레퍼런스**를 정리한다.

### OpenAI (공식 문서)

- Agents SDK 멀티 에이전트 예시:  
  https://developers.openai.com/cookbook/examples/agents_sdk/multi-agent-portfolio-collaboration/multi_agent_portfolio_collaboration
- Agents SDK 모델 설정/커스텀 프로바이더 개요:  
  https://openai.github.io/openai-agents-python/models/
- Agent Builder 가이드 (시각적 워크플로우/에이전트 구성 개요):  
  https://platform.openai.com/docs/guides/agent-builder
- 에이전트 구축 도구 소개 (Responses/Tools):  
  https://openai.com/index/new-tools-for-building-agents/

### Anthropic (공식 문서)

- Agent SDK Overview (인증/워크플로우/도구 개요):  
  https://docs.claude.com/en/docs/agent-sdk/overview
- Skills (워크플로우 분리/재사용 단위):  
  https://docs.claude.com/en/api/agent-sdk/skills

### 학술/연구 참고 (워크플로우 최적화/멀티에이전트)

- Cognify: hierarchical autotuning (워크플로우 비용/성능 최적화)  
  https://arxiv.org/abs/2502.08056
- EvoFlow: 자동화된 workflow evolution  
  https://arxiv.org/abs/2502.07373
- FlowAgent: 절차 준수 + 유연성 병행  
  https://arxiv.org/abs/2502.14345

---

## 6) 모델 조합 설계 원칙 (초안)

1. **역할 기반 모델 분리**
   - Router / Planner / Implementer / Verifier 등 역할에 따라 모델 선택

2. **비용·지연 최적화**
   - 초안/요약: 경량 모델
   - 최종 출력/검증: 고성능 모델

3. **검증 루프 포함**
   - Reviewer/Validator 단계를 분리해 누락/오류 감소

4. **Provider 추상화**
   - Claude/OpenAI/Gemini 등 공급자별 인증/도구 체계를 분리

---

## Obora 정책 정리 (현재 결론)

1. OAuth 우회 방식(예: 서드파티 앱을 통한 계정 인증)은 **ToS 리스크가 높음**  
   → 공식 문서로 명시되기 전까지는 사용 금지 또는 최후 수단

2. Claude는 **구독과 API 과금이 분리**될 수 있다는 점을 명시  
   → 구독만으로 완전한 자동화가 불가능할 수 있음

3. OpenAI/Gemini는 **공식 문서 기준 구독과 API 분리 확인**  
   → Codex는 구독 포함 + API 키 사용 가능(별도 과금)으로 정리

---

## TODO (후속 리서치 체크리스트)

- [ ] OAuth 기반 접근의 ToS 허용 범위 확인 (각 벤더별)
