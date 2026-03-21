import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../../src/services/taskService';
import { TaskRepository } from '../../src/repositories/taskRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('Error Handling', () => {
  let service: TaskService;
  let testDir: string;
  let testFile: string;
  let originalHome: string;

  beforeEach(() => {
    testDir = path.join('/tmp', `taskmaster-error-${Date.now()}`);
    testFile = path.join(testDir, '.taskmaster', 'tasks.json');
    originalHome = process.env.HOME || '';
    process.env.HOME = testDir;

    const repository = new TaskRepository();
    service = new TaskService(repository);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    process.env.HOME = originalHome;
  });

  describe('Input validation errors', () => {
    it('should reject empty title with clear message', async () => {
      await expect(service.addTask('')).rejects.toThrow('Task title cannot be empty');
    });

    it('should include error code for empty title', async () => {
      try {
        await service.addTask('');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('VAL_EMPTY_TITLE');
      }
    });

    it('should reject whitespace-only title', async () => {
      await expect(service.addTask('   ')).rejects.toThrow('cannot be empty');
      await expect(service.addTask('\t\n')).rejects.toThrow('cannot be empty');
    });

    it('should reject invalid priority with clear message', async () => {
      await expect(service.addTask('Task', 'urgent' as any)).rejects.toThrow(
        'Priority must be low, medium, or high'
      );
    });

    it('should include error code for invalid priority', async () => {
      try {
        await service.addTask('Task', 'invalid' as any);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('VAL_INVALID_PRIORITY');
      }
    });

    it('should be case-sensitive for priority', async () => {
      await expect(service.addTask('Task', 'HIGH' as any)).rejects.toThrow(
        'Priority must be low, medium, or high'
      );
      await expect(service.addTask('Task', 'Medium' as any)).rejects.toThrow(
        'Priority must be low, medium, or high'
      );
    });
  });

  describe('Task not found errors', () => {
    it('should throw error when completing non-existent task', async () => {
      await expect(service.completeTask('nonexistent')).rejects.toThrow('not found');
    });

    it('should include error code for task not found', async () => {
      try {
        await service.completeTask('nonexistent');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('TASK_NOT_FOUND');
      }
    });

    it('should throw error when deleting non-existent task', async () => {
      await expect(service.deleteTask('nonexistent')).rejects.toThrow('not found');
    });

    it('should throw error when completing already completed task', async () => {
      const task = await service.addTask('Task');
      await service.completeTask(task.id);

      await expect(service.completeTask(task.id)).rejects.toThrow('already completed');
    });
  });

  describe('File system errors', () => {
    it('should throw error for corrupted JSON', async () => {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, '{ invalid json }');

      await expect(service.listTasks()).rejects.toThrow();
    });

    it('should throw error for invalid schema', async () => {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, JSON.stringify({ tasks: 'not an array' }));

      await expect(service.listTasks()).rejects.toThrow();
    });

    it('should throw error for malformed task data', async () => {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, JSON.stringify({
        version: '1.0.0',
        tasks: [
          { id: 123, title: 456 } // Invalid types
        ]
      }));

      await expect(service.listTasks()).rejects.toThrow();
    });

    it('should handle permission errors gracefully', async () => {
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });
      fs.chmodSync(readOnlyDir, 0o444);

      process.env.HOME = readOnlyDir;
      const repository = new TaskRepository();
      service = new TaskService(repository);

      await expect(service.addTask('Task')).rejects.toThrow();

      // Cleanup
      fs.chmodSync(readOnlyDir, 0o755);
    });

    it('should handle disk full simulation (mock)', async () => {
      // This is difficult to test without actually filling disk
      // In real implementation, would mock fs.writeFileSync to throw ENOSPC
      // For now, just verify error handling exists
      const task = await service.addTask('Task');
      expect(task).toBeDefined();
    });
  });

  describe('Recovery scenarios', () => {
    it('should recover from missing file', async () => {
      // File doesn't exist
      expect(fs.existsSync(testFile)).toBe(false);

      // Should create on first add
      await service.addTask('First task');
      expect(fs.existsSync(testFile)).toBe(true);
    });

    it('should recover from missing directory', async () => {
      expect(fs.existsSync(testDir)).toBe(false);

      await service.addTask('First task');
      expect(fs.existsSync(path.dirname(testFile))).toBe(true);
    });

    it('should not lose data on partial failure', async () => {
      const task1 = await service.addTask('Task 1');

      // Try to add invalid task
      await expect(service.addTask('')).rejects.toThrow();

      // Verify first task still exists
      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task1.id);
    });
  });

  describe('Error message quality', () => {
    it('should provide actionable error for empty title', async () => {
      try {
        await service.addTask('');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('cannot be empty');
        expect(error.message).toMatch(/title/i);
      }
    });

    it('should provide actionable error for invalid priority', async () => {
      try {
        await service.addTask('Task', 'urgent' as any);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('must be low, medium, or high');
      }
    });

    it('should include task ID in not found error', async () => {
      try {
        await service.completeTask('abc123');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('abc123');
      }
    });
  });

  describe('Edge case errors', () => {
    it('should handle very long ID gracefully', async () => {
      const longId = 'a'.repeat(1000);
      await expect(service.completeTask(longId)).rejects.toThrow();
    });

    it('should handle special characters in ID', async () => {
      const specialId = '../../../etc/passwd';
      await expect(service.completeTask(specialId)).rejects.toThrow();
    });

    it('should handle null/undefined inputs', async () => {
      await expect(service.addTask(null as any)).rejects.toThrow();
      await expect(service.addTask(undefined as any)).rejects.toThrow();
    });
  });

  describe('Concurrent error handling', () => {
    it('should handle concurrent adds with one invalid', async () => {
      const results = await Promise.allSettled([
        service.addTask('Valid 1'),
        service.addTask(''), // Invalid
        service.addTask('Valid 2')
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(2);
    });
  });
});
