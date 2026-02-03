# Agent Definition Specification

> 버전: v3
> 패키지: @obora/core (agent-registry)

---

## 개요

에이전트는 워크플로우의 각 단계를 실행하는 AI 역할을 정의합니다.

### 역할

- 단계별 작업 수행 (설계, 구현, 테스트 등)
- OpenClaw를 통한 실행
- 컨텍스트 기반 작업

### 관련 원칙

| 원칙 | 적용 |
|------|------|
| **SSOT** | 에이전트 정의는 단일 파일로 관리 |
| **Easy** | 내장 에이전트로 즉시 시작 |
| **Scalable** | 커스텀 에이전트 확장 |

---

## 마크다운 형식

에이전트는 마크다운 파일로 정의됩니다.

### 파일 위치

```
.obora/agents/
├── architect.md         # 내장
├── developer.md         # 내장
├── tester.md            # 내장
├── reviewer.md          # 내장
├── general.md           # 내장
└── custom/              # 커스텀
    └── frontend-dev.md
```

### 전체 구조

```markdown
# agent: <agent-id>

> 한 줄 설명

## 역할
에이전트의 역할과 책임을 설명합니다.

## 기술 스택
- 기술 1
- 기술 2

## 프롬프트
```
당신은 [역할]입니다.

## 작업 지침
1. ...
2. ...

## 출력 형식
- ...
```

## 입력
| 파일 | 설명 |
|------|------|
| proposal.md | 기획서 |
| design.md | 설계서 |

## 출력
| 파일 | 설명 |
|------|------|
| context/<step>-output.md | 작업 결과 |

## 설정
```yaml
model: zai/glm-4.7
timeout: 300000
```
```

---

## 필수 섹션

### 헤더

```markdown
# agent: architect
```

- 형식: `# agent: <id>`
- ID는 kebab-case
- 워크플로우에서 참조할 때 사용

### 역할 (Role)

```markdown
## 역할
아키텍처 설계를 담당하는 에이전트입니다.

주요 책임:
- 시스템 구조 설계
- 컴포넌트 분리
- 기술 선택
```

### 프롬프트 (Prompt)

```markdown
## 프롬프트
```
당신은 소프트웨어 아키텍트입니다.

## 작업
주어진 기획서를 바탕으로 기술 설계를 작성하세요.

## 입력
- proposal.md: 기획서

## 출력 형식
설계 문서를 마크다운으로 작성하세요:
- 아키텍처 개요
- 컴포넌트 구조
- 데이터 흐름
- 기술 선택 근거
```
```

**프롬프트 작성 지침:**
- 명확한 역할 정의
- 구체적인 작업 지시
- 입력/출력 명시
- 출력 형식 가이드

---

## 선택 섹션

### 기술 스택

```markdown
## 기술 스택
- TypeScript
- React
- Node.js
```

### 입력 (Inputs)

```markdown
## 입력
| 파일 | 설명 | 필수 |
|------|------|------|
| proposal.md | 기획서 | ✅ |
| design.md | 기존 설계 | ⬜ |
```

### 출력 (Outputs)

```markdown
## 출력
| 파일 | 설명 |
|------|------|
| context/design-output.md | 설계 결과 |
```

### 설정 (Config)

```markdown
## 설정
```yaml
model: anthropic/claude-opus-4-5
timeout: 600000
temperature: 0.7
max_tokens: 4000
```
```

| 설정 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| model | string | 전역 설정 | 사용할 모델 |
| timeout | number | 300000 | 타임아웃 (ms) |
| temperature | number | 0.7 | 모델 온도 |
| max_tokens | number | - | 최대 토큰 수 |

### 예시 (Examples)

```markdown
## 예시

### 입력 예시
```markdown
# Proposal: 로그인 기능

## 목표
사용자 인증 기능 구현
```

### 출력 예시
```markdown
# Design: 로그인 기능

## 아키텍처
JWT 기반 인증 시스템...
```
```

---

## 내장 에이전트 목록

### architect.md

