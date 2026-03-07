# Obora Sandbox Tests

다양한 워크플로우 시나리오를 테스트하기 위한 샌드박스입니다.

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

# 특정 테스트만 실행
./run.sh 01-hello-world
./run.sh 02-linear-pipeline
```

## 사전 요구사항

1. **obora CLI 설치**
   ```bash
   npm install -g @obora/cli
   ```

2. **API 키 설정**
   ```bash
   export ZAI_API_KEY="your-zai-api-key"
   export OPENAI_API_KEY="your-openai-api-key"  # multi-provider 테스트용
   ```

## 디렉토리 구조

```
.sandbox/
├── README.md           # 이 파일
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
- ZAI GLM-4.7
- OpenAI GPT-4o-mini

## 결과 확인

각 테스트 실행 후:
1. 콘솔 출력에서 스텝별 결과 확인
2. `output/` 폴더에서 생성된 파일 확인
3. `.obora/` 폴더에서 실행 로그 확인
