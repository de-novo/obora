import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskRepository } from '../../../src/repositories/taskRepository';
import { Task } from '../../../src/models/task';
import * as fs from 'fs';
import * as path from 'path';

describe('TaskRepository', () => {
  let repository: TaskRepository;
  let testDir: string;
  let testFile: string;
  let originalHome: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = path.join('/tmp', `taskmaster-test-${Date.now()}`);
    testFile = path.join(testDir, 'tasks.json');
    
    // Mock getTaskFilePath
    originalHome = process.env.HOME || '';
    process.env.HOME = testDir;
    
    repository = new TaskRepository();
    
    // Ensure clean state
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  describe('loadAll', () => {
    it('should return empty array when file does not exist', async () => {
      const tasks = await repository.loadAll();
      expect(tasks).toEqual([]);
    });

    it('should return tasks from file', async () => {
      const mockTasks: Task[] = [
        {
          id: '1',
          title: 'Task 1',
          priority: 'high',
          completed: false,
          createdAt: '2026-03-21T09:00:00.000Z'
        }
      ];

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: mockTasks }));
      
      const tasks = await repository.loadAll();
      expect(tasks).toEqual(mockTasks);
    });

    it('should throw error for corrupted JSON', async () => {
      fs.writeFileSync(testFile, '{ invalid json }');
      
      await expect(repository.loadAll()).rejects.toThrow('corrupted');
    });

    it('should throw error for invalid schema', async () => {
      fs.writeFileSync(testFile, JSON.stringify({ tasks: 'not an array' }));
      
      await expect(repository.loadAll()).rejects.toThrow();
    });
  });

  describe('save', () => {
    it('should save new task to file', async () => {
      const task: Task = {
        id: '1710998400000',
        title: 'New task',
        priority: 'medium',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      await repository.save(task);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0]).toEqual(task);
    });

    it('should append task to existing tasks', async () => {
      const existingTask: Task = {
        id: '1',
        title: 'Existing task',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T08:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [existingTask] }));

      const newTask: Task = {
        id: '2',
        title: 'New task',
        priority: 'high',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      await repository.save(newTask);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[1]).toEqual(newTask);
    });

    it('should create file if it does not exist', async () => {
      expect(fs.existsSync(testFile)).toBe(false);

      const task: Task = {
        id: '1',
        title: 'First task',
        priority: 'medium',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      await repository.save(task);

      expect(fs.existsSync(testFile)).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const nestedDir = path.join(testDir, 'nested', 'deep');
      process.env.HOME = nestedDir;
      repository = new TaskRepository();

      const task: Task = {
        id: '1',
        title: 'Task',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      await repository.save(task);
      expect(fs.existsSync(path.join(nestedDir, '.taskmaster', 'tasks.json'))).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return task if found', async () => {
      const task: Task = {
        id: '1710998400000',
        title: 'Test task',
        priority: 'high',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [task] }));

      const found = await repository.findById('1710998400000');
      expect(found).toEqual(task);
    });

    it('should return null if not found', async () => {
      const found = await repository.findById('nonexistent');
      expect(found).toBeNull();
    });

    it('should return null when file does not exist', async () => {
      const found = await repository.findById('any-id');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update existing task', async () => {
      const task: Task = {
        id: '1',
        title: 'Original title',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [task] }));

      const updatedTask: Task = {
        ...task,
        title: 'Updated title',
        priority: 'high'
      };

      await repository.update(updatedTask);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks[0].title).toBe('Updated title');
      expect(data.tasks[0].priority).toBe('high');
    });

    it('should throw error if task not found', async () => {
      const task: Task = {
        id: 'nonexistent',
        title: 'Task',
        priority: 'medium',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [] }));

      await expect(repository.update(task)).rejects.toThrow('not found');
    });

    it('should preserve other tasks', async () => {
      const task1: Task = {
        id: '1',
        title: 'Task 1',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      const task2: Task = {
        id: '2',
        title: 'Task 2',
        priority: 'high',
        completed: false,
        createdAt: '2026-03-21T10:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [task1, task2] }));

      await repository.update({ ...task1, title: 'Updated Task 1' });

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[1]).toEqual(task2);
    });
  });

  describe('delete', () => {
    it('should delete task by id', async () => {
      const task: Task = {
        id: '1',
        title: 'Task to delete',
        priority: 'medium',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [task] }));

      await repository.delete('1');

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(0);
    });

    it('should throw error if task not found', async () => {
      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [] }));

      await expect(repository.delete('nonexistent')).rejects.toThrow('not found');
    });

    it('should preserve other tasks', async () => {
      const task1: Task = {
        id: '1',
        title: 'Task 1',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      const task2: Task = {
        id: '2',
        title: 'Task 2',
        priority: 'high',
        completed: false,
        createdAt: '2026-03-21T10:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [task1, task2] }));

      await repository.delete('1');

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0]).toEqual(task2);
    });
  });

  describe('exists', () => {
    it('should return true if file exists', async () => {
      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [] }));
      const exists = await repository.exists();
      expect(exists).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      const exists = await repository.exists();
      expect(exists).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should create new file with empty tasks', async () => {
      await repository.initialize();

      const exists = fs.existsSync(testFile);
      expect(exists).toBe(true);

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data).toEqual({
        version: '1.0.0',
        tasks: []
      });
    });

    it('should create directory if needed', async () => {
      const newDir = path.join(testDir, 'new-dir');
      process.env.HOME = newDir;
      repository = new TaskRepository();

      await repository.initialize();

      expect(fs.existsSync(path.join(newDir, '.taskmaster'))).toBe(true);
    });

    it('should overwrite existing file', async () => {
      const existingTask: Task = {
        id: '1',
        title: 'Existing',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T09:00:00.000Z'
      };

      fs.writeFileSync(testFile, JSON.stringify({ version: '1.0.0', tasks: [existingTask] }));

      await repository.initialize();

      const content = fs.readFileSync(testFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data.tasks).toHaveLength(0);
    });
  });
});