```markdown
# agent: architect

> 아키텍처 설계 전문 에이전트

## 역할
시스템 아키텍처를 설계합니다.

주요 책임:
- 전체 시스템 구조 설계
- 컴포넌트 분리 및 인터페이스 정의
- 기술 스택 선택
- 확장성 및 유지보수성 고려

## 프롬프트
```
당신은 소프트웨어 아키텍트입니다.

## 작업
주어진 기획서(proposal.md)를 분석하고 기술 설계서를 작성하세요.

## 고려 사항
1. 요구사항 충족 여부
2. 확장성 (Scalability)
3. 유지보수성 (Maintainability)
4. 보안 (Security)
5. 성능 (Performance)

## 출력 형식
다음 구조로 설계서를 작성하세요:

### 1. 아키텍처 개요
전체 시스템 구조를 설명합니다.

### 2. 컴포넌트 구조
각 컴포넌트의 역할과 인터페이스를 정의합니다.

### 3. 데이터 흐름
데이터가 시스템을 통해 어떻게 흐르는지 설명합니다.

### 4. 기술 선택
사용할 기술 스택과 선택 근거를 명시합니다.

### 5. 엣지 케이스
고려해야 할 엣지 케이스를 나열합니다.
```

## 입력
| 파일 | 설명 |
|------|------|
| proposal.md | 기획서 |

## 출력
| 파일 | 설명 |
|------|------|
| context/design-output.md | 설계 결과 |
```

### developer.md

```markdown
# agent: developer

> 코드 구현 전문 에이전트

## 역할
설계서를 바탕으로 코드를 구현합니다.

주요 책임:
- 설계서 기반 코드 작성
- 클린 코드 원칙 준수
- 테스트 가능한 코드 작성
- 문서화

## 기술 스택
- TypeScript
- React
- Node.js

## 프롬프트
```
당신은 시니어 개발자입니다.

## 작업
설계서(design-output.md)를 바탕으로 코드를 구현하세요.

## 원칙
1. 클린 코드 작성
2. SOLID 원칙 준수
3. 테스트 가능한 구조
4. 적절한 에러 처리
5. 의미 있는 변수/함수 이름

## 출력 형식
구현 결과를 다음 형식으로 작성하세요:

### 구현 요약
무엇을 구현했는지 요약합니다.

### 파일 구조
생성/수정한 파일 목록

### 코드
```typescript
// 실제 코드
```

### 사용 방법
코드 사용 방법을 설명합니다.

### 남은 작업
추가로 필요한 작업이 있다면 명시합니다.
```

## 입력
| 파일 | 설명 |
|------|------|
| context/design-output.md | 설계서 |

## 출력
| 파일 | 설명 |
|------|------|
| context/implement-output.md | 구현 결과 |
```

### tester.md

```markdown
# agent: tester

> 테스트 및 검증 전문 에이전트

## 역할
구현된 코드를 테스트하고 검증합니다.

주요 책임:
- 테스트 케이스 작성
- 버그 발견 및 보고
- 품질 검증
- 테스트 커버리지 확인

## 프롬프트
```
당신은 QA 엔지니어입니다.

## 작업
구현된 코드(implement-output.md)를 검토하고 테스트하세요.

## 테스트 항목
1. 기능 테스트 (Functional)
2. 엣지 케이스 테스트
3. 에러 처리 테스트
4. 성능 고려사항

## 출력 형식
테스트 결과를 다음 형식으로 작성하세요:

### 테스트 요약
전체 테스트 결과 요약

### 테스트 케이스
| 케이스 | 설명 | 결과 |
|--------|------|------|
| TC-1 | ... | PASS/FAIL |

### 발견된 이슈
발견된 버그나 개선점

### 테스트 코드
```typescript
// 테스트 코드
```

### 권장사항
품질 향상을 위한 권장사항
```

## 입력
| 파일 | 설명 |
|------|------|
| context/implement-output.md | 구현 결과 |

## 출력
| 파일 | 설명 |
|------|------|
| context/test-output.md | 테스트 결과 |
```

### reviewer.md

```markdown
# agent: reviewer

> 코드 리뷰 전문 에이전트

## 역할
코드를 리뷰하고 개선점을 제안합니다.

주요 책임:
- 코드 품질 검토
- 보안 취약점 확인
- 성능 이슈 식별
- 개선 제안

## 프롬프트
```
당신은 시니어 코드 리뷰어입니다.

