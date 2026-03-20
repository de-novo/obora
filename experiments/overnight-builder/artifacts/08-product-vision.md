# Product Vision: Todo CLI

**작성일**: 2026-03-20
**제품 버전**: 1.0.0
**작성자**: 시니어 프로덕트 매니저 / UX 전략가

---

## 1. 현재 사용자 경험 분석

### 1.1 현재 제공하는 핵심 가치

**Todo CLI**는 터미널에서 벗어나지 않고 빠르게 할 일을 관리하고자 하는 사용자를 위한 CLI 도구입니다.

**핵심 가치 제안**:
1. **속도**: 마우스 없이 키보드만으로 1초 만에 할 일 추가
2. **단순함**: 복잡한 기능 없이 핵심 CRUD에 집중
3. **신뢰성**: 로컬 JSON 저장으로 오프라인에서도 항상 작동
4. **포터블**: 데이터는 ~/.todo-cli/todos.json 하나뿐, 언제든 백업/이동 가능

**현재 기능**:
| 명령어 | 기능 | 사용 시나리오 |
|--------|------|--------------|
| `todo add "내용"` | 할 일 추가 | "금방 해야 할 일을 바로 기록" |
| `todo list` | 미완료 목록 | "오늘 해야 할 일 한눈에 확인" |
| `todo list --all` | 전체 목록 | "완료한 일까지 포함해 회고" |
| `todo complete <id>` | 완료 처리 | "일 끝내고 체크" |
| `todo delete <id>` | 삭제 | "더 이상 안 해도 되는 일 제거" |

---

### 1.2 사용자 여정 (User Journey)

#### 여정 1: 첫 사용 (Onboarding)

**현재 상태**:
```
[설치] → [todo add 테스트] → [todo list 확인] → [성공!]
```

**상세 분석**:

1. **설치 단계** (현재: ⚠️ 개선 필요)
   - 개발자: `git clone` → `npm install` → `npm link` (복잡함)
   - 일반 사용자: npm 배포 안 됨 (진입 불가)
   - **문제**: README 부재로 설치 방법 알 수 없음

2. **첫 실행** (현재: ✅ 우수)
   ```bash
   todo add "첫 할 일"
   # 할 일이 추가되었습니다: 첫 할 일 (ID: abc-123)
   ```
   - 직관적인 메시지
   - ID가 바로 표시되어 다음 행동(완료/삭제) 연결 가능

3. **목록 확인** (현재: ✅ 우수)
   ```bash
   todo list
   # 1. [ ] 첫 할 일 (ID: abc-123)
   ```
   - 명확한 포맷
   - 빈 목록일 때도 "할 일이 없습니다." 메시지로 친절함

**개선 필요사항**:
- npm 배포로 `npm install -g todo-cli` 가능하게 함
- README로 설치/사용법 제공

---

#### 여정 2: 일상 사용 (Daily Use)

**전형적인 하루 시나리오**:

```
09:00  todo add "오전 회의 준비"
09:05  todo add "코드 리뷰"
10:30  todo complete <회의-ID>
11:00  todo add "점심 약속 예약"
14:00  todo list
       # 1. [ ] 코드 리뷰 (ID: ...)
       # 2. [ ] 점심 약속 예약 (ID: ...)
17:00  todo complete <코드리뷰-ID>
18:00  todo list --all
       # 회고하며 하루 마무리
```

**강점**:
- ✅ 명령어가 직관적 (add/list/complete/delete)
- ✅ 빠른 실행 (JSON 파일 I/O, 복잡한 로직 없음)
- ✅ 명확한 피드백 메시지
- ✅ ID 기반으로 정확한 항목 지정 가능

**약점**:
- ⚠️ 검색 기능 없음 (할 일 50개 넘어가면 찾기 어려움)
- ⚠️ 정렬 옵션 없음 (항상 최신순)
- ⚠️ 태그/카테고리 없음 (업무/개인 구분 불가)

---

#### 여정 3: 고급 사용 (Power User)

**현재 지원하는 고급 기능**:

1. **환경변수 설정**
   ```bash
   export TODO_CLI_DATA_DIR=/synced/folder
   # Dropbox/Google Drive 폴더로 설정 → 간접적 동기화
   ```

2. **데이터 백업**
   ```bash
   cp ~/.todo-cli/todos.json ~/backup/
   ```

