---
status: confirmed
owner: denovo
project: obora-kit
created: "2026-02-16"
updated: "2026-02-17"
links:
  - "[[projects/obora-kit/INDEX]]"
  - "[[projects/obora-kit/ARCHITECTURE]]"
  - "[[projects/obora-kit/m1-runtime-core-design]]"
---

# Obora Schemas & Interfaces (확정)

본 문서는 Obora를 **AI Control Runtime**으로 고정하기 위한 스키마/인터페이스 SSOT입니다.
핵심 원칙은 다음과 같습니다.

- Orchestrator는 결정적 코드
- AI 비결정성은 Cell 내부로 격리
- 정책/합의/복구는 선언적 스키마로 통제
- 빌트인도 플러그인으로 교체 가능
- 모든 실행은 감사 이벤트로 재구성 가능

---

## 1) Workflow YAML 전체 스키마 (Confirmed)

```yaml
name: string
version: string
policy?: string

steps:
  - name: string
    agent: string
    description?: string
    tools?: string[]
    timeout?: string
    config?: Record<string, unknown>
    depends_on?: string[]
    inputs?: string[]
    outputs?: string[]
    bindings?:
      - source: string
        target: string
        transform?: string
        condition?: string
    discussion?:
      max_rounds?: number
      convergence?: "no_disagreements" | "majority" | "unanimous" | "custom"
      on_deadlock?: "escalate" | "retry" | "fail"
    consensus?:
      rule: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom"
      voters?:
        - id: string
          weight?: number
          role?: "ai" | "human" | "service"
          required?: boolean
      min?: number
      of?: number
      threshold?: number
      timeout?: string
      best_effort?: string[]
      custom?: string
    gate?: "human-approval" | "consensus" | "external"
    gate_config?:
      timeout?: string
      fallback?: "fail" | "escalate" | "auto-approve"
      escalation_to?: string
    pattern?: string
    participants?: Record<string, string>
    policy?:
      sandbox?: string
      tools_override?:
        - name: string
          effect: "allow" | "deny" | "transform" | "gate"

recovery?:
  [stepName: string]:
    on_fail: "retry" | "rollback" | "escalate" | "alternative" | "custom"
    max_retries?: number
    backoff?: "linear" | "exponential"
    backoff_base?: string
    to?: string
    fallback?:
      name: string
      agent: string
      description?: string
      tools?: string[]
      timeout?: string
      config?: Record<string, unknown>
    custom?: string

audit?:
  store: "duckdb" | "sqlite" | "custom"
  path?: string
  retention?: string
  custom?: string
```

### 1.1 타입 정의 (TypeScript)

