# CLI 명령어 레퍼런스

Obora CLI 명령어 상세 가이드입니다.

> 마지막 업데이트: 2026-01-25

---

## 설치

```bash
# 글로벌 설치
npm install -g @obora/cli

# 또는 npx로 실행
npx @obora/cli <command>
```

---

## 명령어 목록

### 프로젝트 관리

| 명령어 | 설명 |
|--------|------|
| `create` | 새 프로젝트 생성 |
| `init` | 기존 프로젝트 초기화 |
| `upgrade` | 프로젝트 업그레이드 |
| `status` | 프로젝트 상태 확인 |
| `doctor` | 프로젝트 진단 |
| `config` | 설정 관리 |

### Preset 관리

| 명령어 | 설명 |
|--------|------|
| `add` | preset 추가 |
| `remove` | preset 제거 |
| `list` | preset 목록 조회 |
| `eject` | preset 분리 (코드화) |
| `undo` | 마지막 작업 취소 |
| `create-preset` | 새 preset 생성 |

### 도구

| 명령어 | 설명 |
|--------|------|
| `transform` | AST 기반 코드 변환 |
| `sync` | .claude/ 에셋 동기화 |
| `title-generate` | 제목 자동 생성 |

---

## 명령어 상세

### create

새 Obora 프로젝트를 생성합니다.

```bash
obora create <project-name> [options]
```

**옵션**:
- `--base <base>` - 기본 템플릿 선택 (nextjs-standalone, nextjs-monorepo)
- `--apps <apps>` - 모노레포 앱 선택 (쉼표 구분)
- `--yes, -y` - 기본값으로 진행

**예시**:
```bash
# Interactive 모드
obora create my-app

# 템플릿 지정
obora create my-app --base nextjs-standalone

# 모노레포
obora create my-app --base nextjs-monorepo --apps web,api
```

---

### init

기존 프로젝트를 Obora 프로젝트로 초기화합니다.

```bash
obora init [options]
```

**옵션**:
- `--force, -f` - 기존 설정 덮어쓰기

**수행 작업**:
1. `.obora/` 디렉토리 생성
2. `obora.config.json` 생성
3. `.claude/` 에셋 동기화

---

### add

프로젝트에 preset을 추가합니다.

```bash
obora add <preset> [options]
obora add [options]  # Interactive 모드
```

**옵션**:
- `--interactive, -i` - Interactive 모드
- `--target <target>` - 타겟 지정 (standalone, monorepo)
- `--variant <variant>` - variant 선택
- `--dry-run` - 변경 미리보기
- `--force` - 충돌 무시

**예시**:
```bash
# 기본 설치
obora add prisma

# variant 지정
obora add prisma --variant postgres

# Interactive 모드
obora add -i

# dry-run
obora add clerk --dry-run
```

---

### remove

프로젝트에서 preset을 제거합니다.

```bash
obora remove <preset> [options]
```

**옵션**:
- `--dry-run` - 변경 미리보기
- `--force` - 확인 없이 제거

**예시**:
```bash
obora remove prisma
obora remove clerk --dry-run
```

---

### list

설치된 preset 또는 사용 가능한 preset 목록을 조회합니다.

```bash
obora list [options]
```

**옵션**:
- `--available, -a` - 사용 가능한 preset 표시
- `--json` - JSON 형식 출력

**예시**:
```bash
# 설치된 preset
obora list

# 사용 가능한 preset
obora list --available
obora list -a
```

---

### eject

preset을 분리하여 로컬 코드로 변환합니다.

```bash
obora eject <preset> [options]
```

**옵션**:
- `--out <dir>` - 출력 디렉토리 (기본: `./ejected/<preset>`)
- `--dry-run` - 변경 미리보기

**예시**:
```bash
obora eject prisma
obora eject clerk --out ./lib/auth
```

---

### undo

마지막 add/remove 작업을 취소합니다.

```bash
obora undo [options]
```

