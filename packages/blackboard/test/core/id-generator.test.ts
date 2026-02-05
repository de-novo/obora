import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultIdGenerator,
  SequentialIdGenerator,
  defaultIdGenerator,
  sequentialIdGenerator,
} from '../../src/core/id-generator';

describe('DefaultIdGenerator', () => {
  let generator: DefaultIdGenerator;

  beforeEach(() => {
    generator = new DefaultIdGenerator();
  });

  describe('generateAgentId', () => {
    it('should generate agent ID with prefix', () => {
      const id = generator.generateAgentId();
      expect(id).toMatch(/^agent-/);
    });

    it('should generate unique IDs', () => {
      const id1 = generator.generateAgentId();
      const id2 = generator.generateAgentId();
      expect(id1).not.toBe(id2);
    });

    it('should include UUID', () => {
      const id = generator.generateAgentId();
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(id).toMatch(/^agent-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('generateTaskId', () => {
    it('should generate task ID with prefix', () => {
      const id = generator.generateTaskId();
      expect(id).toMatch(/^task-/);
    });

    it('should generate unique IDs', () => {
      const id1 = generator.generateTaskId();
      const id2 = generator.generateTaskId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateAgendaId', () => {
    it('should generate agenda ID with prefix', () => {
      const id = generator.generateAgendaId();
      expect(id).toMatch(/^agenda-/);
    });

    it('should generate unique IDs', () => {
      const id1 = generator.generateAgendaId();
      const id2 = generator.generateAgendaId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateSessionId', () => {
    it('should generate session ID with prefix', () => {
      const id = generator.generateSessionId();
      expect(id).toMatch(/^session-/);
    });

    it('should generate unique IDs', () => {
      const id1 = generator.generateSessionId();
      const id2 = generator.generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateGenericId', () => {
    it('should generate generic ID with default prefix', () => {
      const id = generator.generateGenericId();
      expect(id).toMatch(/^id-/);
    });

    it('should generate generic ID with custom prefix', () => {
      const id = generator.generateGenericId('custom');
      expect(id).toMatch(/^custom-/);
    });

    it('should generate unique IDs', () => {
      const id1 = generator.generateGenericId('test');
      const id2 = generator.generateGenericId('test');
      expect(id1).not.toBe(id2);
    });
  });
});

describe('SequentialIdGenerator', () => {
  let generator: SequentialIdGenerator;

  beforeEach(() => {
    generator = new SequentialIdGenerator();
  });

  describe('generateAgentId', () => {
    it('should generate sequential agent IDs', () => {
      const id1 = generator.generateAgentId();
      const id2 = generator.generateAgentId();
      const id3 = generator.generateAgentId();

      expect(id1).toBe('agent-0000');
      expect(id2).toBe('agent-0001');
      expect(id3).toBe('agent-0002');
    });
  });

  describe('generateTaskId', () => {
    it('should generate sequential task IDs', () => {
      const id1 = generator.generateTaskId();
      const id2 = generator.generateTaskId();

      expect(id1).toBe('task-0000');
      expect(id2).toBe('task-0001');
    });

    it('should have separate counter from agent IDs', () => {
      generator.generateAgentId(); // agent-0000
      generator.generateAgentId(); // agent-0001
      const taskId = generator.generateTaskId();

      expect(taskId).toBe('task-0000');
    });
  });

  describe('generateAgendaId', () => {
    it('should generate sequential agenda IDs', () => {
      const id1 = generator.generateAgendaId();
      const id2 = generator.generateAgendaId();

      expect(id1).toBe('agenda-0000');
      expect(id2).toBe('agenda-0001');
    });
  });

  describe('generateSessionId', () => {
    it('should generate sequential session IDs', () => {
      const id1 = generator.generateSessionId();
      const id2 = generator.generateSessionId();

      expect(id1).toBe('session-0000');
      expect(id2).toBe('session-0001');
    });
  });

  describe('generateGenericId', () => {
    it('should generate sequential generic IDs', () => {
      const id1 = generator.generateGenericId('custom');
      const id2 = generator.generateGenericId('custom');

      expect(id1).toBe('custom-0000');
      expect(id2).toBe('custom-0001');
    });

    it('should have separate counter per prefix', () => {
      generator.generateGenericId('foo');
      generator.generateGenericId('foo');
      const barId = generator.generateGenericId('bar');

      expect(barId).toBe('bar-0000');
    });
  });

  describe('reset()', () => {
    it('should reset all counters', () => {
      generator.generateAgentId();
      generator.generateAgentId();
      generator.generateTaskId();

      generator.reset();

      expect(generator.generateAgentId()).toBe('agent-0000');
      expect(generator.generateTaskId()).toBe('task-0000');
    });
  });

  describe('resetPrefix()', () => {
    it('should reset specific prefix counter', () => {
      generator.generateAgentId(); // agent-0000
      generator.generateAgentId(); // agent-0001
      generator.generateTaskId(); // task-0000

      generator.resetPrefix('agent');

      expect(generator.generateAgentId()).toBe('agent-0000');
      expect(generator.generateTaskId()).toBe('task-0001'); // Unchanged
    });
  });
});

describe('Singleton instances', () => {
  describe('defaultIdGenerator', () => {
    it('should be an instance of DefaultIdGenerator', () => {
      expect(defaultIdGenerator).toBeInstanceOf(DefaultIdGenerator);
    });

    it('should generate unique IDs', () => {
      const id1 = defaultIdGenerator.generateAgentId();
      const id2 = defaultIdGenerator.generateAgentId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('sequentialIdGenerator', () => {
    it('should be an instance of SequentialIdGenerator', () => {
      expect(sequentialIdGenerator).toBeInstanceOf(SequentialIdGenerator);
    });

    it('should maintain state across calls', () => {
      sequentialIdGenerator.reset();
      const id1 = sequentialIdGenerator.generateGenericId('singleton-test');
      const id2 = sequentialIdGenerator.generateGenericId('singleton-test');
      
      expect(id1).toBe('singleton-test-0000');
      expect(id2).toBe('singleton-test-0001');
    });
  });
});