```ts
export interface WorkflowDefinition {
  name: string;
  version: string;
  policy?: string;
  steps: StepDefinition[];
  recovery?: Record<string, RecoveryStrategyConfig>;
  audit?: AuditConfig;
}

export interface StepDefinition {
  name: string;
  agent: string;
  description?: string;
  tools?: string[];
  timeout?: string;
  config?: Record<string, unknown>;
  depends_on?: string[];
  inputs?: string[];
  outputs?: string[];
  bindings?: StateBinding[];
  discussion?: DiscussionConfig;
  consensus?: ConsensusConfig;
  gate?: GateType;
  gate_config?: GateConfig;
  pattern?: string;
  participants?: Record<string, string>;
  policy?: PolicyOverride;
}

export interface CustomPatternDefinition {
  name: string;
  version?: string;
  kind?: string; // default: name
  description?: string;
  execute: (context: PatternRuntimeContext) => Promise<PatternPayloadResult>;
  validateConfig?: (config: PatternConfig) => void;
}

export interface DiscussionConfig {
  max_rounds?: number;
  convergence?: "no_disagreements" | "majority" | "unanimous" | "custom";
  on_deadlock?: "escalate" | "retry" | "fail";
  custom_convergence?: CustomConvergenceFn;
}

export interface ConsensusConfig {
  rule?: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom";
  voters?: VoterSpec[];
  min?: number;
  of?: number;
  threshold?: number;
  timeout?: string;
  best_effort?: string[];
  custom?: string;
  custom_evaluate?: CustomEvaluator;
}

export interface ApprovalStage {
  name: string;
  approvers: string[];
  required: number;
  timeout?: string;
  fallback?: "fail" | "escalate" | "auto-approve";
  escalation_to?: string;
  condition?: string;
}

export interface MultiStageGateConfig {
  stages: ApprovalStage[];
  on_reject?: "fail" | "restart" | "reassign";
  allow_comments?: boolean;
  track_history?: boolean;
}

export interface ApprovalDecision {
  stageIndex: number;
  stageName: string;
  approver: string;
  decision: "approved" | "rejected" | "abstained";
  comment?: string;
  timestamp: Date;
}

export interface GateAssignment {
  gateId: string;
  stepName: string;
  assignedTo: string;
  assignedAt: Date;
  expiresAt?: Date;
  status: "pending" | "completed" | "expired" | "reassigned";
  reassignedFrom?: string;
  reassignmentReason?: string;
}

export interface SLAConfig {
  timeout: string;
  warning_at?: string;
  fallback: "fail" | "escalate" | "auto-approve";
  escalation_chain?: string[];
}

// Discussion custom convergence
export type CustomConvergenceFn = (context: {
  round: number;
  opinions: Record<string, string>;
  participants: string[];
}) => boolean;

// Consensus custom evaluate
export type CustomEvaluator = (context: {
  votes: NormalizedVote[];
  participants: string[];
  requiredParticipants: string[];
  config: ConsensusPatternConfig;
}) => boolean | { approved: boolean; reason?: string; score?: number };

// Brainstorm input shape
export interface BrainstormInput {
  topic?: string;
  ideas?: Record<string, string | string[]>; // participant → idea(s)
  evaluations?: Record<string, Record<string, number>>; // participant → { ideaText → score }
}

// Brainstorming pattern config
export interface BrainstormingPatternConfig {
  phase_1?: "generate";
  phase_2?: "evaluate";
  top_n?: number;
  dedup?: "semantic" | "exact";
}

// Fan-out-fan-in input shape
export interface FanOutFanInInput {
  task?: unknown;
  items?: unknown[];
  responses?: Record<string, unknown>;
}

// Fan-out-fan-in pattern config
export interface FanOutFanInPatternConfig {
  merge?: "concatenate" | "rank" | "vote" | "custom";
}

// Composite stage spec
export interface CompositeStage {
  name: string;
  pattern: string;
  config?: Record<string, unknown>;
  participants?: Record<string, string>;
  // participants merge strategy: REPLACE (not merge).
  // If stage.participants is defined, it fully replaces the parent context.participants.
  // If omitted, inherits from parent context.
  input_from?: "previous" | "root" | string;
}

// Composite pattern config
export interface CompositePatternConfig {
  stages: CompositeStage[];
  on_stage_failure?: "fail" | "skip" | "escalate";
}

// Red-blue input shape
export interface RedBlueInput {
  subject?: unknown;
  rounds?: Array<{
    red_findings?: Record<string, unknown>;
    blue_responses?: Record<string, unknown>;
  }>;
}

// Peer-review input shape
export interface PeerReviewInput {
  subject?: unknown; // 리뷰 대상 산출물
  startedAt?: string | Date; // 타임아웃 기준 시작 시각
  reviews?: Record<
    string,
    {
      score: number;
      issues?: Array<{ severity: "P0" | "P1" | "P2"; description: string }>;
    }
  >;
  rounds?: Array<{
    reviews?: Record<
      string,
      {
        score: number;
        issues?: Array<{ severity: "P0" | "P1" | "P2"; description: string }>;
      }
    >;
  }>;
}

// Peer-review pattern config
export interface PeerReviewPatternConfig {
  min_score?: number; // default: 0 (점수 제한 없음)
  p0_allowed?: number; // default: 0 (P0 이슈 0개 허용)
  max_rounds?: number;
  best_effort?: string[]; // quorum 제외 대상 reviewer ids
}

// Supervisor input shape
export interface SupervisorInput {
  tasks?: Record<string, unknown>;
  results?: Record<string, { success: boolean; output?: unknown; error?: string }>;
}

// Generate 커스텀 함수
export type BrainstormGenerateFn = (
  participant: string,
  input: { topic?: string; ideas?: Record<string, unknown> },
  context: PatternRuntimeContext
) => Promise<string[]> | string[];

// Semantic dedup 커스텀 함수
export type BrainstormSemanticDedupFn = (
  ideas: Array<{ id: string; text: string; generated_by: string }>,
  context: PatternRuntimeContext
) => Promise<IdeaRecord[]> | IdeaRecord[];

// 랭킹 커스텀 함수
export type BrainstormRankFn = (
  ideas: IdeaRecord[],
  participants: string[],
  input: BrainstormInput,
  context: PatternRuntimeContext
) =>
  | Promise<
      Array<{
        id: string;
        text: string;
        generated_by: string;
        score: number;
        scores_by_participant: Record<string, number>;
      }>
    >
  | Array<{
      id: string;
      text: string;
      generated_by: string;
      score: number;
      scores_by_participant: Record<string, number>;
    }>;
```

### 1.1.1 Brainstorm 커스텀 함수 우선순위 및 fallback

- 커스텀 함수 우선순위: **context 주입 함수 > config 기반 기본 동작**
  - generate: `context.brainstormGenerateIdeas`가 있으면 우선 사용
  - semantic dedup: `context.brainstormSemanticDedup`가 있으면 우선 사용
  - rank: `context.brainstormRankIdeas`가 있으면 우선 사용
- `dedup: "semantic"`인데 `brainstormSemanticDedup` 함수가 미주입이면, 런타임은 **exact dedup으로 fallback**합니다.

### 1.1.2 PeerReview 규약 (Quorum / 종료 상태 / best_effort)

#### Quorum 규칙

- required 리뷰어 = `participants`에서 `best_effort`를 제외한 전원
- quorum = **라운드 단위**로 required 리뷰어 전원 응답
- `best_effort` 리뷰어는 응답 시 점수/이슈 집계에 포함, 미응답 시 quorum 판정에서 제외
- quorum 미달 시 다음 라운드로 진행 (`max_rounds` 내)
- `max_rounds` 소진 + quorum 미달 시 `success:false` + `reason:"quorum_not_met"`

#### 종료 상태 계약 (에러 채널 규약)

- `return success:false` (비즈니스 실패)
  - 평균 점수(`avg score`) `< min_score` → `reason:"score_below_threshold"`
  - P0 개수 `> p0_allowed` → `reason:"p0_exceeded"`
  - `max_rounds` 소진 + quorum 미달 → `reason:"quorum_not_met"`
  - 위 비즈니스 실패는 `output.error_codes`에 `CONSENSUS_FAIL` 포함
- `throw` (외부 제약 위반)
  - `startedAt + config.timeout` 초과 → `CONSENSUS_TIMEOUT`
- 본 채널 규약은 M2-02+03에서 확립한 패턴 런타임 에러 채널과 동일

#### best_effort 역할

- `best_effort`는 참가자 ID 목록
- 해당 리뷰어의 미응답은 quorum에 영향 없음
- 응답한 `best_effort` 리뷰어의 점수/이슈는 평균/집계에 포함
- `p0_allowed` 판정에도 `best_effort` 리뷰의 P0 이슈 포함

