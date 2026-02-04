# obora-kit 개발 워크플로우

> 2026-02-04 재정비 (테스트 완료)

## 핵심 원칙

**"태스크 완료 = 구현 + 4모델 리뷰(9+) + 커밋"**

리뷰 없이 커밋하지 않는다. 9+ 미달 시 다음 태스크로 넘어가지 않는다.

---

## 태스크 완료 기준

1. ✅ 코드 구현 완료
2. ✅ `pnpm build` 성공
3. ✅ `pnpm lint` 통과
4. ✅ **4모델 리뷰 통과** (모든 모델 9+/10 필수)
5. ✅ 리뷰 피드백 반영 완료
6. ✅ Git 커밋 & 푸시

---

## 4모델 리뷰 구성

> **중요**: 모든 모델이 동일한 전반적 검토를 수행한다. 역할을 제한하지 않는다.
> 서로 다른 관점에서 같은 항목을 검토하여 놓치는 부분을 잡는다.

### 리뷰 모델 (테스트 완료 ✅)

| 모델 | 도구 | 모델명 | 목표 |
|------|------|--------|------|
| **Claude Opus 4.5** | OpenClaw sessions_spawn | `anthropic/claude-opus-4-5` | 9+/10 |
| **GLM 4.7** | OpenClaw sessions_spawn | `zai/glm-4.7` | 9+/10 |
| **Kimi K 2.5** | OpenCode CLI | `opencode/kimi-k2.5-free` | 9+/10 |
| **Codex (GPT-5.2)** | OpenCode CLI | `openai/gpt-5.2-codex` | 9+/10 |

### 모든 모델이 검토하는 항목 (공통)

1. **스펙 일치도** - 문서와 구현 일치
2. **코드 품질** - 타입 안전성, 에러 처리, 중복, 가독성
3. **보안** - 입력 검증, 경로 조작, 정보 노출
4. **실용성** - 실행 가능성, 엣지 케이스, 에러 메시지
5. **아키텍처** - 모듈 분리, 의존성, 확장성

---

## 📋 모델별 리뷰 실행 방법

### 1. Claude Opus 4.5 (OpenClaw)

**명령어**:
```bash
sessions_spawn \
  --model anthropic/claude-opus-4-5 \
  --task "<프롬프트>" \
  --label "review-opus-<task-id>" \
  --cleanup delete
```

**프롬프트 예시**:
```
## 전체 코드 리뷰

### 프로젝트 경로
`/Users/denovo/workspace/github/obora-kit/`

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
- 이슈 목록 (Critical/High/Medium/Low)

### 완료 후
Telegram (7986044327)으로 결과 전송
```

---

### 2. GLM 4.7 (OpenClaw)

**명령어**:
```bash
sessions_spawn \
  --model zai/glm-4.7 \
  --task "<프롬프트>" \
  --label "review-glm-<task-id>" \
  --cleanup delete
```

**프롬프트**: Opus와 동일한 형식 사용

---

### 3. Kimi K 2.5 (OpenCode)

**명령어 (비대화형 모드)**:
```bash
cd /path/to/project
opencode run -m opencode/kimi-k2.5-free "<프롬프트>" > /tmp/review-kimi.txt 2>&1
```

**프롬프트 예시**:
```
Review all files in packages/cli/src/commands/ and packages/core/src/

Check ALL:
1. Spec compliance
2. Code quality (types, errors, duplication)
3. Security (validation, path issues)
4. Practicality (runs? edge cases?)
5. Architecture (modules, deps)

Output: Score per file (/10), issues with priority
IMPORTANT: Write detailed review to /tmp/review-kimi-detailed.txt
```

**파일 기반 리뷰 방식**:
- OpenCode 비대화형 모드는 stdout 캡처가 불안정
- `/tmp/` 디렉토리에 결과 파일 저장 명시 필요
- 프롬프트에 파일 출력 경로를 명시

**예시**:
```bash
# 결과를 파일로 저장
opencode run -m opencode/kimi-k2.5-free \
  "Review code. Save result to /tmp/review-kimi-$(date +%Y%m%d-%H%M%S).txt" \
  > /tmp/opencode-kimi.log 2>&1 &

# 결과 확인
cat /tmp/review-kimi-*.txt
```