3. **라이브러리로 사용**
   ```typescript
   import { TodoService, JsonStore } from 'todo-cli';
   
   const store = new JsonStore('/custom/path');
   const service = new TodoService(store);
   const todo = await service.add('라이브러리로 사용');
   ```

**강점**:
- ✅ 환경변수로 데이터 위치 변경 가능
- ✅ JSON 포맷으로 쉬운 백업/복구
- ✅ TypeScript 타입 제공으로 라이브러리 사용 용이

**약점**:
- ⚠️ 내장 백업 기능 없음
- ⚠️ 가져오기/내보내기 없음
- ⚠️ 통계/대시보드 없음

---

### 1.3 현재 UX의 강점과 약점

#### 강점 ⭐⭐⭐⭐⭐ (5/5)

| 항목 | 설명 | 사용자 가치 |
|------|------|------------|
| **직관적 명령어** | add/list/complete/delete | 학습 비용 낮음 |
| **빠른 실행** | 평균 100ms 이내 | 생산성 향상 |
| **명확한 피드백** | 한국어 메시지, ID 표시 | 혼란 방지 |
| **안정적 동작** | 228개 테스트 100% 통과 | 신뢰성 |
| **오프라인 작동** | 로컬 JSON 저장 | 언제든 사용 가능 |
| **크로스 플랫폼** | Windows/macOS/Linux | 환경 무관 |

#### 약점 ⭐⭐⭐ (3/5)

| 항목 | 설명 | 영향도 |
|------|------|--------|
| **검색 기능 없음** | 키워드로 찾기 불가 | 할 일 많아지면 사용성 저하 |
| **README 부재** | 설치/사용법 문서 없음 | 신규 사용자 진입 장벽 |
| **npm 미배포** | 글로벌 설치 불가 | 배포 채널 부재 |
| **태그/카테고리 없음** | 분류 체계 없음 | 관리 효율성 저하 |
| **정렬/필터 없음** | 항상 최신순 표시 | 대량 데이터 관리 어려움 |

---

## 2. 타겟 사용자 페르소나

### 2.1 페르소나 1: "빠른 개발자 김철수" (Primary)

**프로필**:
- 나이: 28세
- 직업: 백엔드 개발자
- 근무 환경: 터미널 기반 (tmux + vim)
- 기술 수준: 높음

**특성**:
- 하루에 터미널에서 8시간 이상 작업
- 마우스 사용 최소화 선호
- 단순하고 빠른 도구 선호
- 복잡한 GUI 앱은 무겁다고 느낌

**핵심 니즈**:
1. **속도**: 1초 만에 할 일 추가하고 싶음
2. **단순함**: 복잡한 기능 필요 없음
3. **포커스**: 터미널 벗어나지 않고 관리
4. **자동화**: 스크립트와 연동 가능

**현재 제품 만족도**: ⭐⭐⭐⭐⭐ (5/5)
- ✅ add/list/complete/delete로 충분
- ✅ JSON 포맷으로 스크립트 연동 가능
- ✅ 빠르고 가벼움

**부족한 점**:
- ⚠️ 검색 기능 필요 (할 일 30개 넘을 때)
- ⚠️ GitHub Issues 연동 있으면 좋겠음

**인용**:
> "그냥 빠르게 할 일 적어두고 싶어요. Trello? 너무 무거워요. Todoist? 마우스 써야 해요. 그냥 터미널에서 `todo add` 치면 끝나는 게 최고예요."

---

### 2.2 페르소나 2: "체계적인 기획자 이영희" (Secondary)

**프로필**:
- 나이: 32세
- 직업: 프로덕트 매니저
- 근무 환경: Mac + Notion + Slack
- 기술 수준: 중간

**특성**:
- 여러 프로젝트 동시 관리
- 업무/개인 할 일 구분 필요
- 마감일 관리 중요
- 시각적 정리 선호

**핵심 니즈**:
1. **분류**: 프로젝트별/업무별 태그
2. **우선순위**: 중요도 표시
3. **마감일**: 기한 설정 및 알림
4. **연동**: Notion/Jira와 연계

**현재 제품 만족도**: ⭐⭐⭐ (3/5)
- ✅ 기본 CRUD는 직관적
- ⚠️ 태그/우선순위 없음
- ⚠️ 마감일 없음
- ⚠️ Notion 연동 없음

**필요한 기능**:
```bash
todo add "기획서 작성" --tag project-a --priority high --due 2026-03-25
todo list --tag project-a
todo list --overdue
```

