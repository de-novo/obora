# obora-kit 개발 워크플로우

> 2026-02-21 업데이트: LLM limit 해제 → 4모델 리뷰게이트로 확장

## 핵심 원칙

**"태스크 완료 = 구현 + 4모델 리뷰(전원 9+) + P0/P1 없음 + 커밋"**

리뷰 없이 커밋하지 않는다. 9+ 미달 시 다음 태스크로 넘어가지 않는다.

---

## 태스크 완료 기준

1. ✅ 코드 구현 완료
2. ✅ `pnpm build` 성공
3. ✅ `pnpm lint` 통과
4. ✅ **4모델 리뷰 통과** (모든 모델 개별 9+/10 필수 + P0/P1 없음)
5. ✅ 리뷰 피드백 반영 완료
6. ✅ Git 커밋 & 푸시

---

## 4모델 리뷰 구성

> **중요**: 4모델 전부 동일한 역할. 모든 모델이 동일한 전체 검토를 수행한다.
> 역할을 제한하지 않는다. 서로 다른 provider의 독립 관점에서 같은 항목을 전체 검토하여 놓치는 부분을 잡는다.

### 리뷰 모델

| 모델 | 모델명 | 통과 기준 |
|------|--------|----------|
| **Opus 4** | `anthropic/claude-opus-4-6` | 9+/10, P0=0, P1=0 |
| **Sonnet 4.6** | `anthropic/claude-sonnet-4-6` | 9+/10, P0=0, P1=0 |
| **Codex 5.3** | `openai/gpt-5.3-codex` | 9+/10, P0=0, P1=0 |
| **GLM 5** | `zai-coding-plan/glm-5` | 9+/10, P0=0, P1=0 |

> ⚠️ **통과 기준**: **각 모델이 개별 9점 이상** (평균 아님!) + **P0/P1 이슈 없음**

### 모든 모델이 검토하는 항목 (전원 동일, 전체 검토)

1. **스펙 일치도** — 문서와 구현 일치, doc-code 불일치 여부
2. **일관성** — 기존 코드베이스 컨벤션(네이밍, 구조, 패턴) 준수
3. **코드 품질** — 타입 안전성(`any` 절대 금지), 에러 처리, 중복, 가독성
4. **기존 코드 호환성** — 기존 모듈 인터페이스 정합, 기존 테스트 깨짐 여부, import 경로 정합
5. **확장성** — 향후 변경 범위 최소화, 모듈 분리, 의존성 방향
6. **리스크** — 런타임 장애, 메모리 누수, 무한 루프, 비동기 에러 미처리
7. **보안** — 입력 검증, 토큰/시크릿 노출, 경로 조작
8. **실용성** — 실행 가능성, 엣지 케이스, 에러 메시지 품질
9. **테스트** — 커버리지 충분 여부, 경계값/실패 케이스 포함 여부

---

## 📋 리뷰 실행 방법

### 4모델 병렬 실행

```bash
cd /path/to/project
OPENCODE="/Users/denovo/.asdf/installs/nodejs/lts/bin/opencode"

# 4개 모두 같은 프롬프트로 실행
$OPENCODE run --format json -m anthropic/claude-opus-4-6 < prompt.md > /tmp/review-opus.jsonl 2>&1
$OPENCODE run --format json -m anthropic/claude-sonnet-4-6 < prompt.md > /tmp/review-sonnet.jsonl 2>&1
$OPENCODE run --format json -m openai/gpt-5.3-codex < prompt.md > /tmp/review-codex.jsonl 2>&1
$OPENCODE run --format json -m zai-coding-plan/glm-5 < prompt.md > /tmp/review-glm.jsonl 2>&1
```

### 결과 추출

```bash
for f in opus sonnet codex glm; do
  jq -r 'select(.type=="text") | (.part.text // empty)' /tmp/review-${f}.jsonl > /tmp/review-${f}.md
done
```

### 이슈 통합 & 피드백 반영

4개 모델의 피드백 합쳐서:
1. 중복 제거
2. 우선순위 정렬 (P0 > P1 > P2)
3. 수정 계획 수립
4. 피드백 반영

### 재리뷰

- 9 미만 모델만 재리뷰 (전체 재실행 불필요)
- P0 발견 시 → 수정 후 4모델 전체 재리뷰
- P1 발견 시 → 수정 후 해당 모델만 재리뷰

---

## 왜 4모델인가?

```
동일 코드 → Opus / Sonnet / Codex / GLM
              ↓       ↓        ↓       ↓
           전체검토  전체검토  전체검토  전체검토
              └───────┴────────┴───────┘
                          ↓
            4개 독립 관점 교차검증 → 놓치는 부분 최소화
```

- **역할 동일, 관점 다양** — 한 모델이 놓친 이슈를 다른 모델이 잡음
- provider 다양성 (Anthropic × 2 + OpenAI + ZAI) → 편향 제거
- LLM limit 해제로 비용 제약 없음 → 품질 극대화

---

*이 워크플로우는 obora-kit v3 MVP 개발 과정에서 정립됨 (2026-02-04)*
*2모델 → 4모델 확장 (2026-02-21, LLM limit 해제)*
