---
status: 🔄 진행중
owner: denovo
project: obora-kit
created: "2026-02-18"
updated: "2026-02-18"
links:
  - "[[projects/obora-kit/m6-production-memory-design]]"
  - "[[projects/obora-kit/INDEX]]"
---

# M6-05: Dashboard History View

## 목표

과거 Run 목록 조회 + 상세 드릴다운 + 비용/감사 통합 뷰. T1~T4 데이터를 시각화.

## 범위

### 입력
- T1(RunRecord), T3(CostRecord), T4(AuditEvent) 데이터

### 출력
- Dashboard "History" 탭 UI
- `/history/runs`, `/history/runs/:id` 신규 라우트
- Run 목록 뷰, Run 상세 뷰, Step 드릴다운, Audit Replay 타임라인

## 의존 관계

- **선행**: T1, T2, T3, T4 (T2: Resume 버튼/상태 표시에 필요)
- **후행**: 없음

## 성공 기준

- Dashboard에서 과거 Run을 조회하고, 임의 step의 상세 정보(입출력/비용/감사 타임라인)를 확인할 수 있다

## 비목표

- 고급 분석 (트렌드/이상탐지)
- BI 수준 자유 쿼리
- 비교 뷰

## 예상 기간

1주

## SDK/CLI/Dashboard 영향도

| 계층 | 영향 |
|------|------|
| SDK | 없음 (T1/T3/T4 API 활용) |
| CLI | 없음 (T1/T3/T4 CLI 활용) |
| Dashboard | `/history/runs`, `/history/runs/:id` 신규 라우트 + 컴포넌트 |

## 핵심 인터페이스

```typescript
// Fastify 라우트 (M4 Dashboard 확장)
// GET /api/history/runs         — Run 목록
// GET /api/history/runs/:runId  — Run 상세

export interface HistoryRunsQuery {
  status?: string;
  workflowName?: string;
  from?: string;
  to?: string;
  costMin?: number;
  costMax?: number;
  limit?: number;
  offset?: number;
  auditLimit?: number;   // audit timeline 페이지네이션 (기본 100)
  auditOffset?: number;  // audit timeline 오프셋 (기본 0)
}

export interface RunDetailResponse {
  run: RunRecord;
  steps: StepRecord[];
  costSummary: CostSummary;
  auditTimeline: StructuredAuditEvent[];
  checkpoints: CheckpointRecord[];
  pagination?: {
    auditTotal: number;
    auditLimit: number;
    auditOffset: number;
  };
}
```

## 구현 가이드

- 설계서 섹션 4 T5 — UI 구성 상세 (Run 목록 뷰, Run 상세 뷰, Step 드릴다운, Audit Replay 타임라인)
- Run 목록: 필터(상태, 날짜, 비용 범위), 정렬, 페이지네이션
- Run 상세: 상단 메타 + 하단 Step 타임라인(수평 진행 바)
- Step 드릴다운: 좌측 입출력 JSON 뷰어, 우측 비용 내역, 하단 Audit Replay
- Audit Replay: M4 EventPlayback UI 패턴 재사용 + 필터(카테고리/actor) 추가
- Resume 액션: suspended 상태 Run에 Resume 버튼 (drift 경고 모달)