#### Pass 조건

- `p0_allowed` 기본값: `0` (P0 이슈 0개 허용)
- `min_score` 기본값: `0` (점수 제한 없음)
- 최종 판정: `(전체 리뷰어 평균 score >= min_score) AND (전체 P0 이슈 수 <= p0_allowed)`

### 1.2 필드 상세 표

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `name` | `string` | 필수 | 없음 | 워크플로우 식별 이름 | `"code-review-pipeline"` |
| `version` | `string` | 필수 | 없음 | 워크플로우 스펙 버전 | `"1.0.0"` |
| `policy` | `string` | 선택 | 런타임 기본 정책 | 워크플로우 레벨 정책 YAML 경로 | `"./policies/prod.yaml"` |
| `steps` | `StepDefinition[]` | 필수 | 없음 | 실행 DAG 구성 단위 | `[ { name: "generate", ... } ]` |
| `recovery` | `Record<string, RecoveryStrategyConfig>` | 선택 | 글로벌 기본 복구 | step별 실패 복구 선언 | `review: { on_fail: "escalate", to: "human" }` |
| `audit` | `AuditConfig` | 선택 | `{store:"duckdb", path:"./audit.db"}` | 감사 저장 정책 | `{ store: "duckdb", retention: "90d" }` |

#### StepDefinition

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `steps[].name` | `string` | 필수 | 없음 | step 고유 이름 | `"deploy"` |
| `steps[].agent` | `string` | 필수 | 없음 | 실행할 에이전트 ID | `"reviewer"` |
| `steps[].description` | `string` | 선택 | `""` | step 의도 설명 | `"3-model peer review"` |
| `steps[].tools` | `string[]` | 선택 | agent 기본 도구 세트 | 사용 허용 도구 화이트리스트 | `["file_read", "file_write"]` |
| `steps[].timeout` | `string` | 선택 | 정책 timeout | step 최대 실행 시간 | `"10m"` |
| `steps[].config` | `Record<string,unknown>` | 선택 | `{}` | agent 별 동작 설정 | `{ temperature: 0.2 }` |
| `steps[].depends_on` | `string[]` | 선택 | `[]` | 선행 step 의존성 | `["generate"]` |

`depends_on` 형식은 **문자열 배열(string[])**입니다. 단일 의존성도 배열로 표기합니다.

```yaml
steps:
  - name: review
    agent: reviewer
    depends_on: [generate]    # ✅ string[]

  - name: deploy
    agent: deployer
    depends_on:
      - review
      - security-check        # ✅ string[] (block style)
```
| `steps[].inputs` | `string[]` | 선택 | `[]` | 입력 아티팩트 경로/키 | `["knowledge.spec"]` |
| `steps[].outputs` | `string[]` | 선택 | `[]` | 출력 아티팩트 경로/키 | `["knowledge.code"]` |
| `steps[].bindings` | `StateBinding[]` | 선택 | `[]` | CellResult → Blackboard 매핑 | `[{source:"output.files",target:"knowledge.generated_code"}]` |
| `steps[].discussion` | `DiscussionConfig` | 선택 | 없음 | step 토론 라운드/수렴 규칙 | `{ max_rounds:3, convergence:"majority" }` |
| `steps[].consensus` | `ConsensusConfig` | 선택 | 없음 | step 후 합의 평가 규칙 | `{ rule:"majority", min:2, of:3 }` |
| `steps[].gate` | `GateType` | 선택 | 없음 | 실행/진행 전 게이트 유형 | `"human-approval"` |
| `steps[].gate_config` | `GateConfig` | 선택 | `{fallback:"fail"}` | 게이트 타임아웃/대응 | `{timeout:"24h",fallback:"escalate"}` |
| `steps[].pattern` | `string` | 선택 | `"pipeline"`(orchestrator 기본) | 협업 패턴명(M2+) | `"fan-out-fan-in"` |
| `steps[].participants` | `Record<string,string>` | 선택 | `{}` | 패턴 역할→에이전트 매핑 | `{ reviewerA:"opus", reviewerB:"codex" }` |
| `steps[].policy` | `PolicyOverride` | 선택 | 없음 | step 단위 정책 오버라이드 | `{ sandbox:"./output" }` |

#### StateBinding

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `source` | `string` | 필수 | 없음 | `CellResult` JSONPath | `"output.summary"` |
| `target` | `string` | 필수 | 없음 | Blackboard 경로 | `"knowledge.generation_summary"` |
| `transform` | `string` | 선택 | identity | 변환 플러그인/함수명 | `"toMarkdown"` |
| `condition` | `string` | 선택 | 항상 true | 조건식 true일 때만 반영 | `"value != null"` |

#### DiscussionConfig

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `max_rounds` | `number` | 선택 | `3` | 최대 라운드 수 | `3` |
| `convergence` | enum | 선택 | `"no_disagreements"` | 수렴 판정 규칙 | `"majority"` |
| `on_deadlock` | enum | 선택 | `"fail"` | 최대 라운드 도달 시 처리 | `"escalate"` |
| `custom_convergence` | `CustomConvergenceFn` | 선택 | 없음 | custom 수렴 함수 | `(ctx) => ctx.round >= 2` |