**주의사항**:
- 프로젝트 디렉토리에서 실행
- 비대화형 모드: 리디렉션으로 로그 저장
- 대화형 모드: `opencode` 실행 후 `/model opencode/kimi-k2.5-free`

---

### 4. Codex / GPT-5.2 (OpenCode)

**명령어 (비대화형 모드)**:
```bash
cd /path/to/project
opencode run -m openai/gpt-5.2-codex "<프롬프트>" > /tmp/review-codex.txt 2>&1
```

**프롬프트 예시**:
```
Review code for quality and security.
Files: packages/cli/src/commands/*.ts

Check:
1. Spec compliance
2. Type safety, error handling
3. Security vulnerabilities
4. Edge cases
5. Architecture

Score each file /10. List issues.
IMPORTANT: Write detailed review to /tmp/review-codex-detailed.txt
```

**파일 기반 리뷰 방식**:
- OpenCode 비대화형 모드는 stdout 캡처가 불안정
- `/tmp/` 디렉토리에 결과 파일 저장 명시 필요
- 프롬프트에 파일 출력 경로를 명시

**예시**:
```bash
# 결과를 파일로 저장
opencode run -m openai/gpt-5.2-codex \
  "Review code. Save result to /tmp/review-codex-$(date +%Y%m%d-%H%M%S).txt" \
  > /tmp/opencode-codex.log 2>&1 &

# 결과 확인
cat /tmp/review-codex-*.txt
```

**주의사항**:
- `codex exec`가 아닌 `opencode run` 사용
- 모델명: `openai/gpt-5.2-codex`
- 비대화형 모드: 리디렉션으로 로그 저장

---

## 🔄 전체 리뷰 실행 순서

### Step 1: 4개 모델 병렬 실행

```bash
# 터미널 1: Opus 4.5 (OpenClaw)
sessions_spawn --model anthropic/claude-opus-4-5 \
  --task "전체 코드 리뷰..." --label "review-opus"

# 터미널 2: GLM 4.7 (OpenClaw)
sessions_spawn --model zai/glm-4.7 \
  --task "전체 코드 리뷰..." --label "review-glm"

# 터미널 3: Kimi K 2.5 (OpenCode)
cd /path/to/project
opencode run -m opencode/kimi-k2.5-free "Review all files..."

# 터미널 4: Codex (OpenCode)
cd /path/to/project
opencode run -m openai/gpt-5.2-codex "Review code..."
```

### Step 2: 결과 수집

- Opus, GLM: Telegram 알림으로 수신
- Kimi, Codex: 터미널 출력 확인

### Step 3: 이슈 통합 & 피드백 반영

4개 모델의 피드백 합쳐서:
1. 중복 제거
2. 우선순위 정렬
3. 수정 계획 수립
4. 피드백 반영

### Step 4: 재리뷰 (필요시)

9+ 미달 모델만 재리뷰

---

## ⚠️ 자주 하는 실수와 해결책

| 실수 | 해결책 |
|------|--------|
| `codex exec` 사용 | `opencode run -m openai/gpt-5.2-codex` 사용 |
| 모델명 오타 | 정확히 복사: `opencode/kimi-k2.5-free` |
| Telegram ID 누락 | 프롬프트에 `7986044327` 포함 |
| 한 모델만 리뷰 | 4개 모두 실행 필수 |
| 역할 제한 | "전체 검토" 명시 |
| 프로젝트 디렉토리 안 감 | `cd /path/to/project` 먼저 실행 |

---

## 왜 4개 모델인가?

```
같은 코드 → Opus / GLM / Kimi / Codex
             ↓      ↓      ↓       ↓
          관점A  관점B  관점C   관점D
             └──────┴──────┴───────┘
                       ↓
            놓치는 부분 최소화
```

- 한 모델이 놓친 이슈를 다른 모델이 잡음
- 서로 다른 관점 → 더 높은 품질
- 합의된 점수 → 신뢰할 수 있는 평가

---

*이 워크플로우는 obora-kit v3 MVP 개발 과정에서 정립됨 (2026-02-04)*
*모든 명령어 테스트 완료*