**인용**:
> "기본 기능은 좋아요. 근데 프로젝트별로 구분할 수 없어서 아쉬워요. 태그라도 있으면 좋겠어요."

---

### 2.3 페르소나 3: "생산성 유틸리티 수집가 박민수" (Tertiary)

**프로필**:
- 나이: 35세
- 직업: 프리랜서 개발자
- 근무 환경: 다양한 도구 사용 (Obsidian, Logseq, VS Code)
- 기술 수준: 높음

**특성**:
- 새로운 생산성 도구에 관심 많음
- 데이터 포터블리티 중요
- 자동화/연동 적극 활용
- 오픈소스 기여 경험 있음

**핵심 니즈**:
1. **연동**: Obsidian/Notion/VS Code와 연계
2. **내보내기**: Markdown/CSV로 내보내기
3. **확장성**: 플러그인 시스템
4. **커스텀**: 커스텀 명령어/포맷

**현재 제품 만족도**: ⭐⭐⭐⭐ (4/5)
- ✅ JSON 포맷으로 데이터 접근 용이
- ✅ 라이브러리로 사용 가능
- ✅ 환경변수로 커스터마이징 가능
- ⚠️ 공식 연동 기능 없음
- ⚠️ 플러그인 시스템 없음

**필요한 기능**:
```bash
todo export --format markdown > todos.md
todo export --format csv > todos.csv
# Obsidian 폴더에 바로 저장
export TODO_CLI_DATA_DIR=~/obsidian-vault/.todo-cli
```

**인용**:
> "JSON으로 저장되니까 스크립트 짜서 Obsidian이랑 연동할 수 있어요. 근데 공식적으로 내보내기 기능 있으면 더 편할 것 같아요."

---

### 2.4 페르소나별 만족도 매트릭스

| 페르소나 | 현재 만족도 | 핵심 부족 기능 | 개선 시 예상 만족도 |
|----------|-----------|---------------|-------------------|
| 김철수 (개발자) | ⭐⭐⭐⭐⭐ (5/5) | 검색, GitHub 연동 | ⭐⭐⭐⭐⭐ (5/5) |
| 이영희 (기획자) | ⭐⭐⭐ (3/5) | 태그, 우선순위, 마감일 | ⭐⭐⭐⭐⭐ (5/5) |
| 박민수 (프리랜서) | ⭐⭐⭐⭐ (4/5) | 내보내기, 연동, 플러그인 | ⭐⭐⭐⭐⭐ (5/5) |

---

## 3. 기능 로드맵

### 3.1 Phase 1: 핵심 경험 완성 (Must-have) - Cycle 2

**목표**: 사용자가 제품을 찾고, 설치하고, 바로 사용할 수 있게 만든다.

#### 기능 1.1: README.md 작성

**사용자 스토리**:
> As a 신규 사용자,
> I want 명확한 설치/사용 가이드를 보고 싶다,
> so that 5분 안에 제품을 사용할 수 있다.

**구현 내용**:
```markdown
# Todo CLI

터미널에서 빠르게 할 일을 관리하세요.

## 설치

npm install -g todo-cli

## 빠른 시작

todo add "할 일 추가"
todo list
todo complete <id>

## 명령어

| 명령어 | 설명 |
|--------|------|
| add <내용> | 할 일 추가 |
| list | 미완료 목록 |
| list --all | 전체 목록 |
| complete <id> | 완료 처리 |
| delete <id> | 삭제 |
| --help | 도움말 |
| --version | 버전 |

## 환경 설정

export TODO_CLI_DATA_DIR=/custom/path

## 라이선스

MIT
```

**구현 복잡도**: S (1시간)
**완료 기준**:
- GitHub/npm에 README 표시
- 설치/사용법 포함
- 모든 명령어 예시 포함

---

#### 기능 1.2: npm 배포

**사용자 스토리**:
> As a 사용자,
> I want `npm install -g todo-cli`로 설치하고 싶다,
> so that 1분 안에 전역에서 `todo` 명령어를 사용할 수 있다.

**구현 내용**:
1. package.json 검토
   - name: `@your-scope/todo-cli` 또는 `todo-cli-unique-name`
   - version: 1.0.0
   - bin: `{"todo": "./dist/index.js"}`
   - keywords: cli, todo, task, management