#### ConsensusConfig / VoterSpec

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `rule` | enum | 필수 | 없음 | 합의 알고리즘 | `"weighted"` |
| `voters` | `VoterSpec[]` | 선택 | step participants 자동 추론 | 투표자 정의 | `[{id:"opus",weight:0.4}]` |
| `min` | `number` | 선택 | 다수결 최소값 추론 | 최소 필요 승인/투표수 | `2` |
| `of` | `number` | 선택 | `voters.length` | 모수 정의 | `3` |
| `threshold` | `number` | 선택 | `0.5` 또는 rule별 기본 | 점수 임계치 | `0.9` |
| `timeout` | `string` | 선택 | 정책 gate timeout | 합의 대기 시간 | `"5m"` |
| `best_effort` | `string[]` | 선택 | `[]` | 실패 무시 voter IDs | `["glm-5"]` |
| `custom` | `string` | 선택 | 없음 | custom rule 플러그인 경로 | `"plugins/consensus/highRisk.ts"` |
| `custom_evaluate` | `CustomEvaluator` | 선택 | 없음 | custom 평가 함수 | `(ctx) => ({ approved: true, score: 0.9 })` |

#### GateConfig / PolicyOverride / Recovery / Audit

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `gate_config.timeout` | `string` | 선택 | 정책 gate timeout | 승인 대기 제한 | `"24h"` |
| `gate_config.fallback` | enum | 선택 | `"fail"` | timeout/실패 시 동작 | `"escalate"` |
| `gate_config.escalation_to` | `string` | 선택 | 없음 | 에스컬레이션 대상 채널/역할 | `"human-oncall"` |
| `policy.sandbox` | `string` | 선택 | workflow sandbox | step 샌드박스 루트 override | `"./tmp/review"` |
| `policy.tools_override` | `ToolPolicy[]` | 선택 | 없음 | step 단위 툴 정책 override | `[{name:"shell_exec",effect:"deny"}]` |
| `recovery[step].on_fail` | enum | 필수 | 없음 | 실패 시 주 전략 | `"retry"` |
| `recovery[step].max_retries` | `number` | 선택 | `0` | retry 횟수 | `2` |
| `recovery[step].backoff` | enum | 선택 | `"linear"` | retry 지수/선형 | `"exponential"` |
| `recovery[step].backoff_base` | `string` | 선택 | `"1s"` | backoff 기준 간격 | `"2s"` |
| `recovery[step].to` | `string` | 선택 | 없음 | escalate 대상 | `"human"` |
| `recovery[step].fallback` | `StepDefinition` | 선택 | 없음 | alternative step 정의 | `{name:"manual-review",agent:"human"}` |
| `recovery[step].custom` | `string` | 선택 | 없음 | custom recovery 핸들러 | `"plugins/recovery/safeRollback.ts"` |
| `audit.store` | enum | 필수 | `duckdb` | 감사 저장소 종류 | `"duckdb"` |
| `audit.path` | `string` | 선택 | `./audit.db` | 저장 파일/DSN | `"./var/audit.db"` |
| `audit.retention` | `string` | 선택 | `"90d"` | 보존 기간 | `"180d"` |
| `audit.custom` | `string` | 선택 | 없음 | custom store 플러그인 | `"plugins/audit/clickhouse.ts"` |

---

## 2) Policy YAML 전체 스키마 (Confirmed)

```yaml
version: string

tools:
  - name: string
    effect: "allow" | "deny" | "transform" | "gate"
    when?:
      matches?: string[]
      not_matches?: string[]
      condition?: string   # Policy DSL expression
    transform?:
      fn: string
    gate?:
      type: "human-approval" | "consensus" | "external"
      timeout?: string

sandbox:
  root: string
  deny_outside_root: boolean
  deny_patterns?: string[]
  max_file_size?: string

resources:
  timeout_ms?: number
  max_tokens?: number
  max_cost_usd?: number
  max_tool_calls?: number
  max_output_size?: string
  dynamic_quota?:
    limits:
      - field: "tokens" | "cost" | "tool_calls" | "duration_ms"
        condition: string
        limit: number
        action: "deny" | "warn" | "gate"

dynamic_tool_rules?:
  - name: string
    condition: string
    effect: "allow" | "deny" | "transform" | "gate"
    priority?: number

gates:
  - step: string
    type: "human-approval" | "consensus" | "external"
    required: boolean
    timeout?: string
    fallback?: "fail" | "escalate"

network?:
  allow_outbound: boolean
  allow_hosts?: string[]
  deny_hosts?: string[]
```

### 2.1 필드 상세 표

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `version` | `string` | 필수 | 없음 | 정책 스키마 버전 | `"1.0"` |
| `tools` | `ToolPolicy[]` | 필수 | `[]` | 도구 단위 효과 정책 | `[{name:"file_write",effect:"allow"}]` |
| `sandbox.root` | `string` | 필수 | 없음 | 파일 접근 허용 루트 | `"./output"` |
| `sandbox.deny_outside_root` | `boolean` | 필수 | `true` | 루트 밖 접근 차단 여부 | `true` |
| `sandbox.deny_patterns` | `string[]` | 선택 | `[]` | 글롭 기반 추가 차단 | `["*.env", "**/secrets/**"]` |
| `sandbox.max_file_size` | `string` | 선택 | 없음 | 파일 쓰기 최대 크기 | `"5mb"` |
| `resources.timeout_ms` | `number` | 선택 | 없음 | 전체 실행 제한시간 | `600000` |
| `resources.max_tokens` | `number` | 선택 | 없음 | 총 토큰 예산 | `120000` |
| `resources.max_cost_usd` | `number` | 선택 | 없음 | 비용 상한(USD) | `10` |
| `resources.max_tool_calls` | `number` | 선택 | 없음 | 도구 호출 횟수 상한 | `100` |
| `resources.max_output_size` | `string` | 선택 | 없음 | 출력 payload 크기 제한 | `"2mb"` |
| `resources.dynamic_quota` | `DynamicQuotaConfig` | 선택 | 없음 | 조건 기반 동적 리소스 제한 | `{limits:[{field:"cost",condition:"execution.totalCost>5",limit:6,action:"deny"}]}` |
| `dynamic_tool_rules` | `DynamicToolRule[]` | 선택 | `[]` | 조건 기반 동적 툴 정책 | `[{name:"shell_exec",condition:"execution.totalCost>5",effect:"deny",priority:10}]` |
| `gates` | `GatePolicy[]` | 선택 | `[]` | step별 필수 게이트 정책 | `[{step:"deploy",type:"human-approval",required:true}]` |
| `network` | `NetworkPolicy` | 선택(M3+) | 없음 | 아웃바운드 네트워크 통제 | `{allow_outbound:false}` |

