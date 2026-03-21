import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../../../src/services/taskService';
import { ITaskRepository } from '../../../src/repositories/taskRepository';
import { Task } from '../../../src/models/task';

describe('TaskService', () => {
  let service: TaskService;
  let mockRepository: ITaskRepository;

  beforeEach(() => {
    mockRepository = {
      loadAll: vi.fn(),
      save: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      initialize: vi.fn()
    };

    service = new TaskService(mockRepository);
  });

  describe('addTask', () => {
    it('should add task with default medium priority', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const task = await service.addTask('Test task');

      expect(task.title).toBe('Test task');
      expect(task.priority).toBe('medium');
      expect(task.completed).toBe(false);
      expect(task.id).toBeDefined();
      expect(task.createdAt).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalledWith(task);
    });

    it('should add task with specified priority', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const task = await service.addTask('Urgent bug', 'high');

      expect(task.priority).toBe('high');
    });

    it('should generate unique ID based on timestamp', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const task1 = await service.addTask('Task 1');
      const task2 = await service.addTask('Task 2');

      expect(task1.id).not.toBe(task2.id);
    });

    it('should set createdAt to current ISO time', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const beforeTime = new Date().toISOString();
      const task = await service.addTask('New task');
      const afterTime = new Date().toISOString();

      expect(task.createdAt >= beforeTime).toBe(true);
      expect(task.createdAt <= afterTime).toBe(true);
    });

    it('should trim title whitespace', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const task = await service.addTask('  Test task  ');

      expect(task.title).toBe('Test task');
    });

    it('should throw error for empty title', async () => {
      await expect(service.addTask('')).rejects.toThrow('cannot be empty');
    });

    it('should throw error for whitespace-only title', async () => {
      await expect(service.addTask('   ')).rejects.toThrow('cannot be empty');
    });

    it('should throw error for invalid priority', async () => {
      await expect(service.addTask('Task', 'invalid' as any)).rejects.toThrow('must be low, medium, or high');
    });
  });

  describe('listTasks', () => {
    const createTask = (overrides: Partial<Task> = {}): Task => ({
      id: Date.now().toString(),
      title: 'Test task',
      priority: 'medium',
      completed: false,
      createdAt: new Date().toISOString(),
      ...overrides
    });

    it('should return all tasks when no filter', async () => {
      const tasks = [
        createTask({ id: '1', title: 'Task 1' }),
        createTask({ id: '2', title: 'Task 2' })
      ];

      vi.mocked(mockRepository.loadAll).mockResolvedValue(tasks);

      const result = await service.listTasks();

      expect(result).toHaveLength(2);
      expect(result).toEqual(tasks);
    });

    it('should filter out completed tasks by default', async () => {
      const tasks = [
        createTask({ id: '1', completed: false }),
        createTask({ id: '2', completed: true }),
        createTask({ id: '3', completed: false })
      ];

      vi.mocked(mockRepository.loadAll).mockResolvedValue(tasks);

      const result = await service.listTasks();

      expect(result).toHaveLength(2);
      expect(result.every(t => !t.completed)).toBe(true);
    });

    it('should include completed tasks when filter.showCompleted is true', async () => {
      const tasks = [
        createTask({ id: '1', completed: false }),
        createTask({ id: '2', completed: true }),
        createTask({ id: '3', completed: false })
      ];

      vi.mocked(mockRepository.loadAll).mockResolvedValue(tasks);

      const result = await service.listTasks({ showCompleted: true });

      expect(result).toHaveLength(3);
    });

    it('should sort by priority (high → medium → low)', async () => {
      const tasks = [
        createTask({ id: '1', priority: 'low' }),
        createTask({ id: '2', priority: 'high' }),
        createTask({ id: '3', priority: 'medium' })
      ];

      vi.mocked(mockRepository.loadAll).mockResolvedValue(tasks);

      const result = await service.listTasks();

      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBe('medium');
      expect(result[2].priority).toBe('low');
    });

    it('should sort by createdAt as secondary sort', async () => {
      const tasks = [
        createTask({ id: '1', priority: 'medium', createdAt: '2026-03-21T10:00:00.000Z' }),
        createTask({ id: '2', priority: 'medium', createdAt: '2026-03-21T09:00:00.000Z' }),
        createTask({ id: '3', priority: 'medium', createdAt: '2026-03-21T11:00:00.000Z' })
      ];

      vi.mocked(mockRepository.loadAll).mockResolvedValue(tasks);

      const result = await service.listTasks();

      expect(result[0].createdAt).toBe('2026-03-21T09:00:00.000Z');
      expect(result[1].createdAt).toBe('2026-03-21T10:00:00.000Z');
      expect(result[2].createdAt).toBe('2026-03-21T11:00:00.000Z');
    });

    it('should sort by priority first, then by date', async () => {
      const tasks = [
        createTask({ id: '1', priority: 'low', createdAt: '2026-03-21T08:00:00.000Z' }),
        createTask({ id: '2', priority: 'high', createdAt: '2026-03-21T10:00:00.000Z' }),
        createTask({ id: '3', priority: 'high', createdAt: '2026-03-21T09:00:00.000Z' }),
        createTask({ id: '4', priority: 'medium', createdAt: '2026-03-21T07:00:00.000Z' })
      ];

      vi.mocked(mockRepository.loadAll).mockResolvedValue(tasks);

      const result = await service.listTasks();

      expect(result[0].id).toBe('3'); // high, earlier
      expect(result[1].id).toBe('2'); // high, later
      expect(result[2].id).toBe('4'); // medium
      expect(result[3].id).toBe('1'); // low
    });

    it('should return empty array when no tasks', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const result = await service.listTasks();

      expect(result).toEqual([]);
    });
  });

  describe('completeTask', () => {
    const createTask = (overrides: Partial<Task> = {}): Task => ({
      id: '1',
      title: 'Test task',
      priority: 'medium',
      completed: false,
      createdAt: new Date().toISOString(),
      ...overrides
    });

    it('should mark task as completed', async () => {
      const task = createTask({ id: '1' });
      vi.mocked(mockRepository.findById).mockResolvedValue(task);

      await service.completeTask('1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          completed: true,
          completedAt: expect.any(String)
        })
      );
    });

    it('should set completedAt timestamp', async () => {
      const task = createTask({ id: '1' });
      vi.mocked(mockRepository.findById).mockResolvedValue(task);

      const beforeTime = new Date().toISOString();
      await service.completeTask('1');
      const afterTime = new Date().toISOString();

      const updateCall = vi.mocked(mockRepository.update).mock.calls[0][0];
      expect(updateCall.completedAt >= beforeTime).toBe(true);
      expect(updateCall.completedAt <= afterTime).toBe(true);
    });

    it('should throw error if task not found', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(null);

      await expect(service.completeTask('nonexistent')).rejects.toThrow('not found');
    });

    it('should throw error if already completed', async () => {
      const task = createTask({ id: '1', completed: true });
      vi.mocked(mockRepository.findById).mockResolvedValue(task);

      await expect(service.completeTask('1')).rejects.toThrow('already completed');
    });
  });

  describe('deleteTask', () => {
    it('should delete task', async () => {
      const task: Task = {
        id: '1',
        title: 'Task to delete',
        priority: 'low',
        completed: false,
        createdAt: new Date().toISOString()
      };

      vi.mocked(mockRepository.findById).mockResolvedValue(task);

      await service.deleteTask('1');

      expect(mockRepository.delete).toHaveBeenCalledWith('1');
    });

    it('should throw error if task not found', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(null);

      await expect(service.deleteTask('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('Integration with repository', () => {
    it('should persist task on add', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      const task = await service.addTask('Persist this');

      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledWith(task);
    });

    it('should load tasks on list', async () => {
      vi.mocked(mockRepository.loadAll).mockResolvedValue([]);

      await service.listTasks();

      expect(mockRepository.loadAll).toHaveBeenCalledTimes(1);
    });
  });
});