2. .npmignore 작성
   ```
   src/
   test/
   artifacts/
   *.log
   tsconfig.json
   vitest.config.ts
   ```

3. npm publish 실행

**구현 복잡도**: S (30분)
**완료 기준**:
- `npm install -g todo-cli` 성공
- `todo --version` 출력
- Windows/macOS/Linux 모두 작동

---

#### 기능 1.3: 검색 기능

**사용자 스토리**:
> As a 김철수 (개발자),
> I want `todo search "키워드"`로 할 일을 찾고 싶다,
> so that 50개 넘는 할 일 중에서 원하는 항목을 빠르게 찾을 수 있다.

**구현 내용**:

**CLI 인터페이스**:
```bash
todo search <키워드>

# 예시
todo search "회의"
# 1. [ ] 오전 회의 준비 (ID: abc-123)
# 2. [ ] 팀 회의 자료 작성 (ID: def-456)

todo search "RE"  # 대소문자 무시
# 1. [ ] Report 작성 (ID: xyz-789)
# 2. [ ] Review 요청 (ID: uvw-012)
```

**기술 구현**:
```typescript
// src/commands/search.ts
export class SearchCommand {
  constructor(
    private service: TodoService,
    private keyword: string,
    private options?: { all?: boolean; caseSensitive?: boolean }
  ) {}

  async execute(): Promise<CommandResult> {
    const data = await this.service.list({ all: this.options?.all ?? true });
    const keyword = this.options?.caseSensitive 
      ? this.keyword 
      : this.keyword.toLowerCase();
    
    const results = data.filter(todo => {
      const content = this.options?.caseSensitive 
        ? todo.content 
        : todo.content.toLowerCase();
      return content.includes(keyword);
    });

    return {
      success: true,
      data: results,
      message: results.length === 0 
        ? `"${this.keyword}"에 대한 검색 결과가 없습니다.`
        : undefined,
    };
  }
}
```

**구현 복잡도**: M (2-3시간)
**완료 기준**:
- `todo search "키워드"` 작동
- 대소문자 구분 없는 검색 (기본)
- `--case-sensitive` 옵션
- `--all` 옵션 (완료 항목 포함)
- 테스트 15개 이상 작성

---

#### 기능 1.4: ESLint 복구

**사용자 스토리**:
> As a 개발자,
> I want 코드 품질 도구가 정상 작동하기를 바란다,
> so that 코드 일관성을 유지하고 잠재적 버그를 조기 발견할 수 있다.

**구현 내용**:
```bash
npm install eslint@latest @typescript-eslint/eslint-plugin@latest @typescript-eslint/parser@latest
npm run lint
```

**구현 복잡도**: S (30분)
**완료 기준**:
- `npm run lint` 실행 시 에러 0개
- 기존 코드 스타일 유지

---

### 3.2 Phase 2: 차별화 기능 (Nice-to-have) - Cycle 3~5

**목표**: 경쟁 제품 대비 차별점을 만들어 "이거 때문에 쓴다"는 이유를 제공한다.

#### 기능 2.1: 태그 시스템

**사용자 스토리**:
> As a 이영희 (기획자),
> I want 할 일에 태그를 붙이고 싶다,
> so that 프로젝트별/업무별로 할 일을 분류할 수 있다.

**CLI 인터페이스**:
```bash
# 태그 추가
todo add "기획서 작성" --tag project-a --tag urgent

# 태그로 필터링
todo list --tag project-a
todo list --tag urgent

# 모든 태그 보기
todo tags
# project-a (15), urgent (3), personal (7)
```

**기술적 의존성**:
- 데이터 마이그레이션 (v1.0.0 → v1.1.0)
- Todo 인터페이스 확장 (`tags: string[]`)

**구현 복잡도**: M (3-4시간)

---

#### 기능 2.2: 우선순위 시스템

**사용자 스토리**:
> As a 이영희 (기획자),
> I want 할 일에 우선순위를 지정하고 싶다,
> so that 중요한 일을 먼저 처리할 수 있다.

**CLI 인터페이스**:
```bash
# 우선순위 지정
todo add "긴급 버그 수정" --priority high
todo add "문서 정리" --priority low

# 우선순위별 정렬
todo list --sort priority
# [!] 긴급 버그 수정 (high)
# [ ] 기능 개발 (medium)
# [ ] 문서 정리 (low)
```

