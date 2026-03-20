# Refined Idea: TaskMaster CLI

작성일: 2026-03-20
Cycle: 1

---

## 1. 프로젝트 개요

**TaskMaster** - 프로덕션 수준의 CLI 할 일 관리 도구

### 비전
개발자가 터미널에서 벗어나지 않고 빠르게 할 일을 관리할 수 있는 직관적이고 신뢰할 수 있는 CLI 도구

### 핵심 가치
- **단순성**: 복잡한 설정 없이 바로 사용 가능
- **신뢰성**: 데이터 손실 없는 안전한 저장
- **명확성**: 직관적인 피드백과 에러 메시지
- **테스트 가능성**: 100% 테스트 커버리지 목표

### 기술 스택
- TypeScript 5.x (strict mode)
- Node.js 20+
- Commander.js (CLI 프레임워크)
- Chalk (터미널 색상)
- vitest (테스트)
- JSON 파일 저장 (data/tasks.json)

---

## 2. 이번 Cycle에서 구현할 기능

### ✅ Feature 1: 할 일 CRUD 핵심 기능

#### 명령어 구조
```
taskmaster add "할 일 내용"           # 할 일 추가
taskmaster list                       # 전체 목록 보기
taskmaster list --all                 # 완료된 항목 포함
taskmaster done <id>                  # 완료 처리
taskmaster undone <id>                # 완료 취소
taskmaster remove <id>                # 삭제
taskmaster clear                      # 완료된 항목 일괄 삭제
```

#### 데이터 모델
```typescript
interface Task {
  id: string;           // UUID v4
  content: string;      // 할 일 내용 (1-500자)
  completed: boolean;   // 완료 여부
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

interface TaskStore {
  tasks: Task[];
  version: string;      // 스키마 버전
}
```

### ✅ Feature 2: 프로덕션급 에러 핸들링 & 데이터 무결성

#### 검증 로직
- 할 일 내용: 1-500자, 빈 값 거부
- ID 검증: 존재하지 않는 ID에 대한 명확한 에러
- 동시성: 파일 잠금을 통한 데이터 손실 방지

#### 에러 시나리오
- 파일 없음 → 초기화 안내 메시지
- JSON 손상 → 백업 생성 후 재초기화
- 권한 문제 → 명확한 에러 메시지
- 디스크 가득 참 → 저장 전 공간 확인

---

## 3. 프로덕션 품질 기준

### 🛡️ 에러 핸들링
- [ ] 모든 파일 I/O 작업에 try-catch
- [ ] 사용자 입력 검증 (길이, 형식, 특수문자)
- [ ] 친절한 에러 메시지 (해결 방법 포함)
- [ ] 에러 코드 체계화 (TASK-001, TASK-002...)
- [ ] 로그 파일 기록 (선택적 verbose 모드)

### 🎯 엣지 케이스
- [ ] 빈 할 일 목록일 때 안내 메시지
- [ ] 1000개 이상의 할 일 성능 테스트
- [ ] 동시에 여러 터미널에서 실행 시 데이터 무결성
- [ ] 파일 시스템이 읽기 전용일 때
- [ ] 매우 긴 할 일 내용 (500자 제한)
- [ ] 특수문자, 이모지 처리
- [ ] 시스템 시간이 잘못된 경우

### 💎 UX 기준
- [ ] 모든 명령어 200ms 이내 응답
- [ ] 색상으로 상태 구분 (완료=녹색, 미완료=흰색)
- [ ] 테이블 형태의 가독성 높은 목록
- [ ] 진행률 표시 (완료/전체)
- [ ] 도움말 명령어 (help)
- [ ] 버전 표시 (--version)
- [ ] 대화형 초기 설정 (첫 실행 시)

---

## 4. 완료 기준 (Definition of Done)

### 기능 완료
- [ ] add, list, done, undone, remove, clear 명령어 구현
- [ ] JSON 파일 저장/로드 정상 동작
- [ ] 모든 명령어에 도움말 문서

### 품질 완료
- [ ] 테스트 커버리지 90% 이상
- [ ] 모든 엣지 케이스 테스트 포함
- [ ] TypeScript strict mode 컴파일 통과
- [ ] ESLint/Prettier 설정 및 통과
- [ ] 수동 테스트 시나리오 10개 이상 통과

### 문서화 완료
- [ ] README.md (설치, 사용법, 예제)
- [ ] 코드 주석 (복잡한 로직만)
- [ ] CHANGELOG.md (초기 버전)

### 배포 준비
- [ ] npm 패키지 설정 (package.json)
- [ ] 실행 권한 설정 (bin/taskmaster)
- [ ] 로컬 설치 테스트 (npm link)

---

## 5. 전체 프로젝트 진행률 추정

### 예상 총 Cycle 수: 3-4개

| Cycle | 주요 작업 | 예상 기능 | 진행률 |
|-------|----------|----------|--------|
| **1** (현재) | 핵심 CRUD + 품질 기반 | add, list, done, undone, remove, clear | 40% |
| 2 | 고급 기능 | 검색, 태그, 우선순위, 정렬 | 70% |
| 3 | 사용자 경험 | 통계, 내보내기/가져오기, 설정 | 90% |
| 4 | 마무리 | 문서화, 최적화, 배포 준비 | 100% |

### 현재 Cycle 성공 기준
- ✅ 6개 핵심 명령어 모두 구현
- ✅ 데이터 손실 0건
- ✅ 모든 테스트 통과
- ✅ 실제 사용 가능한 상태

---

## 부록: 명령어 상세 명세

### `taskmaster add <content>`
```bash
$ taskmaster add "프로젝트 기획서 작성하기"
✓ 할 일이 추가되었습니다 (ID: a1b2c3d4)
  [1] 프로젝트 기획서 작성하기
```

### `taskmaster list [--all]`
```bash
$ taskmaster list
┌────┬─────────────────────────────┬──────────┐
│ ID │ 할 일                        │ 상태     │
├────┼─────────────────────────────┼──────────┤
│ 1  │ 프로젝트 기획서 작성하기      │ ○ 미완료 │
│ 2  │ 팀 미팅 준비                 │ ● 완료   │
└────┴─────────────────────────────┴──────────┘
진행률: 1/2 (50%)
```

### `taskmaster done <id>`
```bash
$ taskmaster done 1
✓ 완료 처리되었습니다
  [1] 프로젝트 기획서 작성하기 ✓
```

### `taskmaster remove <id>`
```bash
$ taskmaster remove 1
정말 삭제하시겠습니까? (y/N): y
✓ 삭제되었습니다
```

---

**다음 단계**: 설계 문서 작성 (02-design.md)
