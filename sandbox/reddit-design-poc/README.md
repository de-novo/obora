# Reddit-like Design Document Generation PoC

> Obora 워크플로우를 사용하여 요구사항으로부터 **설계문서 세트를 자동 생성**하는 MVP입니다.

## 자동 생성 산출물

| 문서 | 설명 |
|------|------|
| **PRD.md** | Product Requirements Document — 기능 정의, 우선순위, NFR |
| **Architecture.md** | 시스템 아키텍처, 데이터 모델, 기술 스택 |
| **API-Spec.md** | REST API 엔드포인트, 요청/응답 포맷, 에러 처리 |
| **Task-Breakdown.md** | 스프린트 단위 태스크 분해 (9개 태스크, 58h 추정) |
| **ADR.md** | Architecture Decision Records (4건) |

## 실행 방법

```bash
# 1. 프로젝트 루트로 이동
cd /path/to/obora-kit

# 2. Obora 상태 확인
node bin/obora.js status -d

# 3. 워크플로우 유효성 검사
node bin/obora.js validate

# 4. 데모 실행 (문서 자동 생성)
bash sandbox/reddit-design-poc/run-design-demo.sh

# 5. 생성된 문서 확인
ls -la sandbox/reddit-design-poc/output/
```

## 폴더 구조

```
sandbox/reddit-design-poc/
├── README.md                          # 이 파일
├── run-design-demo.sh                 # 데모 실행 스크립트
├── input/
│   └── requirements.md                # 입력 요구사항
├── .obora/
│   └── workflows/
│       └── reddit-design-docs.yaml    # Obora 워크플로우 정의
├── templates/                         # (확장용) 문서 템플릿
└── output/                            # 생성된 설계 문서
    ├── PRD.md
    ├── Architecture.md
    ├── API-Spec.md
    ├── Task-Breakdown.md
    └── ADR.md
```

## 현재 한계

1. **템플릿 기반 생성** — 현재는 requirements.md를 파싱하여 미리 정의된 구조로 문서를 생성합니다. LLM 기반 동적 생성은 아직 미구현입니다.
2. **품질 게이트 없음** — 생성된 문서의 완성도·일관성을 자동 검증하는 게이트가 없습니다.
3. **단방향 생성** — 요구사항 변경 시 문서를 다시 생성해야 하며, 증분 업데이트를 지원하지 않습니다.
4. **Obora 런타임 연동 부분적** — 워크플로우 정의는 완료했으나, 실제 agent 실행은 fallback(로컬 스크립트)으로 동작합니다.

## 다음 단계

1. **LLM 에이전트 연동** — `doc-generator` 에이전트를 LLM(GPT/Claude) 호출로 구현하여 요구사항에 따라 동적으로 문서 내용 생성
2. **품질 게이트 추가** — 생성 후 자동 리뷰 단계(일관성 체크, 누락 항목 검출) 워크플로우 스텝 추가
3. **증분 업데이트** — 요구사항 diff 감지 → 영향받는 문서만 재생성하는 incremental 모드 구현
