// test/e2e/error-recovery.test.ts
// 에러 복구 E2E 테스트

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';

describe('Error Recovery E2E Tests', () => {
  let tempDir: string;
  let todoHome: string;
  let cliPath: string;

  beforeEach(async () => {
    const randomSuffix = randomBytes(8).toString('hex');
    tempDir = join(tmpdir(), `todo-cli-e2e-err-${randomSuffix}`);
    todoHome = join(tempDir, '.todo-cli');
    cliPath = join(process.cwd(), 'dist', 'index.js');
    
    await fs.mkdir(todoHome, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 무시
    }
  });

  const execCLI = (args: string): { stdout: string; stderr: string; exitCode: number } => {
    try {
      const stdout = execSync(`node ${cliPath} ${args}`, {
        encoding: 'utf8',
        env: { ...process.env, TODO_HOME: todoHome },
        timeout: 5000
      });
      
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        exitCode: execError.status || 1
      };
    }
  };

  describe('JSON 파일 손상 복구', () => {
    it('should recover from corrupted JSON file', async () => {
      // 손상된 JSON 파일 생성
      const dataPath = join(todoHome, 'todos.json');
      await fs.writeFile(dataPath, 'invalid json{', 'utf8');
      
      // list 명령 실행 (자동 복구 시도)
      const result = execCLI('list');
      
      // 복구되어 정상 동작해야 함
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('할 일이 없습니다');
    });

    it('should recover from backup when main file is corrupted', async () => {
      // 정상 데이터 생성
      execCLI('add "백업 테스트"');
      
      // 백업 파일 확인
      const backupPath = join(todoHome, 'todos.json.bak');
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
      
      // 메인 파일 손상
      const dataPath = join(todoHome, 'todos.json');
      await fs.writeFile(dataPath, 'corrupted', 'utf8');
      
      // list 명령 실행 (백업에서 복구)
      const result = execCLI('list');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('백업 테스트');
    });

    it('should initialize empty storage when both files are corrupted', async () => {
      // 손상된 파일들 생성
      const dataPath = join(todoHome, 'todos.json');
      const backupPath = join(todoHome, 'todos.json.bak');
      
      await fs.writeFile(dataPath, 'corrupted', 'utf8');
      await fs.writeFile(backupPath, 'also corrupted', 'utf8');
      
      // list 명령 실행
      const result = execCLI('list');
      
      // 에러 또는 빈 목록
      expect([0, 3]).toContain(result.exitCode);
    });

    it('should handle missing version field', async () => {
      const dataPath = join(todoHome, 'todos.json');
      await fs.writeFile(dataPath, JSON.stringify({
        todos: [],
        metadata: { lastModified: new Date().toISOString() }
      }), 'utf8');
      
      const result = execCLI('list');
      
      expect([0, 3]).toContain(result.exitCode);
    });

    it('should handle missing todos field', async () => {
      const dataPath = join(todoHome, 'todos.json');
      await fs.writeFile(dataPath, JSON.stringify({
        version: 1,
        metadata: { lastModified: new Date().toISOString() }
      }), 'utf8');
      
      const result = execCLI('list');
      
      expect([0, 3]).toContain(result.exitCode);
    });

    it('should handle missing metadata field', async () => {
      const dataPath = join(todoHome, 'todos.json');
      await fs.writeFile(dataPath, JSON.stringify({
        version: 1,
        todos: []
      }), 'utf8');
      
      const result = execCLI('list');
      
      expect([0, 3]).toContain(result.exitCode);
    });
  });

  describe('파일 권한 문제', () => {
    it('should handle read-only directory', async () => {
      // 읽기 전용 디렉토리 생성
      const readOnlyDir = join(tempDir, 'readonly');
      await fs.mkdir(readOnlyDir, { mode: 0o444 });
      
      const result = execSync(`node ${cliPath} add "테스트"`, {
        encoding: 'utf8',
        env: { ...process.env, TODO_HOME: readOnlyDir },
        timeout: 5000
      }).catch(err => err);
      
      // 에러가 발생해야 함
      expect(result.status || result.exitCode).not.toBe(0);
    });
  });

  describe('동시 접근 시나리오', () => {
    it('should handle rapid sequential operations', () => {
      // 빠른 연속 작업
      for (let i = 0; i < 10; i++) {
        const result = execCLI(`add "빠른 추가 ${i}"`);
        expect(result.exitCode).toBe(0);
      }
      
      const listResult = execCLI('list');
      expect(listResult.stdout).toContain('총 10개');
    });

    it('should maintain data integrity under stress', () => {
      // 할 일 추가
      for (let i = 0; i < 5; i++) {
        execCLI(`add "스트레스 테스트 ${i}"`);
      }
      
      // ID 추출
      const listResult = execCLI('list');
      const matches = listResult.stdout.matchAll(/(\d{13,})/g);
      const ids = Array.from(matches, m => m[1]);
      
      // 모두 완료 처리
      for (const id of ids) {
        execCLI(`done ${id}`);
      }
      
      // 모두 삭제
      for (const id of ids) {
        execCLI(`remove ${id}`);
      }
      
      // 최종 확인
      const finalResult = execCLI('list --all');
      expect(finalResult.stdout).toContain('할 일이 없습니다');
    });
  });

  describe('입력 검증 에러', () => {
    it('should reject empty content', () => {
      const result = execCLI('add ""');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('입력');
    });

    it('should reject whitespace-only content', () => {
      const result = execCLI('add "   "');
      expect(result.exitCode).toBe(1);
    });

    it('should reject content over 500 characters', () => {
      const longContent = 'a'.repeat(501);
      const result = execCLI(`add "${longContent}"`);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('500');
    });

    it('should reject non-numeric ID for done', () => {
      const result = execCLI('done abc');
      expect(result.exitCode).toBe(1);
    });

    it('should reject non-numeric ID for remove', () => {
      const result = execCLI('remove xyz');
      expect(result.exitCode).toBe(1);
    });

    it('should reject non-existent ID', () => {
      const result = execCLI('done 9999999999999');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('찾을 수 없');
    });
  });

  describe('잘못된 명령어 처리', () => {
    it('should show error for unknown command', () => {
      const result = execCLI('unknown');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('알 수 없는');
    });

    it('should show error for missing command', () => {
      const result = execCLI('');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('사용법');
    });
  });

  describe('데이터 무결성', () => {
    it('should preserve data after multiple operations', () => {
      // 데이터 생성
      execCLI('add "데이터 무결성 테스트"');
      
      // 여러 읽기 작업
      for (let i = 0; i < 5; i++) {
        const result = execCLI('list');
        expect(result.stdout).toContain('데이터 무결성 테스트');
      }
    });

    it('should handle special characters without corruption', () => {
      const specialContent = '특수문자 !@#$%^&*() 😀🎉 \n\t';
      execCLI(`add "${specialContent}"`);
      
      const result = execCLI('list');
      expect(result.stdout).toContain('특수문자');
    });

    it('should maintain correct count', () => {
      execCLI('add "첫 번째"');
      execCLI('add "두 번째"');
      execCLI('add "세 번째"');
      
      const result = execCLI('list');
      expect(result.stdout).toContain('총 3개');
    });
  });

  describe('복구 시나리오', () => {
    it('should recover from interrupted operation', async () => {
      // 데이터 추가
      execCLI('add "인터럽트 테스트"');
      
      // 파일 직접 수정 (외부 변경 시뮬레이션)
      const dataPath = join(todoHome, 'todos.json');
      const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
      data.todos[0].content = '수정된 내용';
      await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
      
      // CLI에서 확인
      const result = execCLI('list');
      expect(result.stdout).toContain('수정된 내용');
    });

    it('should handle missing data directory', async () => {
      // 디렉토리 삭제
      await fs.rm(todoHome, { recursive: true, force: true });
      
      // 새 명령 실행 (자동 생성)
      const result = execCLI('add "새 디렉토리"');
      expect(result.exitCode).toBe(0);
      
      // 데이터 확인
      const listResult = execCLI('list');
      expect(listResult.stdout).toContain('새 디렉토리');
    });
  });
});