#### tools[*] 하위 필드

| 필드 | 타입 | 필수 | 기본값 | 설명 | 예시 |
|---|---|---:|---|---|---|
| `name` | `string` | 필수 | 없음 | 정책 대상 도구명 | `"shell_exec"` |
| `effect` | enum | 필수 | 없음 | 허용/차단/변환/게이트 | `"deny"` |
| `when.matches` | `string[]` | 선택 | `[]` | 패턴 매칭 시 정책 적용 | `["rm -rf", "sudo *"]` |
| `when.not_matches` | `string[]` | 선택 | `[]` | 제외 패턴 | `["npm test"]` |
| `when.condition` | `string` | 선택 | 없음 | Policy DSL 조건식(표현식) | `"context.stepName == \"deploy\" && context.currentCost < 5"` |
| `transform.fn` | `string` | 선택 | 없음 | 인자/출력 변환 함수 | `"sanitizeShellArgs"` |
| `gate.type` | enum | 선택 | 없음 | 실행 전 게이트 타입 | `"human-approval"` |
| `gate.timeout` | `string` | 선택 | 정책 gate timeout | 툴 게이트 제한시간 | `"10m"` |

### 2.2 Policy DSL 조건식 문법 (M2-11)

- 비교 연산: `==`, `!=`, `>`, `>=`, `<`, `<=`
- 논리 연산: `&&`, `||`, `!`, 괄호 `(...)`
- 문자열 함수:
  - `contains(field, "value")`
  - `matches(field, "regex")`
  - `startsWith(field, "prefix")`
  - `endsWith(field, "suffix")`
- 멤버십 함수: `in(field, ["a", "b", "c"])`
- 필드 참조: `action.*`, `context.*`, `state.*`, `step.*`, `execution.*`, `actor.*`, `metrics.*`, `previousResults.*` (dot notation)

```ebnf
expression     = orExpr ;
orExpr         = andExpr , { "||" , andExpr } ;
andExpr        = unaryExpr , { "&&" , unaryExpr } ;
unaryExpr      = [ "!" ] , compExpr ;
compExpr       = primary , [ ( "==" | "!=" | ">" | ">=" | "<" | "<=" ) , primary ] ;
primary        = literal | fieldRef | functionCall | arrayLiteral | "(" , expression , ")" ;
functionCall   = ident , "(" , [ expression , { "," , expression } ] , ")" ;
arrayLiteral   = "[" , [ primary , { "," , primary } ] , "]" ;
fieldRef       = ( "action" | "context" | "state" | "step" | "execution" | "actor" | "metrics" | "previousResults" ) , { "." , ident } ;
```

### 2.3 Dynamic Policy Types (M2-12)

```ts
export interface DynamicPolicyVars {
  execution: {
    id: string;
    workflowName: string;
    startedAt: Date;
    elapsedMs: number;
    totalTokens: number;
    totalCost: number;
    totalToolCalls: number;
    completedSteps: string[];
  };
  step: { name: string; agent: string; index: number; config?: Record<string, unknown> };
  actor: { id: string; role?: string };
  state: Record<string, unknown>;
  metrics: {
    errorCount: number;
    retryCount: number;
    avgStepDurationMs: number;
    maxStepDurationMs: number;
  };
  previousResults: Record<string, { success: boolean; output?: unknown }>;
}

export interface DynamicResourceLimit {
  field: "tokens" | "cost" | "tool_calls" | "duration_ms";
  condition: string;
  limit: number;
  action: "deny" | "warn" | "gate";
}

export interface DynamicToolRule {
  name: string;
  condition: string;
  effect: "allow" | "deny" | "transform" | "gate";
  priority?: number;
}
```

### 2.4 ExpressionAST (Runtime)

```ts
export type ExpressionAST =
  | { type: "comparison"; operator: "==" | "!=" | ">" | ">=" | "<" | "<="; left: ExpressionAST; right: ExpressionAST }
  | { type: "logical"; operator: "&&" | "||"; left: ExpressionAST; right: ExpressionAST }
  | { type: "function_call"; name: "contains" | "matches" | "startsWith" | "endsWith" | "in"; args: ExpressionAST[] }
  | { type: "not"; expression: ExpressionAST }
  | { type: "field_ref"; path: string[] }
  | { type: "literal"; value: string | number | boolean | null }
  | { type: "array_literal"; items: ExpressionAST[] };
```

---

## 3) 에러 코드 체계 (Confirmed)

