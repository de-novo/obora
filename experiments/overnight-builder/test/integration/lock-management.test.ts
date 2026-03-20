// test/integration/lock-management.test.ts
// 잠금 관리 통합 테스트

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { JsonStorage } from '../../src/storage';
import { LockAcquisitionError } from '../../src/errors';

describe('Lock Management Integration Tests', () => {
  let tempDir: string;
  let storage1: JsonStorage;
  let storage2: JsonStorage;

  beforeEach(async () => {
    const randomSuffix = Math.random().toString(36).slice(2);
    tempDir = join(tmpdir(), `todo-cli-lock-test-${randomSuffix}`);
    
    storage1 = new JsonStorage(tempDir);
    storage2 = new JsonStorage(tempDir);
    
    await storage1.initialize();
  });

  afterEach(async () => {
    try {
      await storage1.releaseLock();
      await storage2.releaseLock();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 무시
    }
  });

  describe('잠금 획득 및 해제', () => {
    it('should acquire lock successfully on first attempt', async () => {
      await expect(storage1.acquireLock()).resolves.toBeUndefined();
      
      const lockPath = join(tempDir, 'todos.json.lock');
      const exists = await fs.access(lockPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should release lock successfully', async () => {
      await storage1.acquireLock();
      await storage1.releaseLock();
      
      const lockPath = join(tempDir, 'todos.json.lock');
      const exists = await fs.access(lockPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should allow re-acquiring lock after release', async () => {
      await storage1.acquireLock();
      await storage1.releaseLock();
      
      await expect(storage1.acquireLock()).resolves.toBeUndefined();
    });

    it('should not throw when releasing non-existent lock', async () => {
      await expect(storage1.releaseLock()).resolves.toBeUndefined();
    });
  });

  describe('다중 인스턴스 잠금 경쟁', () => {
    it('should prevent lock acquisition by another instance', async () => {
      await storage1.acquireLock();
      
      await expect(storage2.acquireLock()).rejects.toThrow(LockAcquisitionError);
    });

    it('should allow lock acquisition after first instance releases', async () => {
      await storage1.acquireLock();
      await storage1.releaseLock();
      
      await expect(storage2.acquireLock()).resolves.toBeUndefined();
    });

    it('should store PID in lock file', async () => {
      await storage1.acquireLock();
      
      const lockPath = join(tempDir, 'todos.json.lock');
      const content = await fs.readFile(lockPath, 'utf8');
      expect(content).toBe(process.pid.toString());
    });
  });

  describe('잠금 타임아웃', () => {
    it('should retry lock acquisition multiple times', async () => {
      await storage1.acquireLock();
      
      const startTime = Date.now();
      
      try {
        await storage2.acquireLock();
      } catch (error) {
        expect(error).toBeInstanceOf(LockAcquisitionError);
        
        const duration = Date.now() - startTime;
        // 최소 10회 재시도 * 50ms = 500ms
        expect(duration).toBeGreaterThanOrEqual(400);
      }
    });

    it('should acquire lock if released during retry', async () => {
      await storage1.acquireLock();
      
      // 100ms 후에 잠금 해제
      setTimeout(() => {
        storage1.releaseLock();
      }, 100);
      
      // 재시도 중에 잠금이 해제되면 획득 성공
      await expect(storage2.acquireLock()).resolves.toBeUndefined();
    });
  });

  describe('잠금과 데이터 무결성', () => {
    it('should prevent concurrent writes', async () => {
      await storage1.acquireLock();
      
      const data1 = await storage1.load();
      data1.todos.push({
        id: '1712345678901',
        content: '첫 번째',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // storage2는 잠금을 획득하지 못해야 함
      await expect(storage2.acquireLock()).rejects.toThrow(LockAcquisitionError);
      
      await storage1.save(data1);
      await storage1.releaseLock();
      
      // 이제 storage2가 잠금 획득 가능
      await expect(storage2.acquireLock()).resolves.toBeUndefined();
      
      const data2 = await storage2.load();
      expect(data2.todos.length).toBe(1);
    });

    it('should release lock after successful save', async () => {
      await storage1.acquireLock();
      
      const data = await storage1.load();
      await storage1.save(data);
      
      await storage1.releaseLock();
      
      await expect(storage2.acquireLock()).resolves.toBeUndefined();
    });

    it('should release lock even on error', async () => {
      await storage1.acquireLock();
      
      // 에러 발생 시뮬레이션
      try {
        throw new Error('Test error');
      } finally {
        await storage1.releaseLock();
      }
      
      await expect(storage2.acquireLock()).resolves.toBeUndefined();
    });
  });

  describe('잠금 파일 손상 시나리오', () => {
    it('should handle corrupted lock file', async () => {
      const lockPath = join(tempDir, 'todos.json.lock');
      
      // 손상된 잠금 파일 생성
      await fs.writeFile(lockPath, 'corrupted', 'utf8');
      
      // 여전히 잠금 획득 가능해야 함 (파일이 존재하므로 대기 후 타임아웃)
      await expect(storage1.acquireLock()).rejects.toThrow(LockAcquisitionError);
    });

    it('should handle empty lock file', async () => {
      const lockPath = join(tempDir, 'todos.json.lock');
      
      // 빈 잠금 파일 생성
      await fs.writeFile(lockPath, '', 'utf8');
      
      await expect(storage1.acquireLock()).rejects.toThrow(LockAcquisitionError);
    });
  });

  describe('잠금 해제 검증', () => {
    it('should allow multiple lock cycles', async () => {
      for (let i = 0; i < 5; i++) {
        await storage1.acquireLock();
        await storage1.releaseLock();
      }
      
      // 여전히 잠금 획득 가능
      await expect(storage1.acquireLock()).resolves.toBeUndefined();
    });

    it('should handle double release gracefully', async () => {
      await storage1.acquireLock();
      await storage1.releaseLock();
      await storage1.releaseLock(); // 두 번째 해제
      
      // 잠금 파일이 없어야 함
      const lockPath = join(tempDir, 'todos.json.lock');
      const exists = await fs.access(lockPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('동시성 시뮬레이션', () => {
    it('should serialize concurrent operations', async () => {
      const operations: Promise<void>[] = [];
      const results: number[] = [];
      
      for (let i = 0; i < 3; i++) {
        operations.push(
          (async () => {
            const storage = new JsonStorage(tempDir);
            
            // 잠금 획득 시도
            let acquired = false;
            for (let retry = 0; retry < 20; retry++) {
              try {
                await storage.acquireLock();
                acquired = true;
                break;
              } catch {
                // 재시도
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
            
            if (acquired) {
              const data = await storage.load();
              results.push(i);
              await storage.save(data);
              await storage.releaseLock();
            }
          })()
        );
      }
      
      await Promise.all(operations);
      
      // 최소 하나의 작업은 성공해야 함
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