## 작업
구현된 코드와 테스트 결과를 리뷰하세요.

## 리뷰 항목
1. 코드 품질
2. 보안
3. 성능
4. 가독성
5. 테스트 커버리지

## 출력 형식
리뷰 결과를 다음 형식으로 작성하세요:

### 리뷰 요약
전체 평가 (승인/수정요청/거부)

### 잘된 점
- ...

### 개선 필요
| 위치 | 이슈 | 심각도 | 제안 |
|------|------|--------|------|
| ... | ... | High/Medium/Low | ... |

### 보안 검토
보안 관련 이슈

### 최종 의견
종합적인 의견
```

## 입력
| 파일 | 설명 |
|------|------|
| context/implement-output.md | 구현 결과 |
| context/test-output.md | 테스트 결과 |

## 출력
| 파일 | 설명 |
|------|------|
| context/review-output.md | 리뷰 결과 |
```

### general.md

```markdown
# agent: general

> 범용 작업 에이전트

## 역할
특정 역할에 국한되지 않는 범용 작업을 수행합니다.

주요 책임:
- 문서 작성
- 분석
- 기타 작업

## 프롬프트
```
당신은 숙련된 소프트웨어 엔지니어입니다.

주어진 작업을 수행하세요. 작업 내용은 입력 파일에서 확인하세요.

## 출력 형식
작업 결과를 명확하게 문서화하세요.
```

## 설정
```yaml
model: zai/glm-4.7
timeout: 300000
```
```

---

## 커스텀 에이전트 작성법

### 1. 파일 생성

```bash
touch .obora/agents/custom/frontend-dev.md
```

### 2. 기본 구조 작성

```markdown
# agent: frontend-dev

> React 프론트엔드 개발 전문 에이전트

## 역할
React 기반 프론트엔드 코드를 구현합니다.

주요 책임:
- React 컴포넌트 개발
- 상태 관리 (Zustand/Redux)
- UI/UX 구현
- 반응형 디자인

## 기술 스택
- React 18
- TypeScript
- Tailwind CSS
- Zustand

## 프롬프트
```
당신은 React 프론트엔드 전문 개발자입니다.

## 작업
설계서를 바탕으로 React 컴포넌트를 구현하세요.

## 코딩 규칙
1. 함수형 컴포넌트 사용
2. TypeScript strict 모드
3. Tailwind CSS 클래스 사용
4. 적절한 컴포넌트 분리
5. 접근성(a11y) 고려

## 출력 형식
구현 결과를 다음 형식으로 작성하세요:

### 컴포넌트 구조
컴포넌트 트리 설명

### 코드
```tsx
// 컴포넌트 코드
```

### 사용 예시
```tsx
// 사용 방법
```
```

## 입력
| 파일 | 설명 |
|------|------|
| context/design-output.md | 설계서 |

## 출력
| 파일 | 설명 |
|------|------|
| context/frontend-output.md | 구현 결과 |

## 설정
```yaml
model: anthropic/claude-opus-4-5
timeout: 600000
```
```

### 3. 워크플로우에서 사용

```yaml
# .obora/workflows/custom/frontend-workflow.yaml
name: frontend-workflow
steps:
  - name: design
    agent: architect
  - name: frontend
    agent: frontend-dev    # 커스텀 에이전트 사용
    inputs:
      - context/design-output.md
    outputs:
      - context/frontend-output.md
```

---

## OpenClaw 연동 방식

### 실행 흐름

```
1. 워크플로우에서 step 실행
    ↓
2. Agent Registry에서 에이전트 정의 로드
    ↓
3. 프롬프트 + 입력 파일 조합
    ↓
4. OpenClaw sessions_spawn 호출
    ↓
5. 결과를 출력 파일로 저장
```

### OpenClaw 호출 형식

