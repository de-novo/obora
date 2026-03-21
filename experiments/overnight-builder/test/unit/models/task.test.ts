import { describe, it, expect } from 'vitest';
import { Task, Priority } from '../../../src/models/task';

describe('Task Model', () => {
  describe('Type Definitions', () => {
    it('should define valid priority values', () => {
      const lowPriority: Priority = 'low';
      const mediumPriority: Priority = 'medium';
      const highPriority: Priority = 'high';

      expect(lowPriority).toBe('low');
      expect(mediumPriority).toBe('medium');
      expect(highPriority).toBe('high');
    });

    it('should create a valid Task object', () => {
      const task: Task = {
        id: '1710998400000',
        title: 'Test task',
        priority: 'medium',
        completed: false,
        createdAt: '2026-03-21T09:30:00.000Z'
      };

      expect(task.id).toBe('1710998400000');
      expect(task.title).toBe('Test task');
      expect(task.priority).toBe('medium');
      expect(task.completed).toBe(false);
      expect(task.createdAt).toBe('2026-03-21T09:30:00.000Z');
      expect(task.completedAt).toBeUndefined();
    });

    it('should allow completedAt field for completed tasks', () => {
      const task: Task = {
        id: '1710998400001',
        title: 'Completed task',
        priority: 'high',
        completed: true,
        createdAt: '2026-03-21T09:30:00.000Z',
        completedAt: '2026-03-21T10:00:00.000Z'
      };

      expect(task.completed).toBe(true);
      expect(task.completedAt).toBe('2026-03-21T10:00:00.000Z');
    });
  });

  describe('Task Validation', () => {
    it('should have required fields', () => {
      const task: Task = {
        id: '1710998400002',
        title: 'Another test',
        priority: 'low',
        completed: false,
        createdAt: '2026-03-21T11:00:00.000Z'
      };

      // Verify all required fields exist
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('priority');
      expect(task).toHaveProperty('completed');
      expect(task).toHaveProperty('createdAt');
    });
  });
});