```ts
export enum OboraErrorCode {
  CELL_TIMEOUT = "CELL_1001",
  CELL_TOOL_DENIED = "CELL_1002",
  CELL_LLM_ERROR = "CELL_1003",
  CELL_ABORTED = "CELL_1004",

  POLICY_DENY = "POLICY_2001",
  POLICY_GATE_REQUIRED = "POLICY_2002",
  POLICY_GATE_TIMEOUT = "POLICY_2003",
  POLICY_GATE_REJECTED = "POLICY_2004",
  POLICY_SANDBOX_VIOLATION = "POLICY_2005",
  POLICY_RESOURCE_EXCEEDED = "POLICY_2006",
  POLICY_LOAD_FAILED = "POLICY_2007",

  CONSENSUS_FAIL = "CONSENSUS_3001",
  CONSENSUS_TIMEOUT = "CONSENSUS_3002",
  CONSENSUS_QUORUM_NOT_MET = "CONSENSUS_3003",

  RECOVERY_RETRY_EXHAUSTED = "RECOVERY_4001",
  RECOVERY_ROLLBACK_FAILED = "RECOVERY_4002",
  RECOVERY_ESCALATION_TIMEOUT = "RECOVERY_4003",

  ORCH_WORKFLOW_NOT_FOUND = "ORCH_5001",
  ORCH_STEP_NOT_FOUND = "ORCH_5002",
  ORCH_DEPENDENCY_FAILED = "ORCH_5003",
  ORCH_EXECUTION_TIMEOUT = "ORCH_5004",

  AUDIT_STORE_ERROR = "AUDIT_6001",
  AUDIT_REPLAY_NOT_FOUND = "AUDIT_6002",

  ADAPTER_LLM_UNAVAILABLE = "ADAPTER_7001",
  ADAPTER_AUTH_FAILED = "ADAPTER_7002",
  ADAPTER_TOOL_NOT_FOUND = "ADAPTER_7003",
}
```

| 코드 | 설명 | 발생 조건 | 처리 방침 (Recovery 연계) |
|---|---|---|---|
| `CELL_1001` | Cell 실행 타임아웃 | step timeout 초과 | `retry`(지수 backoff) → 초과 시 `escalate` |
| `CELL_1002` | 도구 호출 차단 | Policy가 tool deny | 즉시 fail + `policy_deny` 기록, 대체 경로/수동 승인 |
| `CELL_1003` | LLM 호출 실패 | provider 5xx, malformed 응답 | adapter retry 후 실패 시 `alternative`/`escalate` |
| `CELL_1004` | Cell 중단 | 사용자 abort, 시스템 종료 | graceful 종료 + 상태 snapshot |
| `POLICY_2001` | 정책 거부 | allow 조건 불충족 | step fail, 정책 튜닝 필요 |
| `POLICY_2002` | 게이트 필요 | gate rule matched | `waiting` 전환, 승인 이벤트 대기 |
| `POLICY_2003` | 게이트 타임아웃 | 승인 시간 초과 | gate fallback (`fail`/`escalate`) |
| `POLICY_2004` | 게이트 반려 | human/external reject | `rollback` 또는 `alternative` |
| `POLICY_2005` | 샌드박스 위반 | root 밖 접근/deny pattern | 즉시 차단 + 보안 이벤트 |
| `POLICY_2006` | 리소스 한도 초과 | token/cost/tool calls/timeout 초과 | 즉시 중단 + 단계 복구 전략 발동 |
| `POLICY_2007` | 정책 로드 실패 | YAML 파싱/검증 실패 | 이전 버전 롤백, 실행 중단 |
| `CONSENSUS_3001` | 합의 실패 | 승인 기준 미달 | `alternative` 리뷰 단계 또는 human escalation |
| `CONSENSUS_3002` | 합의 타임아웃 | timeout 내 quorum 미형성 | best-effort 제외 후 재평가, 실패 시 escalate |
| `CONSENSUS_3003` | quorum 미달 | 필수 voter 미응답 | 재시도 또는 수동 승인 전환 |
| `RECOVERY_4001` | 재시도 소진 | max_retries 도달 | 최종 실패 처리 + escalation |
| `RECOVERY_4002` | 롤백 실패 | snapshot restore 실패 | 즉시 human intervention |
| `RECOVERY_4003` | 에스컬레이션 타임아웃 | 인간 응답 없음 | 정책 fallback(`fail` or auto-approve 금지 권장) |
| `ORCH_5001` | 워크플로우 없음 | name lookup 실패 | 요청 거부, 구성 오류 보고 |
| `ORCH_5002` | step 없음 | dependency/target step miss | 구성 오류로 즉시 중단 |
| `ORCH_5003` | 의존 실패 전파 | 선행 step 실패 | downstream skip + 원인 연결 |
| `ORCH_5004` | 실행 전체 타임아웃 | execution SLA 초과 | 전체 abort + snapshot 보존 |
| `AUDIT_6001` | 감사 저장 실패 | DB write/query 에러 | 이중화 store 또는 로컬 버퍼 fallback |
| `AUDIT_6002` | replay 대상 없음 | execution id 미존재 | 사용자 알림 + 인덱스 점검 |
| `ADAPTER_7001` | LLM 사용 불가 | provider 다운/네트워크 불가 | 대체 provider route |
| `ADAPTER_7002` | 인증 실패 | token 만료/권한 없음 | 인증 갱신 후 재시도 |
| `ADAPTER_7003` | 도구 미등록 | tool registry miss | 실행 중단 + 구성 수정 |

### 3.1 에러 처리 채널 규약 (Pattern Runtime)

- **throw**: 복구 불가능한 외부 제약 위반(예: timeout, 정책 위반 등). 상위 Recovery가 에러 코드 기반으로 처리한다.
- **return `success:false`**: 정상적인 비즈니스 실패(예: quorum 미달, 합의 거부 등). 호출자가 결과를 보고 후속 흐름을 판단한다.

---

## 4) 플러그인 인터페이스 (Confirmed)