**옵션**:
- `--delete-files` - 추가된 파일도 삭제
- `--yes, -y` - 확인 없이 실행

**예시**:
```bash
obora undo
obora undo --delete-files
```

---

### doctor

프로젝트 상태를 진단합니다.

```bash
obora doctor [options]
```

**옵션**:
- `--presets` - preset 검증 포함
- `--fix` - 자동 수정 시도

**검사 항목**:
- 설정 파일 유효성
- preset 의존성
- 파일 무결성
- 환경 변수 설정

**예시**:
```bash
obora doctor
obora doctor --presets
obora doctor --fix
```

---

### status

프로젝트 현재 상태를 표시합니다.

```bash
obora status [options]
```

**옵션**:
- `--json` - JSON 형식 출력

**표시 정보**:
- 프로젝트 타입 (standalone/monorepo)
- 설치된 preset
- 환경 변수 상태
- 최근 변경 사항

---

### config

프로젝트 설정을 관리합니다.

```bash
obora config <action> [key] [value]
```

**Actions**:
- `get <key>` - 설정값 조회
- `set <key> <value>` - 설정값 변경
- `list` - 전체 설정 조회
- `reset` - 기본값으로 초기화

**예시**:
```bash
obora config list
obora config get packageManager
obora config set packageManager pnpm
```

---

### upgrade

프로젝트를 최신 버전으로 업그레이드합니다.

```bash
obora upgrade [options]
```

**옵션**:
- `--dry-run` - 변경 미리보기
- `--force` - 강제 업그레이드

---

### sync

`.claude/` 디렉토리의 에셋을 동기화합니다.

```bash
obora sync [options]
```

**옵션**:
- `--type, -t <type>` - 동기화 타입 (skills, settings, all)
- `--force, -f` - 강제 덮어쓰기
- `--list, -l` - 사용 가능한 에셋 목록

**예시**:
```bash
# 전체 동기화
obora sync

# 스킬만 동기화
obora sync -t skills

# 강제 덮어쓰기
obora sync -f

# 에셋 목록 조회
obora sync -l
```

---

### transform

AST 기반 코드 변환을 수행합니다.

```bash
obora transform <type> <target> [options]
```

**Transform 타입**:
- `import` - import 문 추가
- `export` - export 문 추가
- `dependency` - 패키지 의존성 추가
- `config` - 설정 파일 업데이트
- `provider-wrap` - Provider 래핑
- `layout-component` - 레이아웃 컴포넌트 추가
- `nestjs-module` - NestJS 모듈 추가
- `json-property` - JSON 속성 설정

**예시**:
```bash
# import 추가
obora transform import app/page.tsx --from "@tanstack/react-query" --named "useQuery"

# provider 래핑
obora transform provider-wrap app/providers.tsx --provider "ThemeProvider"
```

---

### create-preset

새 preset 템플릿을 생성합니다.

```bash
obora create-preset <name> [options]
```

**옵션**:
- `--category <category>` - 카테고리 지정
- `--description <desc>` - 설명

**예시**:
```bash
obora create-preset my-auth
obora create-preset my-db --category database
```

---

## 공통 옵션

모든 명령어에서 사용 가능한 옵션:

| 옵션 | 설명 |
|------|------|
| `--help, -h` | 도움말 표시 |
| `--version, -v` | 버전 표시 |
| `--verbose` | 상세 출력 |
| `--quiet, -q` | 최소 출력 |

---

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `OBORA_CONFIG_PATH` | 설정 파일 경로 | `./.obora/config.json` |
| `OBORA_PRESETS_PATH` | preset 디렉토리 경로 | 패키지 내장 |
| `OBORA_DEBUG` | 디버그 모드 | `false` |

---

## 참고

- [PRESETS.md](./PRESETS.md) - Preset 상세 가이드
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 아키텍처 문서
- [transform-system.md](./transform-system.md) - Transform 시스템