**기술적 의존성**:
- 데이터 마이그레이션
- Todo 인터페이스 확장 (`priority: 'high' | 'medium' | 'low'`)

**구현 복잡도**: M (2-3시간)

---

#### 기능 2.3: 데이터 내보내기

**사용자 스토리**:
> As a 박민수 (프리랜서),
> I want 할 일을 Markdown/CSV로 내보내고 싶다,
> so에 Obsidian/Notion에서 활용하거나 백업할 수 있다.

**CLI 인터페이스**:
```bash
# Markdown 내보내기
todo export --format markdown > todos.md

# 출력 예시
# # 할 일 목록 (2026-03-20)
# 
# ## 미완료 (5)
# - [ ] 기획서 작성
# - [ ] 코드 리뷰
# 
# ## 완료 (10)
# - [x] 회의 참석

# CSV 내보내기
todo export --format csv > todos.csv
# id,content,completed,createdAt
# abc-123,기획서 작성,false,2026-03-20T10:00:00Z
```

**기술적 의존성**: 없음

**구현 복잡도**: M (2-3시간)

---

#### 기능 2.4: 통계 기능

**사용자 스토리**:
> As a 사용자,
> I want 내 생산성 통계를 보고 싶다,
> so that 얼마나 많은 일을 처리했는지 파악할 수 있다.

**CLI 인터페이스**:
```bash
todo stats
# 📊 생산성 통계
# ━━━━━━━━━━━━━━━━━━━━━━
# 총 할 일: 50개
# 완료: 30개 (60%)
# 미완료: 20개
# 
# 이번 주 완료: 12개
# 이번 달 완료: 45개
```

**구현 복잡도**: M (2시간)

---

### 3.3 Phase 3: 생태계 확장 (Growth) - Cycle 6+

**목표**: 플러그인/연동으로 생태계를 확장하고, 커뮤니티를 형성한다.

#### 기능 3.1: 플러그인 시스템

**사용자 스토리**:
> As a 커뮤니티 개발자,
> I want 플러그인을 만들어 기능을 확장하고 싶다,
> so that 제품에 없는 기능을 직접 추가할 수 있다.

**아키텍처**:
```
~/.todo-cli/
├── todos.json
├── config.json
└── plugins/
    ├── todo-plugin-github/
    ├── todo-plugin-notion/
    └── todo-plugin-stats/
```

**플러그인 인터페이스**:
```typescript
interface TodoPlugin {
  name: string;
  version: string;
  commands?: Record<string, CommandHandler>;
  hooks?: {
    onAdd?: (todo: Todo) => void;
    onComplete?: (todo: Todo) => void;
    onDelete?: (todo: Todo) => void;
  };
}
```

**구현 복잡도**: L (1-2주)

---

#### 기능 3.2: GitHub Issues 연동

**사용자 스토리**:
> As a 김철수 (개발자),
> I want GitHub Issues를 할 일로 가져오고 싶다,
> so에 터미널에서 모든 작업을 통합 관리할 수 있다.

**CLI 인터페이스**:
```bash
# GitHub 연동 설정
todo github auth

# Issues 가져오기
todo import --github user/repo
todo import --github user/repo --label bug

# 완료 시 Issue 자동 close
todo complete <id> --close-issue
```

**기술적 의존성**:
- GitHub OAuth
- Octokit 라이브러리

**구현 복잡도**: L (1주)

---

#### 기능 3.3: 클라우드 동기화

**사용자 스토리**:
> As a 멀티 디바이스 사용자,
> I want 할 일을 클라우드에 동기화하고 싶다,
> so that 어디서든 같은 할 일 목록에 접근할 수 있다.

**옵션**:
1. GitHub Gists (무료, 개발자 친화적)
2. Firebase (구글 계정)
3. 자체 클라우드 (유료)

**CLI 인터페이스**:
```bash
# GitHub Gists 연동
todo sync --login
todo sync
todo pull
todo push
```

**구현 복잡도**: L (1주)

---

## 4. 경쟁 분석

### 4.1 경쟁 제품 비교

| 제품 | 형태 | 강점 | 약점 | 가격 |
|------|------|------|------|------|
| **Todoist** | Web/App/CLI | 기능 풍부, 자연어 입력 | 유료 기능 많음, 무거움 | Freemium |
| **Taskwarrior** | CLI | 강력한 필터, 동기화 | 학습 곡선 높음 | 무료 |
| **Microsoft To Do** | Web/App | MS 연동, 무료 | CLI 없음 | 무료 |
| **Notion** | Web/App | 유연함, 데이터베이스 | 느림, CLI 없음 | Freemium |
| **Obsidian + Tasks** | App/Plugin | Markdown 기반, 로컬 | CLI 없음 | 무료 |