```typescript
interface OpenClawTask {
  task: string;          // 조합된 프롬프트
  model?: string;        // 에이전트 설정 또는 기본값
  timeout?: number;      // 타임아웃
  cleanup?: 'delete' | 'keep';
  env?: Record<string, string>;
}

async function executeAgent(
  agent: AgentDefinition,
  inputs: Map<string, string>,
  step: Step
): Promise<string> {
  // 프롬프트 조합
  const fullPrompt = buildPrompt(agent, inputs);
  
  // OpenClaw 호출
  const result = await openclawExecutor.spawn({
    task: fullPrompt,
    model: agent.config?.model || defaultModel,
    timeout: agent.config?.timeout || 300000,
    cleanup: 'delete',
    env: {
      OBORA_FEATURE: currentFeature,
      OBORA_STEP: step.name,
    },
  });
  
  return result.output;
}
```

### 프롬프트 조합

```typescript
function buildPrompt(
  agent: AgentDefinition,
  inputs: Map<string, string>
): string {
  let prompt = agent.prompt;
  
  // 입력 파일 내용 추가
  prompt += '\n\n## 입력 파일\n';
  for (const [name, content] of inputs) {
    prompt += `\n### ${name}\n\`\`\`\n${content}\n\`\`\`\n`;
  }
  
  return prompt;
}
```

### 환경 변수

에이전트 실행 시 자동 주입되는 환경 변수:

| 변수 | 설명 |
|------|------|
| `OBORA_PROJECT_PATH` | 프로젝트 경로 |
| `OBORA_FEATURE` | 현재 feature 이름 |
| `OBORA_STEP` | 현재 단계 이름 |
| `OBORA_WORKFLOW` | 워크플로우 이름 |
| `OBORA_RUN_ID` | 실행 ID |
| `OBORA_AGENT` | 에이전트 ID |

---

## Agent Registry

### 인터페이스

```typescript
interface AgentDefinition {
  id: string;
  description?: string;
  role: string;
  prompt: string;
  techStack?: string[];
  inputs?: InputSpec[];
  outputs?: OutputSpec[];
  config?: AgentConfig;
  examples?: Example[];
}

interface InputSpec {
  file: string;
  description: string;
  required: boolean;
}

interface OutputSpec {
  file: string;
  description: string;
}

interface AgentConfig {
  model?: string;
  timeout?: number;
  temperature?: number;
  max_tokens?: number;
}

interface AgentRegistry {
  /** 에이전트 존재 확인 */
  has(id: string): boolean;
  
  /** 에이전트 정의 조회 */
  get(id: string): AgentDefinition | undefined;
  
  /** 모든 에이전트 ID 목록 */
  list(): string[];
  
  /** 에이전트 등록 */
  register(agent: AgentDefinition): void;
  
  /** 파일에서 로드 */
  loadFromFile(path: string): AgentDefinition;
}
```

### 파싱 로직

```typescript
function parseAgentMarkdown(content: string): AgentDefinition {
  const lines = content.split('\n');
  const agent: Partial<AgentDefinition> = {};
  
  // 헤더 파싱 (# agent: xxx)
  const headerMatch = lines[0].match(/^# agent:\s*(.+)$/);
  if (!headerMatch) {
    throw new Error('Invalid agent header');
  }
  agent.id = headerMatch[1].trim();
  
  // 섹션 파싱
  let currentSection = '';
  let sectionContent: string[] = [];
  
  for (const line of lines.slice(1)) {
    if (line.startsWith('## ')) {
      // 이전 섹션 저장
      if (currentSection) {
        assignSection(agent, currentSection, sectionContent.join('\n'));
      }
      currentSection = line.slice(3).trim().toLowerCase();
      sectionContent = [];
    } else {
      sectionContent.push(line);
    }
  }
  
  // 마지막 섹션 저장
  if (currentSection) {
    assignSection(agent, currentSection, sectionContent.join('\n'));
  }
  
  return agent as AgentDefinition;
}
```

---

## MVP vs Full

### MVP

- [x] 마크다운 형식 정의
- [x] 내장 에이전트 5개
- [x] 기본 프롬프트 구조
- [x] Agent Registry 기본 기능

### Full

- [ ] 커스텀 에이전트 CLI 생성
- [ ] 에이전트 상속/확장
- [ ] 팀 공유 에이전트
- [ ] 에이전트 버저닝
- [ ] 성능 메트릭 (에이전트별)

---

*마지막 수정: 2026-02-03*