```ts
export interface OboraPlugin {
  name: string;
  version: string;
  type: PluginType;
  onLoad?(): Promise<void>;
  onUnload?(): Promise<void>;
}

export type PluginType =
  | "agent"
  | "tool"
  | "pattern"
  | "policy-rule"
  | "recovery-strategy"
  | "consensus-rule"
  | "audit-store"
  | "state-transform";

export interface PluginRegistry {
  register(plugin: OboraPlugin): void;
  unregister(name: string): void;
  get<T extends OboraPlugin>(type: PluginType, name: string): T;
  list(type?: PluginType): OboraPlugin[];
}

export interface AgentPlugin extends OboraPlugin {
  type: "agent";
  createAgent(config: AgentConfig): Agent;
}

export interface ToolPlugin extends OboraPlugin {
  type: "tool";
  schema: ToolSchema;
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface PatternPlugin extends OboraPlugin {
  type: "pattern";
  execute(context: PatternContext): Promise<PatternResult>;
}

export interface PolicyRulePlugin extends OboraPlugin {
  type: "policy-rule";
  evaluate(action: Action, context: EnforceContext): PolicyDecision;
}

export interface RecoveryStrategyPlugin extends OboraPlugin {
  type: "recovery-strategy";
  handle(failure: CellFailure): Promise<RecoveryResult>;
}

export interface ConsensusRulePlugin extends OboraPlugin {
  type: "consensus-rule";
  evaluate(votes: Vote[]): ConsensusResult;
}

export interface AuditStorePlugin extends OboraPlugin {
  type: "audit-store";
  record(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
}

export interface StateTransformPlugin extends OboraPlugin {
  type: "state-transform";
  transform(value: unknown): unknown;
}
```

### 빌트인 등록 예시

```ts
registry.register(new BuiltinPipelinePattern());
registry.register(new BuiltinFileWriteTool());
registry.register(new BuiltinDuckDBAuditStore());
```

**결정:** 빌트인은 privileged hardcode가 아닌 기본 플러그인으로 취급하며, 동일 타입 custom 플러그인이 언제든 대체할 수 있어야 합니다.

---

## 5) 이벤트 카탈로그 (AuditTrail)

### 5.1 이벤트 목록

| 이벤트 타입 | 발생 시점 | 페이로드 | 컴포넌트 |
|---|---|---|---|
| `execution_start` | 워크플로우 실행 시작 | `{workflowName,input,policyVersion}` | Orchestrator |
| `execution_end` | 워크플로우 실행 종료 | `{status,duration,totalTokens,totalCost}` | Orchestrator |
| `step_start` | step 시작 | `{stepName,agent,dependencies}` | Orchestrator |
| `step_end` | step 종료 | `{stepName,status,duration}` | Orchestrator |
| `cell_start` | Cell 시작 | `{cellId,agentName,task}` | Cell |
| `cell_end` | Cell 종료 | `{cellId,status,output,metrics}` | Cell |
| `tool_call` | 도구 호출 직전 | `{toolName,params}` | Cell |
| `tool_result` | 도구 호출 직후 | `{toolName,result,duration}` | Cell |
| `llm_request` | LLM 요청 전송 | `{model,messages,tools,tokens}` | Cell |
| `llm_response` | LLM 응답 수신 | `{model,content,stopReason,tokens,cost}` | Cell |
| `policy_check` | 정책 평가 완료 | `{action,rule,decision}` | Policy |
| `policy_deny` | 정책 차단 | `{action,rule,reason}` | Policy |
| `state_change` | 상태 업데이트 | `{path,oldValue,newValue,cellId}` | StateBinder |
| `consensus_vote` | 투표 등록 | `{sessionId,voterId,score,approved}` | Consensus |
| `consensus_result` | 합의 종료 | `{sessionId,status,votes}` | Consensus |
| `gate_wait` | 게이트 대기 진입 | `{stepName,gateType}` | Orchestrator |
| `gate_resolve` | 게이트 해소 | `{stepName,decision,resolvedBy}` | Orchestrator |
| `recovery_start` | 복구 시작 | `{cellId,strategy,failure}` | Recovery |
| `recovery_end` | 복구 종료 | `{cellId,strategy,result}` | Recovery |
| `snapshot_create` | 스냅샷 생성 | `{snapshotId,trigger}` | State |
| `snapshot_restore` | 스냅샷 복원 | `{snapshotId,reason}` | State |
| `plugin_load` | 플러그인 로드 | `{pluginName,type,version}` | Plugin |
| `plugin_unload` | 플러그인 언로드 | `{pluginName,reason}` | Plugin |
| `error` | 공통 오류 발생 | `{code,message,context}` | Any |

### 5.2 TypeScript 이벤트 타입