### 4.2 Todo CLI의 포지셔닝

**경쟁 우위**:
1. **단순함**: Todoist/Notion보다 훨씬 가벼움
2. **속도**: Taskwarrior보다 학습 곡선 낮음
3. **개발자 친화적**: 터미널 기반, JSON 포맷, TypeScript

**차별화 포인트**:
- **터미널 퍼스트**: 마우스 없이 키보드만으로 모든 작업
- **JSON 포맷**: 스크립트와 연동 용이
- **TypeScript**: 타입 안전성, 라이브러리 사용 가능
- **오프라인**: 로컬 저장으로 언제든 작동

**타겟 시장**:
- 1차: 터미널 기반 개발자 (김철수)
- 2차: 단순함을 추구하는 기획자/PM (이영희)
- 3차: 생산성 도구 얼리어답터 (박민수)

---

## 5. 사용자 획득 전략

### 5.1 초기 사용자 모으기

#### 전략 1: 개발자 커뮤니티 타겟팅

**채널**:
- Reddit: r/commandline, r/productivity, r/typescript
- Hacker News: Show HN
- 한국 커뮤니티: 클리앙, 개드립, OKKY

**메시지**:
> "터미널에서 1초 만에 할 일 추가하세요. 마우스 필요 없습니다."

---

#### 전략 2: 오픈소스 생태계 활용

**활동**:
- GitHub Stars 유도
- Awesome CLI Apps 등록
- npm weekly 다운로드 노출

---

#### 전략 3: 콘텐츠 마케팅

**주제**:
- "왜 개발자는 GUI TODO 앱을 쓰지 말아야 하는가"
- "터미널로 생산성 10배 높이기"
- "Todo CLI로 30일 생산성 챌린지"

---

### 5.2 배포 채널

#### 5.2.1 npm (Primary)

```bash
npm install -g todo-cli
```

**준비물**:
- README.md
- LICENSE (MIT)
- .npmignore
- package.json (keywords, description)

---

#### 5.2.2 Homebrew (Secondary)

```bash
brew install todo-cli
```

**준비물**:
- Homebrew Formula 작성
- GitHub Release 태그

---

#### 5.2.3 GitHub Releases

```bash
# 다운로드 후 설치
curl -L https://github.com/user/todo-cli/releases/download/v1.0.0/todo-cli-linux -o todo
chmod +x todo
sudo mv todo /usr/local/bin/
```

**준비물**:
- 바이너리 빌드 (pkg/nexe)
- Linux/macOS/Windows 바이너리

---

### 5.3 문서화/온보딩 전략

#### 5.3.1 README.md 구조

```markdown
# Todo CLI

## 30초 소개
터미널에서 빠르게 할 일을 관리하세요.

## 1분 설치
npm install -g todo-cli

## 5분 튜토리얼
todo add "첫 할 일"
todo list
todo complete <id>

## 10분 마스터
- 환경 설정
- 고급 기능
- 스크립트 연동

## FAQ
```

---

#### 5.3.2 인터랙티브 튜토리얼

```bash
todo tutorial
# Todo CLI 튜토리얼에 오신 것을 환영합니다!
# 
# Step 1: 할 일 추가해 보세요
# > todo add "튜토리얼 테스트"
# 
# Step 2: 목록을 확인하세요
# > todo list
# 
# Step 3: 완료 처리하세요
# > todo complete <id>
# 
# 축하합니다! 기본 기능을 마스터했습니다.
```

---

## 6. 다음 Cycle 기능 기획서 (Cycle 2)

### 6.1 개요

**Cycle 2 목표**: 문서화 + 배포 + 검색 기능으로 사용자 접근성 확보

**작업 항목**:
1. README.md 작성 (1시간)
2. npm publish (30분)
3. 검색 기능 구현 (2-3시간)
4. ESLint 복구 (30분)

**총 예상 소요**: 4-5시간

---

### 6.2 기능 1: README.md 작성

**상세 기획**:

