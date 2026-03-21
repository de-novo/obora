import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../../src/services/taskService';
import { TaskRepository } from '../../src/repositories/taskRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('Add Task Integration', () => {
  let service: TaskService;
  let testDir: string;
  let testFile: string;
  let originalHome: string;

  beforeEach(() => {
    // Create temp directory
    testDir = path.join('/tmp', `taskmaster-integration-${Date.now()}`);
    testFile = path.join(testDir, '.taskmaster', 'tasks.json');

    // Mock HOME
    originalHome = process.env.HOME || '';
    process.env.HOME = testDir;

    // Initialize service with real repository
    const repository = new TaskRepository();
    service = new TaskService(repository);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    process.env.HOME = originalHome;
  });

  describe('Success scenarios', () => {
    it('should add task and persist to file', async () => {
      const task = await service.addTask('Test integration task');

      // Verify returned task
      expect(task.title).toBe('Test integration task');
      expect(task.priority).toBe('medium');
      expect(task.completed).toBe(false);
      expect(task.id).toBeDefined();

      // Verify file created
      expect(fs.existsSync(testFile)).toBe(true);

      // Verify file content
      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0]).toEqual(task);
    });

    it('should add multiple tasks', async () => {
      await service.addTask('Task 1', 'high');
      await service.addTask('Task 2', 'low');
      await service.addTask('Task 3', 'medium');

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);

      expect(data.tasks).toHaveLength(3);
      expect(data.tasks[0].title).toBe('Task 1');
      expect(data.tasks[1].title).toBe('Task 2');
      expect(data.tasks[2].title).toBe('Task 3');
    });

    it('should handle special characters in title', async () => {
      const specialTitle = 'Fix bug #123 (urgent) 🚨 - <test>';
      const task = await service.addTask(specialTitle);

      expect(task.title).toBe(specialTitle);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks[0].title).toBe(specialTitle);
    });

    it('should handle unicode characters', async () => {
      const unicodeTitle = '한글 테스트 日本語テスト العربية';
      const task = await service.addTask(unicodeTitle);

      expect(task.title).toBe(unicodeTitle);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks[0].title).toBe(unicodeTitle);
    });

    it('should handle very long title (200+ characters)', async () => {
      const longTitle = 'A'.repeat(250);
      const task = await service.addTask(longTitle);

      expect(task.title).toBe(longTitle);
      expect(task.title.length).toBe(250);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks[0].title).toBe(longTitle);
    });

    it('should trim whitespace from title', async () => {
      const task = await service.addTask('  Trimmed task  ');

      expect(task.title).toBe('Trimmed task');
    });
  });

  describe('Error scenarios', () => {
    it('should reject empty title', async () => {
      await expect(service.addTask('')).rejects.toThrow('cannot be empty');
      await expect(service.addTask('')).rejects.toThrow('VAL_EMPTY_TITLE');

      // Verify no file created
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should reject whitespace-only title', async () => {
      await expect(service.addTask('   ')).rejects.toThrow('cannot be empty');
      await expect(service.addTask('\t\n')).rejects.toThrow('cannot be empty');
    });

    it('should reject invalid priority', async () => {
      await expect(service.addTask('Task', 'urgent' as any)).rejects.toThrow('must be low, medium, or high');
      await expect(service.addTask('Task', 'URGENT' as any)).rejects.toThrow('must be low, medium, or high');
    });
  });

  describe('File system scenarios', () => {
    it('should create directory if not exists', async () => {
      expect(fs.existsSync(path.dirname(testFile))).toBe(false);

      await service.addTask('First task');

      expect(fs.existsSync(path.dirname(testFile))).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);
    });

    it('should create valid JSON with version', async () => {
      await service.addTask('Test task');

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);

      expect(data.version).toBe('1.0.0');
      expect(data.tasks).toBeDefined();
      expect(Array.isArray(data.tasks)).toBe(true);
    });

    it('should preserve existing tasks when adding new one', async () => {
      await service.addTask('First task');
      await service.addTask('Second task');

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);

      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[0].title).toBe('First task');
      expect(data.tasks[1].title).toBe('Second task');
    });
  });

  describe('ID generation', () => {
    it('should generate unique IDs', async () => {
      const task1 = await service.addTask('Task 1');
      const task2 = await service.addTask('Task 2');
      const task3 = await service.addTask('Task 3');

      expect(task1.id).not.toBe(task2.id);
      expect(task2.id).not.toBe(task3.id);
      expect(task1.id).not.toBe(task3.id);
    });

    it('should generate timestamp-based IDs', async () => {
      const before = Date.now();
      const task = await service.addTask('Test task');
      const after = Date.now();

      const taskId = parseInt(task.id);
      expect(taskId).toBeGreaterThanOrEqual(before);
      expect(taskId).toBeLessThanOrEqual(after);
    });
  });

  describe('Priority handling', () => {
    it('should default to medium priority', async () => {
      const task = await service.addTask('No priority specified');
      expect(task.priority).toBe('medium');
    });

    it('should accept all valid priorities', async () => {
      const lowTask = await service.addTask('Low task', 'low');
      const mediumTask = await service.addTask('Medium task', 'medium');
      const highTask = await service.addTask('High task', 'high');

      expect(lowTask.priority).toBe('low');
      expect(mediumTask.priority).toBe('medium');
      expect(highTask.priority).toBe('high');
    });
  });
});
