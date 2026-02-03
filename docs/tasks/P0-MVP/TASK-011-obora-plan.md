# TASK-011: obora plan 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 3시간
- 담당: 개발자

## 목표
AI를 사용하여 스펙 문서(proposal.md, design.md)를 생성하는 명령어 구현

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora plan [options]` 명령어 등록
   - `--feature` 옵션 (대상 기능 이름)
   - `--prompt` 옵션 (추가 컨텍스트)
   - `--interactive` 옵션 (대화형 모드)
   - `--dry-run` 옵션 (미리보기)

2. **OpenClaw 에이전트 연동**
   - architect 에이전트 호출
   - 프롬프트 구성 (기존 문서 + 사용자 입력)
   - 응답 파싱 및 검증

3. **문서 생성/업데이트**
   - `proposal.md` 생성 또는 업데이트
   - `design.md` 생성 또는 업데이트
   - `tasks.md` 생성 (선택)
   - 백업 파일 생성 (기존 문서 있는 경우)

4. **대화형 모드**
   - 단계별 질문/응답
   - 중간 결과 확인 및 수정
   - 최종 승인 후 저장

5. **에러 처리**
   - OpenClaw 연결 실패
   - 기능 폴더 없음
   - AI 응답 파싱 실패

## 완료 조건
- [ ] `obora plan` 실행 시 AI가 스펙 문서 생성
- [ ] 기존 문서 있으면 업데이트 (백업 포함)
- [ ] `--dry-run` 시 실제 저장 없이 미리보기
- [ ] 대화형 모드 동작

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)
- TASK-004 (obora new - 기능 폴더 생성)

## 테스트 케이스
```typescript
// 기본 plan 실행
await runCommand('obora plan --feature login-feature');
expect(fs.existsSync('.obora/features/login-feature/proposal.md')).toBe(true);
expect(fs.existsSync('.obora/features/login-feature/design.md')).toBe(true);

// dry-run 모드
const result = await runCommand('obora plan --feature login-feature --dry-run');
expect(result.stdout).toContain('Preview:');
// 파일 변경 없음 확인

// 추가 컨텍스트 제공
await runCommand('obora plan --feature login-feature --prompt "React + TypeScript 기반"');
const proposal = fs.readFileSync('.obora/features/login-feature/proposal.md', 'utf8');
expect(proposal).toContain('React');

// 기능 없음 에러
await expect(runCommand('obora plan --feature nonexistent')).rejects.toThrow('Feature not found');

// OpenClaw 연결 실패
// (mock으로 테스트)
```

## 참고 자료
- [[02-cli-commands.md#obora plan]]
- [[08-agent-definition.md]] (architect 에이전트)