**섹션 구성**:
1. **헤더**: 제목, 배지 (npm version, license, downloads)
2. **소개**: 30초 elevator pitch
3. **설치**: npm install -g todo-cli
4. **빠른 시작**: 5분 튜토리얼
5. **명령어 레퍼런스**: 모든 명령어 예시
6. **환경 설정**: TODO_CLI_DATA_DIR
7. **고급 사용**: 라이브러리로 사용
8. **기여 방법**: CONTRIBUTING.md 링크
9. **라이선스**: MIT

**수용 기준 (Acceptance Criteria)**:
- [ ] GitHub 저장소 메인 페이지에 README 표시
- [ ] npm 패키지 페이지에 README 표시
- [ ] 설치 명령어가 복사 가능한 코드 블록
- [ ] 모든 명령어에 예시 포함
- [ ] 한글/영어 버전 제공 (선택)

---

### 6.3 기능 2: npm publish

**상세 기획**:

**작업 순서**:
1. package.json name 중복 확인
   - `npm search todo-cli`
   - 대안: `@scope/todo-cli` 또는 `todo-cli-tool`

2. .npmignore 작성
   ```
   src/
   test/
   artifacts/
   *.log
   tsconfig.json
   vitest.config.ts
   .eslintrc.json
   ```

3. npm publish 실행
   ```bash
   npm login
   npm publish
   ```

4. 설치 테스트
   ```bash
   npm install -g todo-cli
   todo --version
   # 1.0.0
   ```

**수용 기준**:
- [ ] `npm search todo-cli`에 노출
- [ ] `npm install -g todo-cli` 성공
- [ ] Windows/macOS/Linux 모두 설치 성공
- [ ] `todo --version` 명령어 작동

---

### 6.4 기능 3: 검색 기능

**상세 기획**:

#### 사용자 스토리

```
As a 할 일이 많은 사용자,
I want 키워드로 할 일을 검색하고 싶다,
so that 50개 넘는 목록에서 원하는 항목을 빠르게 찾을 수 있다.
```

#### 수용 기준 (Acceptance Criteria)

**기본 검색**:
- [ ] `todo search "키워드"` 명령어 작동
- [ ] 부분 일치 검색 ("회의" → "회의 준비", "팀 회의")
- [ ] 대소문자 구분 없는 검색 (기본)
- [ ] 검색 결과가 없으면 "검색 결과가 없습니다." 메시지

**고급 옵션**:
- [ ] `--case-sensitive` 옵션으로 대소문자 구분
- [ ] `--all` 옵션으로 완료 항목 포함
- [ ] `--regex` 옵션으로 정규식 검색 (선택)

**출력 포맷**:
- [ ] `list` 명령어와 동일한 포맷
- [ ] 검색어 하이라이트 (선택)
- [ ] 검색 결과 개수 표시

**에러 처리**:
- [ ] 빈 키워드 시 "검색어를 입력하세요." 메시지
- [ ] 너무 짧은 키워드 (1글자) 경고 (선택)

#### CLI 인터페이스 예시

```bash
# 기본 검색
$ todo search "회의"
검색 결과 (3건):
1. [ ] 오전 회의 준비 (ID: abc-123)
2. [ ] 팀 회의 자료 작성 (ID: def-456)
3. [x] 회의 참석 (ID: ghi-789)

# 대소문자 구분 검색
$ todo search "BUG" --case-sensitive
검색 결과 (2건):
1. [ ] Fix BUG-123 (ID: xyz-123)

# 완료 항목 제외 (기본)
$ todo search "회의"
# 완료된 "회의 참석"은 제외됨

# 모든 항목 포함
$ todo search "회의" --all
검색 결과 (3건):
1. [ ] 오전 회의 준비 (ID: abc-123)
2. [ ] 팀 회의 자료 작성 (ID: def-456)
3. [x] 회의 참석 (ID: ghi-789)

# 결과 없음
$ todo search "없는키워드"
"없는키워드"에 대한 검색 결과가 없습니다.

# 빈 키워드
$ todo search
검색어를 입력하세요.
사용법: todo search <키워드>
```

#### 기술 구현

**파일 구조**:
```
src/
├── commands/
│   └── search.ts        # SearchCommand 클래스
├── services/
│   └── todo-service.ts  # search 메서드 추가
└── index.ts             # search 명령어 등록
```

