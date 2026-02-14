# Reddit-like PoC — Obora Only

Obora 워크플로우만으로 구현한 최소 Reddit-like 서비스 PoC.

외부 서버 프레임워크 없이, **워크플로우 실행 → 데이터 처리 → 랭킹 출력**까지 동작합니다.

## 무엇을 만들었는가

| 기능 | 설명 |
|------|------|
| Post 생성 | `seeds/posts.json`에 정의된 게시물 로딩 |
| Comment 추가 | `seeds/comments.json`에 정의된 댓글을 게시물에 매핑 |
| Upvote/Downvote | `seeds/votes.json`의 투표 데이터 집계 |
| Hot Score 정렬 | `(up - down) + comments × 0.5 - ageHours × 0.1` |

## 구조

```
sandbox/reddit-poc/
├── README.md                              # 이 문서
├── run-demo.sh                            # 원클릭 데모 실행
├── seeds/
│   ├── posts.json                         # 게시물 4개
│   ├── comments.json                      # 댓글 6개
│   └── votes.json                         # 투표 17개
└── .obora/
    └── workflows/
        └── reddit-basic.yaml              # 6-step 워크플로우
```

## 실행 방법

```bash
# 프로젝트 루트에서
cd sandbox/reddit-poc

# 전체 데모 (status → feature 생성 → validate → run → 랭킹)
bash run-demo.sh

# 개별 명령
node ../../bin/obora.js status
node ../../bin/obora.js validate
node ../../bin/obora.js run --feature reddit-feed
node ../../bin/obora.js run --feature reddit-feed --dry-run
node ../../bin/obora.js status --format json
```

## 실행 결과 예시

```
┌─────┬────────────────────────────────────────────┬────┬────┬─────┬────────┐
│ Rank│ Title                                      │ ▲  │ ▼  │ 💬  │ Score  │
├─────┼────────────────────────────────────────────┼────┼────┼─────┼────────┤
│  1  │ Show HN: Built a Reddit clone with just YA │  6 │  0 │   2 │    6.8 │
│  2  │ Obora-kit v0.1 Released!                   │  4 │  1 │   2 │    3.6 │
│  3  │ AI Agent coordination patterns             │  2 │  1 │   1 │    0.9 │
│  4  │ Monorepo tooling in 2026                   │  1 │  2 │   1 │   -2.3 │
└─────┴────────────────────────────────────────────┴────┴────┴─────┴────────┘
```

## 현재 제약

- 워크플로우 step 실행은 **시뮬레이션** (obora core가 실제 agent 호출을 아직 미구현)
- 실제 데이터 처리(랭킹)는 `run-demo.sh` 내 inline Node.js로 수행
- Seed 데이터는 정적 JSON — 동적 입력/API 미지원
- 단일 subreddit 피드만 지원

## 다음 단계

1. **실제 agent 구현**: `data-loader`, `aggregator`, `ranker` agent를 obora agent 패키지로 구현하여 워크플로우가 실제 데이터를 처리하도록 연결
2. **Blackboard 연동**: 게시물/댓글/투표 상태를 `@obora-kit/blackboard`에 저장하여 step 간 상태 공유
3. **CLI 확장**: `obora run` 결과에서 직접 랭킹 테이블을 출력하는 렌더러 추가