```ts
export type OboraEventType =
  | "execution_start" | "execution_end"
  | "step_start" | "step_end"
  | "cell_start" | "cell_end"
  | "tool_call" | "tool_result"
  | "llm_request" | "llm_response"
  | "policy_check" | "policy_deny"
  | "state_change"
  | "consensus_vote" | "consensus_result"
  | "gate_wait" | "gate_resolve"
  | "recovery_start" | "recovery_end"
  | "snapshot_create" | "snapshot_restore"
  | "plugin_load" | "plugin_unload"
  | "error";

export interface BaseEvent<T extends OboraEventType, P> {
  id: string;
  type: T;
  executionId: string;
  timestamp: string;
  component: "Orchestrator" | "Cell" | "Policy" | "StateBinder" | "Consensus" | "Recovery" | "State" | "Plugin" | "Any";
  payload: P;
}

export type ExecutionStartEvent = BaseEvent<"execution_start", { workflowName: string; input: unknown; policyVersion?: string }>;
export type ExecutionEndEvent = BaseEvent<"execution_end", { status: "completed"|"failed"|"aborted"|"waiting"; duration: number; totalTokens?: number; totalCost?: number }>;
export type StepStartEvent = BaseEvent<"step_start", { stepName: string; agent: string; dependencies: string[] }>;
export type StepEndEvent = BaseEvent<"step_end", { stepName: string; status: "success"|"failed"|"skipped"; duration: number }>;
export type CellStartEvent = BaseEvent<"cell_start", { cellId: string; agentName: string; task: unknown }>;
export type CellEndEvent = BaseEvent<"cell_end", { cellId: string; status: "success"|"failed"; output?: unknown; metrics?: Record<string, number> }>;
export type ToolCallEvent = BaseEvent<"tool_call", { toolName: string; params: unknown }>;
export type ToolResultEvent = BaseEvent<"tool_result", { toolName: string; result: unknown; duration: number }>;
export type LlmRequestEvent = BaseEvent<"llm_request", { model: string; messages: unknown[]; tools?: string[]; tokens?: number }>;
export type LlmResponseEvent = BaseEvent<"llm_response", { model: string; content: unknown; stopReason?: string; tokens?: number; cost?: number }>;
export type PolicyCheckEvent = BaseEvent<"policy_check", { action: string; rule: string; decision: "allow"|"deny"|"transform"|"gate" }>;
export type PolicyDenyEvent = BaseEvent<"policy_deny", { action: string; rule: string; reason: string }>;
export type StateChangeEvent = BaseEvent<"state_change", { path: string; oldValue: unknown; newValue: unknown; cellId?: string }>;
export type ConsensusVoteEvent = BaseEvent<"consensus_vote", { sessionId: string; voterId: string; score?: number; approved: boolean }>;
export type ConsensusResultEvent = BaseEvent<"consensus_result", { sessionId: string; status: "pass"|"fail"|"timeout"|"pending"; votes: unknown[] }>;
export type GateWaitEvent = BaseEvent<"gate_wait", { stepName: string; gateType: "human-approval"|"consensus"|"external" }>;
export type GateResolveEvent = BaseEvent<"gate_resolve", { stepName: string; decision: "approved"|"rejected"|"timeout"; resolvedBy?: string }>;
export type RecoveryStartEvent = BaseEvent<"recovery_start", { cellId: string; strategy: string; failure: unknown }>;
export type RecoveryEndEvent = BaseEvent<"recovery_end", { cellId: string; strategy: string; result: "success"|"failed" }>;
export type SnapshotCreateEvent = BaseEvent<"snapshot_create", { snapshotId: string; trigger: string }>;
export type SnapshotRestoreEvent = BaseEvent<"snapshot_restore", { snapshotId: string; reason: string }>;
export type PluginLoadEvent = BaseEvent<"plugin_load", { pluginName: string; type: string; version: string }>;
export type PluginUnloadEvent = BaseEvent<"plugin_unload", { pluginName: string; reason: string }>;
export type ErrorEvent = BaseEvent<"error", { code: OboraErrorCode; message: string; context?: unknown }>;

export type OboraAuditEvent =
  | ExecutionStartEvent | ExecutionEndEvent
  | StepStartEvent | StepEndEvent
  | CellStartEvent | CellEndEvent
  | ToolCallEvent | ToolResultEvent
  | LlmRequestEvent | LlmResponseEvent
  | PolicyCheckEvent | PolicyDenyEvent
  | StateChangeEvent
  | ConsensusVoteEvent | ConsensusResultEvent
  | GateWaitEvent | GateResolveEvent
  | RecoveryStartEvent | RecoveryEndEvent
  | SnapshotCreateEvent | SnapshotRestoreEvent
  | PluginLoadEvent | PluginUnloadEvent
  | ErrorEvent;
```

### 5.3 Re-execution Planner / Diff Report 타입 (M2-14)

```ts
export interface ReExecutionPlan {
  executionId: string;
  originalWorkflow: string;
  mode: "full" | "from_checkpoint";
  startFromStep?: string;
  restoredState?: Record<string, unknown>;
  stepsToRerun: string[];
  stepsToSkip: string[];
  nonDeterminismWarnings: NonDeterminismWarning[];
  createdAt: Date;
}

export interface NonDeterminismWarning {
  type: "model_change" | "time_drift" | "policy_change" | "state_external" | "tool_output";
  description: string;
  stepName?: string;
  severity: "info" | "warning" | "critical";
}

export interface ReExecutionDiffReport {
  executionId: string;
  reExecutionId?: string;
  plan: ReExecutionPlan;
  differences: StepDiff[];
  summary: { total_steps: number; changed: number; unchanged: number; skipped: number };
}

export interface StepDiff {
  stepName: string;
  status: "unchanged" | "changed" | "new" | "removed" | "skipped";
  originalOutput?: unknown;
  reExecutionOutput?: unknown;
  diffDetails?: string;
}

export interface ReExecutionOptions {
  executionId: string;
  mode: "full" | "from_checkpoint";
  checkpointStep?: string;
  detectNonDeterminism?: boolean;
  dryRun?: boolean;
  onStepComplete?: (stepName: string, result: StepReExecutionResult) => void | Promise<void>;
}

export interface StepReExecutionResult {
  stepName: string;
  status: "completed" | "failed" | "skipped";
  output?: unknown;
  matchesOriginal?: boolean;
  diff?: string;
}

export interface ReExecutionResult {
  reExecutionId: string;
  originalExecutionId: string;
  plan: ReExecutionPlan;
  stepResults: StepReExecutionResult[];
  diffReport: ReExecutionDiffReport;
  success: boolean;
  completedAt: Date;
}
```

---

## 부록: 유효성 검증 최소 규칙

- Workflow `steps[].name` 유일성 강제
- `depends_on`는 존재하는 step만 참조 가능
- `consensus.rule="custom"`이면 `custom` 또는 `custom_evaluate` 필수
- `gate="consensus"`이면 `consensus` 또는 `gates` 정책 매핑 필수
- `recovery[*].on_fail="alternative"`이면 `fallback` 필수
- `audit.store="custom"`이면 `audit.custom` 필수
- 정책 파일 로드 실패 시 실행 금지 + 이전 정책 유지