**SearchCommand 구현**:
```typescript
// src/commands/search.ts
import type { TodoService } from '../services/todo-service.js';
import type { CommandResult } from './add.js';

export interface SearchOptions {
  all?: boolean;
  caseSensitive?: boolean;
}

export class SearchCommand {
  constructor(
    private readonly service: TodoService,
    private readonly keyword: string,
    private readonly options: SearchOptions = {}
  ) {}

  async execute(): Promise<CommandResult> {
    // 빈 키워드 검증
    if (!this.keyword || this.keyword.trim().length === 0) {
      return {
        success: false,
        message: '검색어를 입력하세요.\n사용법: todo search <키워드>',
      };
    }

    // 검색 실행
    const todos = await this.service.list({ all: this.options.all ?? true });
    const searchTerm = this.options.caseSensitive 
      ? this.keyword 
      : this.keyword.toLowerCase();

    const results = todos.filter(todo => {
      const content = this.options.caseSensitive 
        ? todo.content 
        : todo.content.toLowerCase();
      return content.includes(searchTerm);
    });

    // 결과 포맷팅
    if (results.length === 0) {
      return {
        success: true,
        message: `"${this.keyword}"에 대한 검색 결과가 없습니다.`,
        data: [],
      };
    }

    return {
      success: true,
      message: `검색 결과 (${results.length}건):`,
      data: results,
    };
  }
}
```

**CLI 등록 (index.ts)**:
```typescript
import { SearchCommand } from './commands/search.js';

program
  .command('search <keyword>')
  .description('키워드로 할 일을 검색합니다')
  .option('--all', '완료된 항목 포함')
  .option('--case-sensitive', '대소문자 구분')
  .action(async (keyword: string, options: SearchOptions) => {
    const command = new SearchCommand(service, keyword, options);
    const result = await command.execute();
    
    if (result.message) {
      process.stdout.write(`${result.message}\n`);
    }
    
    if (Array.isArray(result.data) && result.data.length > 0) {
      result.data.forEach((todo, index) => {
        const status = todo.completed ? '[x]' : '[ ]';
        process.stdout.write(`${index + 1}. ${status} ${todo.content} (ID: ${todo.id})\n`);
      });
    }
    
    process.exit(result.success ? 0 : 1);
  });
```

#### 테스트 계획

**단위 테스트** (test/commands/search.test.ts):
- [ ] 빈 키워드 검증
- [ ] 부분 일치 검색
- [ ] 대소문자 무시 (기본)
- [ ] 대소문자 구분 (--case-sensitive)
- [ ] 완료 항목 제외 (기본)
- [ ] 완료 항목 포함 (--all)
- [ ] 결과 없음 시나리오
- [ ] 특수문자 포함 키워드
- [ ] 이모지 포함 키워드
- [ ] 매우 긴 키워드

**통합 테스트** (test/integration/cli.test.ts):
- [ ] `todo search "키워드"` 전체 플로우
- [ ] `todo search "키워드" --all` 전체 플로우
- [ ] `todo search "키워드" --case-sensitive` 전체 플로우

**예상 테스트 케이스**: 15+ 개

---

### 6.5 input/idea.md용 요약

```markdown
# Cycle 2: 문서화, 배포, 검색 기능

## 목표
1. npm 배포로 사용자 접근성 확보
2. 검색 기능으로 사용성 향상
3. 품질 도구 정상화

## 작업 내용

### 1. README.md 작성
- 설치 방법, 사용법, 명령어 레퍼런스
- npm/GitHub에 표시

### 2. npm publish
- .npmignore 작성
- npm publish 실행
- 글로벌 설치 테스트

### 3. 검색 기능
- `todo search <키워드>` 명령어
- 대소문자 무시 (기본)
- `--case-sensitive` 옵션
- `--all` 옵션
- 15+ 테스트 케이스

### 4. ESLint 복구
- 최신 버전으로 업그레이드
- 린트 에러 0개

## 완료 기준
- [ ] README.md 작성 완료
- [ ] npm publish 성공
- [ ] `npm install -g todo-cli` 설치 후 정상 동작
- [ ] `todo search "키워드"` 구현
- [ ] 검색 테스트 15개 이상 통과
- [ ] ESLint 에러 0개

## 예상 소요
4-5시간

## 다음 Cycle 예고
- 태그 시스템
- 데이터 내보내기
- 통계 기능
```

---

**문서 작성 완료일**: 2026-03-20
**다음 리뷰 예정**: Cycle 2 완료 후
**문서 버전**: 1.0.0
