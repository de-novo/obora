# obora-kit 개발 워크플로우

> 2026-02-13 재정비 (Codex 5.3 + GLM 5 2모델로 통일)

## 핵심 원칙

**"태스크 완료 = 구현 + 2모델 리뷰(9+) + 커밋"**

리뷰 없이 커밋하지 않는다. 9+ 미달 시 다음 태스크로 넘어가지 않는다.

---

## 태스크 완료 기준

1. ✅ 코드 구현 완료
2. ✅ `pnpm build` 성공
3. ✅ `pnpm lint` 통과
4. ✅ **2모델 리뷰 통과** (모든 모델 9+/10 필수 + P0/P1 없음)
5. ✅ 리뷰 피드백 반영 완료
6. ✅ Git 커밋 & 푸시

---

## 2모델 리뷰 구성

> **중요**: 모든 모델이 동일한 전반적 검토를 수행한다. 역할을 제한하지 않는다.
> 서로 다른 관점에서 같은 항목을 검토하여 놓치는 부분을 잡는다.

### 리뷰 모델 (모두 OpenCode CLI 기반)

| 모델 | 도구 | 모델명 | 목표 |
|------|------|--------|------|
| **GLM 5** | OpenCode CLI | `zai-coding-plan/glm-5` | 9+/10 |
| **Codex 5.3** | OpenCode CLI | `openai/gpt-5.3-codex` | 9+/10 |

> ⚠️ **통과 기준**: **각 모델이 개별 9점 이상** (평균 아님!) + **P0/P1 이슈 없음**

### 모든 모델이 검토하는 항목 (공통)

1. **스펙 일치도** - 문서와 구현 일치
2. **코드 품질** - 타입 안전성, 에러 처리, 중복, 가독성
3. **보안** - 입력 검증, 경로 조작, 정보 노출
4. **실용성** - 실행 가능성, 엣지 케이스, 에러 메시지
5. **아키텍처** - 모듈 분리, 의존성, 확장성

---

## 📋 모델별 리뷰 실행 방법

### 1. GLM 5 (OpenCode)

**명령어**:
```bash
cd /path/to/project
opencode run -m zai-coding-plan/glm-5 "<프롬프트>" > /tmp/review-glm.txt 2>&1
```

**프롬프트 예시**:
```markdown
## 전체 코드 리뷰

### 리뷰 대상 파일
- packages/cli/src/commands/*.ts
- packages/core/src/parser/*.ts

### 검토 항목 (모두 검토)
1. 스펙 일치도
2. 코드 품질 (타입, 에러 처리, 중복, 가독성)
3. 보안 (입력 검증, 경로 조작)
4. 실용성 (실행 가능성, 엣지 케이스)
5. 아키텍처 (모듈 분리, 의존성)

### 출력
- 파일별 점수 (10점 만점)
- 이슈 목록 (P0/P1/P2)
```

---

### 2. Codex 5.3 (OpenCode)

**명령어**:
```bash
cd /path/to/project
opencode run -m openai/gpt-5.3-codex "<프롬프트>" > /tmp/review-codex.txt 2>&1
```

**프롬프트 예시**:
```markdown
## Code Review

### Review Target
- packages/cli/src/commands/*.ts
- packages/core/src/parser/*.ts

### Review Criteria (All)
1. Spec compliance
2. Code quality (types, errors, duplication)
3. Security (validation, path issues)
4. Practicality (runs? edge cases?)
5. Architecture (modules, deps)

### Output
- Score per file (/10)
- Issues list (P0/P1/P2)
```

**주의사항**:
- `opencode run` 사용 (pty: true 필수)
- 프로젝트 디렉토리에서 실행
- 결과는 `/tmp/`에 저장

---

## 🔄 전체 리뷰 실행 순서

### Step 1: 2개 모델 병렬 실행

```bash
# 터미널 1: GLM 5 (OpenCode)
cd /path/to/project
opencode run -m zai-coding-plan/glm-5 "전체 코드 리뷰..."

# 터미널 2: Codex 5.3 (OpenCode)
cd /path/to/project
opencode run -m openai/gpt-5.3-codex "Review code..."
```

### Step 2: 결과 수집

- 두 모델 모두 터미널 출력 확인
- 결과 파일: `/tmp/review-glm.txt`, `/tmp/review-codex.txt`

### Step 3: 이슈 통합 & 피드백 반영

2개 모델의 피드백 합쳐서:
1. 중복 제거
2. 우선순위 정렬 (P0 > P1 > P2)
3. 수정 계획 수립
4. 피드백 반영

### Step 4: 재리뷰 (필요시)

9+ 미달 모델만 재리뷰

---

## ⚠️ 자주 하는 실수와 해결책

| 실수 | 해결책 |
|------|--------|
| sessions_spawn 사용 | `opencode run -m <model>` 사용 |
| 모델명 오타 | 정확히: `openai/gpt-5.3-codex`, `zai-coding-plan/glm-5` |
| PTY 모드 미설정 | `pty: true` 필수 |
| 한 모델만 리뷰 | 2개 모두 필수 |
| 역할 제한 | "전체 검토" 명시 |
| 프로젝트 디렉토리 안 감 | `cd /path/to/project` 먼저 실행 |

---

## 왜 2개 모델인가?

```
같은 코드 → GLM / Codex
             ↓       ↓
          관점A   관점B
             └───┴───┘
                 ↓
          놓치는 부분 최소화
```

- 한 모델이 놓친 이슈를 다른 모델이 잡음
- 서로 다른 관점 → 더 높은 품질
- 합의된 점수 → 신뢰할 수 있는 평가
- 효율적인 리뷰 품질 관리 (2개 모델로 최적화)

---

*이 워크플로우는 obora-kit v3 MVP 개발 과정에서 정립됨 (2026-02-04)*
*2모델로 통일 완료 (2026-02-13)*
