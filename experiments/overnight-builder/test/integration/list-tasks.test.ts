import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../../src/services/taskService';
import { TaskRepository } from '../../src/repositories/taskRepository';
import { Task } from '../../src/models/task';
import * as fs from 'fs';
import * as path from 'path';

describe('List Tasks Integration', () => {
  let service: TaskService;
  let testDir: string;
  let testFile: string;
  let originalHome: string;

  beforeEach(() => {
    testDir = path.join('/tmp', `taskmaster-list-${Date.now()}`);
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

  describe('Success scenarios', () => {
    it('should return empty list when no tasks', async () => {
      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should return all incomplete tasks by default', async () => {
      await service.addTask('Task 1', 'high');
      await service.addTask('Task 2', 'medium');
      await service.addTask('Task 3', 'low');

      const tasks = await service.listTasks();

      expect(tasks).toHaveLength(3);
      expect(tasks.every(t => !t.completed)).toBe(true);
    });

    it('should return all tasks including completed with filter', async () => {
      await service.addTask('Incomplete task', 'medium');
      
      const completedTask = await service.addTask('Completed task', 'high');
      await service.completeTask(completedTask.id);

      const allTasks = await service.listTasks({ showCompleted: true });
      const incompleteTasks = await service.listTasks();

      expect(allTasks).toHaveLength(2);
      expect(incompleteTasks).toHaveLength(1);
    });

    it('should handle file not existing', async () => {
      expect(fs.existsSync(testFile)).toBe(false);

      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });
  });

  describe('Sorting', () => {
    it('should sort by priority (high → medium → low)', async () => {
      await service.addTask('Low task', 'low');
      await service.addTask('High task', 'high');
      await service.addTask('Medium task', 'medium');

      const tasks = await service.listTasks();

      expect(tasks[0].priority).toBe('high');
      expect(tasks[1].priority).toBe('medium');
      expect(tasks[2].priority).toBe('low');
    });

    it('should sort by createdAt within same priority', async () => {
      // Create tasks with slight delay to ensure different timestamps
      await service.addTask('First', 'medium');
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.addTask('Second', 'medium');
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.addTask('Third', 'medium');

      const tasks = await service.listTasks();

      expect(tasks[0].title).toBe('First');
      expect(tasks[1].title).toBe('Second');
      expect(tasks[2].title).toBe('Third');
    });

    it('should sort by priority first, then by date', async () => {
      await service.addTask('Low Early', 'low');
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.addTask('High Late', 'high');
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.addTask('High Early', 'high');
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.addTask('Medium', 'medium');

      const tasks = await service.listTasks();

      expect(tasks[0].title).toBe('High Late');
      expect(tasks[1].title).toBe('High Early');
      expect(tasks[2].title).toBe('Medium');
      expect(tasks[3].title).toBe('Low Early');
    });

    it('should sort completed and incomplete tasks separately', async () => {
      await service.addTask('Incomplete High', 'high');
      const completed = await service.addTask('Completed High', 'high');
      await service.completeTask(completed.id);

      const tasks = await service.listTasks({ showCompleted: true });

      // Incomplete should come before completed within same priority
      expect(tasks[0].completed).toBe(false);
      expect(tasks[1].completed).toBe(true);
    });
  });

  describe('Filtering', () => {
    beforeEach(async () => {
      await service.addTask('Incomplete 1', 'high');
      await service.addTask('Incomplete 2', 'medium');
      const completed = await service.addTask('Completed 1', 'low');
      await service.completeTask(completed.id);
    });

    it('should filter out completed tasks by default', async () => {
      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => !t.completed)).toBe(true);
    });

    it('should include completed tasks when requested', async () => {
      const tasks = await service.listTasks({ showCompleted: true });
      expect(tasks).toHaveLength(3);
    });

    it('should show correct counts', async () => {
      const incomplete = await service.listTasks();
      const all = await service.listTasks({ showCompleted: true });

      const incompleteCount = incomplete.length;
      const completedCount = all.length - incomplete.length;

      expect(incompleteCount).toBe(2);
      expect(completedCount).toBe(1);
    });
  });

  describe('Large datasets', () => {
    it('should handle 100 tasks', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const priority = (['low', 'medium', 'high'] as const)[i % 3];
        promises.push(service.addTask(`Task ${i}`, priority));
      }
      await Promise.all(promises);

      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(100);
    });

    it('should handle mixed completed and incomplete tasks', async () => {
      // Add 50 tasks
      for (let i = 0; i < 50; i++) {
        await service.addTask(`Task ${i}`, 'medium');
      }

      // Complete every other task
      const allTasks = await service.listTasks();
      for (let i = 0; i < allTasks.length; i += 2) {
        await service.completeTask(allTasks[i].id);
      }

      const incomplete = await service.listTasks();
      const all = await service.listTasks({ showCompleted: true });

      expect(incomplete.length).toBe(25);
      expect(all.length).toBe(50);
    });
  });

  describe('File corruption handling', () => {
    it('should handle corrupted JSON file', async () => {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, '{ invalid json }');

      await expect(service.listTasks()).rejects.toThrow();
    });

    it('should handle invalid schema', async () => {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, JSON.stringify({ tasks: 'not an array' }));

      await expect(service.listTasks()).rejects.toThrow();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical daily workflow', async () => {
      // Morning: Add tasks
      await service.addTask('Review pull requests', 'high');
      await service.addTask('Team meeting prep', 'high');
      await service.addTask('Write documentation', 'medium');
      await service.addTask('Code review', 'medium');
      await service.addTask('Email cleanup', 'low');

      const morningTasks = await service.listTasks();
      expect(morningTasks).toHaveLength(5);

      // Complete some tasks
      await service.completeTask(morningTasks[0].id);
      await service.completeTask(morningTasks[1].id);

      // Afternoon: Check remaining
      const afternoonTasks = await service.listTasks();
      expect(afternoonTasks).toHaveLength(3);

      // End of day: Show all
      const allTasks = await service.listTasks({ showCompleted: true });
      expect(allTasks).toHaveLength(5);
    });

    it('should handle priority changes over time', async () => {
      // Add tasks throughout the day
      const early = await service.addTask('Early task', 'low');
      await new Promise(resolve => setTimeout(resolve, 10));
      const mid = await service.addTask('Mid task', 'high');
      await new Promise(resolve => setTimeout(resolve, 10));
      const late = await service.addTask('Late task', 'medium');

      const tasks = await service.listTasks();

      // High priority should be first regardless of time
      expect(tasks[0].id).toBe(mid.id);
    });
  });
});
