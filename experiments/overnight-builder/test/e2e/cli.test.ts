import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { createTempStorage, cleanupTempStorage } from '../helpers/storage';

describe('CLI 통합 테스트', () => {
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

  describe('todo add', () => {
    it('할 일을 추가해야 한다', () => {
      const result = execSync('node dist/index.js add "테스트 할 일"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('추가되었습니다');
      expect(result).toMatch(/ID:/);
    });

    it('빈 텍스트는 에러를 출력해야 한다', () => {
      const result = execSync('node dist/index.js add ""', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      
      expect(result).toContain('내용을 입력');
    });

    it('따옴표가 포함된 텍스트를 처리해야 한다', () => {
      const result = execSync('node dist/index.js add "그분은 \'철수\'라고 해요"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('추가되었습니다');
    });

    it('이모지를 포함한 텍스트를 처리해야 한다', () => {
      const result = execSync('node dist/index.js add "테스트 🎉 할 일"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('추가되었습니다');
    });
  });

  describe('todo list', () => {
    it('빈 목록에 대한 안내 메시지를 출력해야 한다', () => {
      const result = execSync('node dist/index.js list', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('할 일이 없습니다');
    });

    it('할 일 목록을 테이블 형식으로 출력해야 한다', () => {
      execSync('node dist/index.js add "할 일 1"', { cwd: process.cwd() });
      execSync('node dist/index.js add "할 일 2"', { cwd: process.cwd() });
      
      const result = execSync('node dist/index.js list', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('할 일 1');
      expect(result).toContain('할 일 2');
    });

    it('완료된 항목만 필터링해야 한다', () => {
      execSync('node dist/index.js add "미완료"', { cwd: process.cwd() });
      const todo = execSync('node dist/index.js add "완료"', { cwd: process.cwd() });
      
      // Extract ID from add command output
      const idMatch = todo.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch?.[1];
      
      if (id) {
        execSync(`node dist/index.js complete ${id}`, { cwd: process.cwd() });
        
        const result = execSync('node dist/index.js list --completed', {
          encoding: 'utf-8',
          cwd: process.cwd(),
        });
        
        expect(result).toContain('완료');
        expect(result).not.toContain('미완료');
      }
    });
  });

  describe('todo complete', () => {
    it('할 일을 완료 처리해야 한다', () => {
      const addResult = execSync('node dist/index.js add "완료 테스트"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      const idMatch = addResult.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch?.[1];
      
      if (id) {
        const result = execSync(`node dist/index.js complete ${id}`, {
          encoding: 'utf-8',
          cwd: process.cwd(),
        });
        
        expect(result).toContain('완료');
      }
    });

    it('존재하지 않는 ID에 대해 에러를 출력해야 한다', () => {
      const result = execSync('node dist/index.js complete invalid-id-123', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      
      expect(result).toContain('찾을 수 없습니다');
    });

    it('이미 완료된 항목에 대해 경고를 출력해야 한다', () => {
      const addResult = execSync('node dist/index.js add "이미 완료된 항목"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      const idMatch = addResult.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch?.[1];
      
      if (id) {
        execSync(`node dist/index.js complete ${id}`, { cwd: process.cwd() });
        
        const result = execSync(`node dist/index.js complete ${id}`, {
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        
        expect(result).toContain('이미 완료');
      }
    });
  });

  describe('todo delete', () => {
    it('할 일을 삭제해야 한다', () => {
      const addResult = execSync('node dist/index.js add "삭제 테스트"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      const idMatch = addResult.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch?.[1];
      
      if (id) {
        const result = execSync(`node dist/index.js delete ${id}`, {
          encoding: 'utf-8',
          cwd: process.cwd(),
        });
        
        expect(result).toContain('삭제');
        
        const listResult = execSync('node dist/index.js list', {
          encoding: 'utf-8',
          cwd: process.cwd(),
        });
        
        expect(listResult).toContain('할 일이 없습니다');
      }
    });

    it('존재하지 않는 ID에 대해 에러를 출력해야 한다', () => {
      const result = execSync('node dist/index.js delete invalid-id-123', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      
      expect(result).toContain('찾을 수 없습니다');
    });
  });

  describe('todo --help', () => {
    it('도움말을 출력해야 한다', () => {
      const result = execSync('node dist/index.js --help', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      
      expect(result).toContain('add');
      expect(result).toContain('list');
      expect(result).toContain('complete');
      expect(result).toContain('delete');
    });
  });

  describe('전체 시나리오', () => {
    it('전체 워크플로우가 정상 동작해야 한다', () => {
      // 1. 할 일 추가
      const addResult1 = execSync('node dist/index.js add "첫 번째 할 일"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(addResult1).toContain('추가되었습니다');
      
      const addResult2 = execSync('node dist/index.js add "두 번째 할 일"', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(addResult2).toContain('추가되었습니다');
      
      // 2. 목록 확인
      const listResult = execSync('node dist/index.js list', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(listResult).toContain('첫 번째 할 일');
      expect(listResult).toContain('두 번째 할 일');
      
      // 3. 첫 번째 항목 완료
      const idMatch = addResult1.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch?.[1];
      
      if (id) {
        const completeResult = execSync(`node dist/index.js complete ${id}`, {
          encoding: 'utf-8',
          cwd: process.cwd(),
        });
        expect(completeResult).toContain('완료');
        
        // 4. 미완료 목록 확인
        const pendingResult = execSync('node dist/index.js list --pending', {
          encoding: 'utf-8',
          cwd: process.cwd(),
        });
        expect(pendingResult).toContain('두 번째 할 일');
        expect(pendingResult).not.toContain('첫 번째 할 일');
        
        // 5. 두 번째 항목 삭제
        const idMatch2 = addResult2.match(/ID: ([a-f0-9-]+)/);
        const id2 = idMatch2?.[1];
        
        if (id2) {
          const deleteResult = execSync(`node dist/index.js delete ${id2}`, {
            encoding: 'utf-8',
            cwd: process.cwd(),
          });
          expect(deleteResult).toContain('삭제');
          
          // 6. 최종 목록 확인
          const finalList = execSync('node dist/index.js list --all', {
            encoding: 'utf-8',
            cwd: process.cwd(),
          });
          expect(finalList).toContain('첫 번째 할 일');
          expect(finalList).not.toContain('두 번째 할 일');
        }
      }
    });
  });
});
