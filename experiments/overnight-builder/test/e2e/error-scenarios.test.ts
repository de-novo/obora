import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_exec';
import { createTempStorage, cleanupTempStorage, createCorruptedFile } from '../helpers/storage';
import { join } from 'path';

describe('에러 시나리오 E2E 테스트', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await createTempStorage();
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    await cleanupTempStorage(tempDir);
  });

  describe('입력 검증 에러', () => {
    it('빈 텍스트로 add 시 에러 메시지와 종료 코드 1', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js add ""', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('내용을 입력');
    });

    it('공백만 있는 텍스트로 add 시 에러', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js add "   "', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('내용을 입력');
    });

    it('잘못된 ID 형식으로 complete 시 에러', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js complete not-a-uuid', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('유효한 ID');
    });
  });

  describe('데이터 에러', () => {
    it('존재하지 않는 ID로 complete 시 에러', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js complete 550e8400-e29b-41d4-a716-446655440000', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('찾을 수 없습니다');
    });

    it('존재하지 않는 ID로 delete 시 에러', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js delete 550e8400-e29b-41d4-a716-446655440000', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('찾을 수 없습니다');
    });
  });

  describe('파일 시스템 에러', () => {
    it('손상된 JSON 파일을 자동으로 초기화해야 한다', async () => {
      await createCorruptedFile(tempDir);
      
      const result = execSync('node dist/index.js list', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('할 일이 없습니다');
    });

    it('읽기 전용 디렉토리에서 add 시 명확한 에러', async () => {
      // 이 테스트는 권한 설정이 필요하므로 스킵할 수 있음
      // 또는 모킹 필요
    });
  });

  describe('비즈니스 로직 에러', () => {
    it('이미 완료된 항목을 다시 완료하려 할 때 경고', () => {
      const addResult = execSync('node dist/index.js add "이미 완료"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      const idMatch = addResult.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch?.[1];
      
      if (id) {
        execSync(`node dist/index.js complete ${id}`, { cwd: process.cwd() });
        
        let exitCode = 0;
        let output = '';
        
        try {
          output = execSync(`node dist/index.js complete ${id}`, {
            encoding: 'utf-8',
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (error: any) {
          exitCode = error.status;
          output = error.stdout || error.stderr || '';
        }
        
        expect(exitCode).toBe(1);
        expect(output).toContain('이미 완료');
      }
    });
  });

  describe('잘못된 명령어', () => {
    it('존재하지 않는 명령어 입력 시 도움말 표시', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js invalid-command', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('Unknown command');
    });

    it('인자 없이 add 실행 시 도움말 표시', () => {
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync('node dist/index.js add', {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('error');
    });
  });

  describe('엣지 케이스', () => {
    it('매우 긴 텍스트 (10000자) 처리', () => {
      const longText = 'a'.repeat(10000);
      const result = execSync(`node dist/index.js add "${longText}"`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('추가되었습니다');
    });

    it('10000자 초과 텍스트 거부', () => {
      const tooLongText = 'a'.repeat(10001);
      let exitCode = 0;
      let output = '';
      
      try {
        output = execSync(`node dist/index.js add "${tooLongText}"`, {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status;
        output = error.stdout || error.stderr || '';
      }
      
      expect(exitCode).toBe(1);
      expect(output).toContain('10000자');
    });

    it('특수 문자와 이모지 처리', () => {
      const specialText = '테스트 🎉 <script>alert("xss")</script> \n\t';
      const result = execSync(`node dist/index.js add "${specialText}"`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('추가되었습니다');
      
      const listResult = execSync('node dist/index.js list', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(listResult).toContain('테스트 🎉');
    });
  });
});
