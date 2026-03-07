# Obora Sandbox Tests

다양한 워크플로우 시나리오를 테스트하기 위한 샌드박스입니다.

## 글로벌 설정

샌드박스는 **zai/glm-4.7**을 기본으로 사용합니다 (비용 효율성).

```yaml
# .sandbox/.obora/config.yaml
defaults:
  provider: zai
  model: glm-4.7
  temperature: 0.3

providers:
  zai:
    authMode: token
    authRef: global:zai
```

각 테스트 케이스의 `agents.yaml`은 이 기본값을 상속받아 필요한 속성만 오버라이드합니다.

> **참고**: `~/.obora/config.yaml` 글로벌 설정이 있어도 샌드박스 내의 `.obora/config.yaml`이 우선합니다.

## 테스트 케이스

| # | 이름 | 설명 | 실행 |
|---|------|------|------|
| 01 | hello-world | 가장 기본적인 단일 스텝 | `./run.sh 01` |
| 02 | linear-pipeline | 3단계 의존성 파이프라인 | `./run.sh 02` |
| 03 | tool-usage | file_write/read/list 도구 사용 | `./run.sh 03` |
| 04 | consensus | 다중 에이전트 투표 | `./run.sh 04` |
| 05 | policy-gate | 정책 게이트 | `./run.sh 05` |
| 06 | error-recovery | 재시도/복구 메커니즘 | `./run.sh 06` |
| 07 | custom-tools | 커스텀 도구 주입 | `./run.sh 07` |
| 08 | multi-provider | 여러 LLM 프로바이더 | `./run.sh 08` |

## 전체 실행

```bash
# 전체 테스트 실행
./run-all.sh

# 특정 테스트만 실행 (숫자 shorthand 지원)
./run.sh 01
./run.sh 01-hello-world
./run.sh 02-linear-pipeline
```

## 사전 요구사항

1. **CLI 준비**
   - 저장소 안에서 실행하면 `.sandbox/run.sh`가 로컬 빌드된 CLI(`packages/cli/dist/index.js`)를 자동으로 사용합니다.
   - 전역 설치가 되어 있으면 `obora` 커맨드를 우선 사용합니다.

   ```bash
   # 전역 설치(선택)
   npm install -g @obora/cli

   # 로컬 CLI가 필요하면 먼저 빌드
   pnpm --filter @obora/cli build
   ```

2. **글로벌 인증 또는 환경변수**
   - 기본 권장: `~/.obora/global-auth.json`에 provider 키 저장
   - 대안: 셸 환경변수 사용

   ```bash
   # 권장: 글로벌 인증 사용 (예시 구조)
   cat ~/.obora/global-auth.json

   # 대안: 환경변수 사용
   export ZAI_API_KEY="your-zai-api-key"
   export OPENAI_API_KEY="your-openai-api-key"  # 08 테스트용
   ```

> 샌드박스 실행 스크립트는 `~/.obora/global-auth.json`의 `zai` 값을 우선 활용할 수 있고, 없으면 `ZAI_API_KEY`를 사용합니다. 둘 다 없으면 stub mode로 통과시키지 않고 즉시 실패(fail fast)합니다.

## 디렉토리 구조

```
.sandbox/
├── README.md           # 이 파일
├── common.sh           # 공통 실행 헬퍼
├── run-all.sh          # 전체 실행 스크립트
├── run.sh              # 개별 실행 스크립트
├── 01-hello-world/
│   ├── workflow.yaml   # 워크플로우 정의
│   ├── agents.yaml     # 에이전트 설정
│   └── run.sh          # 실행 스크립트
├── 02-linear-pipeline/
│   └── ...
└── ...
```

## 테스트별 상세

### 01-hello-world
가장 단순한 워크플로우. 단일 스텝이 인사말을 생성합니다.

### 02-linear-pipeline
3단계 파이프라인:
- `brainstorm` → 아이디어 생성
- `evaluate` → 평가
- `finalize` → 최종 결정

각 단계는 이전 단계의 출력을 참조합니다.

### 03-tool-usage
내장 도구 테스트:
- `file_write` - 파일 생성
- `file_read` - 파일 읽기
- `file_list` - 디렉토리 목록

### 04-consensus
다중 에이전트 합의:
- 1명의 제안자
- 3명의 리뷰어 (다수결)

### 05-policy-gate
정책 기반 승인:
- 특정 조건에서 승인 요구
- 조건부 실행 제어

### 06-error-recovery
에러 복구:
- 재시도 메커니즘
- exponential backoff

### 07-custom-tools
커스텀 도구:
- `calculate` - 수학 계산
- `get_current_time` - 현재 시간

### 08-multi-provider
여러 LLM 프로바이더:
- ZAI GLM-4.7 (`global:zai` 또는 `ZAI_API_KEY`)
- OpenAI Codex GPT-5.3 (`global:openai-codex` 또는 `OPENAI_CODEX_API_KEY`)

## 결과 확인

각 테스트 실행 후:
1. 콘솔 출력에서 스텝별 결과 확인
2. `output/` 폴더에서 생성된 파일 확인
3. `.obora/` 폴더에서 실행 로그 확인
