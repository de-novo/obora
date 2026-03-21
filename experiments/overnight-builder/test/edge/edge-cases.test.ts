import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../../src/services/taskService';
import { TaskRepository } from '../../src/repositories/taskRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('Edge Cases', () => {
  let service: TaskService;
  let testDir: string;
  let testFile: string;
  let originalHome: string;

  beforeEach(() => {
    testDir = path.join('/tmp', `taskmaster-edge-${Date.now()}`);
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

  describe('Empty list handling', () => {
    it('should return empty array when no tasks exist', async () => {
      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should return empty array when all tasks are completed', async () => {
      const task = await service.addTask('Only task', 'medium');
      await service.completeTask(task.id);

      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should handle file not existing gracefully', async () => {
      expect(fs.existsSync(testFile)).toBe(false);
      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });
  });

  describe('Long title handling', () => {
    it('should accept title with exactly 80 characters', async () => {
      const title80 = 'A'.repeat(80);
      const task = await service.addTask(title80);
      expect(task.title).toBe(title80);
      expect(task.title.length).toBe(80);
    });

    it('should accept title longer than 80 characters', async () => {
      const title200 = 'A'.repeat(200);
      const task = await service.addTask(title200);
      expect(task.title).toBe(title200);
      expect(task.title.length).toBe(200);
    });

    it('should accept title with 1000 characters', async () => {
      const title1000 = 'B'.repeat(1000);
      const task = await service.addTask(title1000);
      expect(task.title).toBe(title1000);
    });

    it('should preserve long title in storage', async () => {
      const longTitle = 'Very long task title '.repeat(20);
      await service.addTask(longTitle);

      const tasks = await service.listTasks();
      expect(tasks[0].title).toBe(longTitle);
    });
  });

  describe('Special characters', () => {
    it('should handle emojis', async () => {
      const emojiTitle = 'Task with emojis 🎉 🚀 ✨ 💯';
      const task = await service.addTask(emojiTitle);
      expect(task.title).toBe(emojiTitle);
    });

    it('should handle multiple emojis', async () => {
      const emojiTitle = '👨‍💻 👩‍💻 🎨 📝 ✅ ❌';
      const task = await service.addTask(emojiTitle);
      expect(task.title).toBe(emojiTitle);
    });

    it('should handle special markdown characters', async () => {
      const markdownTitle = '# Heading **bold** _italic_ `code` [link](url)';
      const task = await service.addTask(markdownTitle);
      expect(task.title).toBe(markdownTitle);
    });

    it('should handle HTML-like tags', async () => {
      const htmlTitle = '<div>Test</div> <script>alert("xss")</script>';
      const task = await service.addTask(htmlTitle);
      expect(task.title).toBe(htmlTitle);
    });

    it('should handle JSON special characters', async () => {
      const jsonTitle = 'Task with "quotes" and \\backslash\\ and {brackets}';
      const task = await service.addTask(jsonTitle);
      expect(task.title).toBe(jsonTitle);

      // Verify it's properly escaped in file
      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks[0].title).toBe(jsonTitle);
    });

    it('should handle newlines and tabs', async () => {
      const multilineTitle = 'Task with\nnewline\tand\ttab';
      const task = await service.addTask(multilineTitle);
      expect(task.title).toBe(multilineTitle);
    });

    it('should handle unicode characters from various languages', async () => {
      const titles = [
        '한글 테스트 Korean',
        '日本語テスト Japanese',
        '中文测试 Chinese',
        'العربية Arabic',
        'עברית Hebrew',
        'Ελληνικά Greek',
        'Русский Russian'
      ];

      for (const title of titles) {
        const task = await service.addTask(title);
        expect(task.title).toBe(title);
      }

      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(titles.length);
    });

    it('should handle zero-width characters', async () => {
      const zeroWidthTitle = 'Task\u200Bwith\u200Bzero\u200Bwidth\u200Bspaces';
      const task = await service.addTask(zeroWidthTitle);
      expect(task.title).toBe(zeroWidthTitle);
    });

    it('should handle control characters', async () => {
      const controlTitle = 'Task with \x00 null \x01 SOH \x02 STX';
      const task = await service.addTask(controlTitle);
      expect(task.title).toBe(controlTitle);
    });
  });

  describe('Whitespace handling', () => {
    it('should trim leading and trailing whitespace', async () => {
      const task = await service.addTask('  Trimmed  ');
      expect(task.title).toBe('Trimmed');
    });

    it('should preserve internal whitespace', async () => {
      const task = await service.addTask('Task  with   multiple    spaces');
      expect(task.title).toBe('Task  with   multiple    spaces');
    });

    it('should handle tabs', async () => {
      const task = await service.addTask('\tTabbed\ttask\t');
      expect(task.title).toBe('Tabbed\ttask');
    });

    it('should handle mixed whitespace', async () => {
      const task = await service.addTask('  \t Mixed \n whitespace \r\n ');
      expect(task.title).toContain('Mixed');
    });
  });

  describe('Concurrent operations', () => {
    it('should handle rapid sequential adds', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.addTask(`Task ${i}`));
      }
      await Promise.all(promises);

      const tasks = await service.listTasks();
      expect(tasks.length).toBe(10);
    });

    it('should generate unique IDs for rapid adds', async () => {
      const tasks = await Promise.all([
        service.addTask('Task 1'),
        service.addTask('Task 2'),
        service.addTask('Task 3')
      ]);

      const ids = tasks.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('File system edge cases', () => {
    it('should handle very deep directory paths', async () => {
      const deepDir = path.join(testDir, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
      process.env.HOME = deepDir;

      const repository = new TaskRepository();
      service = new TaskService(repository);

      await service.addTask('Deep task');
      expect(fs.existsSync(path.join(deepDir, '.taskmaster', 'tasks.json'))).toBe(true);
    });

    it('should handle directory with spaces', async () => {
      const spaceDir = path.join(testDir, 'dir with spaces', 'another dir');
      process.env.HOME = spaceDir;

      const repository = new TaskRepository();
      service = new TaskService(repository);

      await service.addTask('Task in space dir');
      expect(fs.existsSync(path.join(spaceDir, '.taskmaster', 'tasks.json'))).toBe(true);
    });

    it('should handle read-only directory gracefully', async () => {
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });
      fs.chmodSync(readOnlyDir, 0o444);

      process.env.HOME = readOnlyDir;

      const repository = new TaskRepository();
      service = new TaskService(repository);

      await expect(service.addTask('Should fail')).rejects.toThrow();

      // Cleanup
      fs.chmodSync(readOnlyDir, 0o755);
    });
  });

  describe('Data integrity', () => {
    it('should maintain data across multiple operations', async () => {
      const task1 = await service.addTask('Task 1', 'high');
      const task2 = await service.addTask('Task 2', 'medium');
      const task3 = await service.addTask('Task 3', 'low');

      await service.completeTask(task2.id);

      const incomplete = await service.listTasks();
      const all = await service.listTasks({ showCompleted: true });

      expect(incomplete.length).toBe(2);
      expect(all.length).toBe(3);

      // Verify task 2 is completed
      const completedTask = all.find(t => t.id === task2.id);
      expect(completedTask?.completed).toBe(true);
      expect(completedTask?.completedAt).toBeDefined();
    });

    it('should not corrupt file on error', async () => {
      await service.addTask('Good task');

      // Try to add invalid task
      await expect(service.addTask('')).rejects.toThrow();

      // Verify good task still exists
      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Good task');
    });
  });

  describe('Memory and performance', () => {
    it('should handle 1000 tasks efficiently', async () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        await service.addTask(`Task ${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should not leak memory on repeated operations', async () => {
      for (let i = 0; i < 50; i++) {
        const task = await service.addTask(`Task ${i}`);
        await service.completeTask(task.id);
      }

      const all = await service.listTasks({ showCompleted: true });
      expect(all.length).toBe(50);
    });
  });
});
