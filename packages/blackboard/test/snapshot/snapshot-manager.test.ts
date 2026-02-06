import { describe, it, expect, beforeEach } from 'vitest';
import {
  SnapshotManager,
  SNAPSHOT_FORMAT_VERSION,
  Blackboard,
  createSessionId,
  createAgentId,
  AgentStatusEnum,
} from '../../src';
import { createInitialState } from '../helpers/fixtures';
import { createTestAgent, resetFactories } from '../helpers/factories';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    manager = new SnapshotManager();
    board = new Blackboard({ sessionId: createSessionId('test-session') });
    
    // 상태 설정
    board.state.registerAgent(createTestAgent({ role: 'analyst' }));
    board.state.phase = 'discussion';
    board.knowledge.addFact({
      content: 'Test fact',
      source: createAgentId('agent-1'),
      confidence: 0.9,
      category: 'test',
      tags: [],
      expiresAt: null,
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const m = new SnapshotManager();
      expect(m).toBeDefined();
    });

    it('should create with custom options', () => {
      const m = new SnapshotManager({ 
        compress: true, 
        compressionLevel: 'max' 
      });
      expect(m).toBeDefined();
    });
  });

  describe('createSnapshot()', () => {
    it('should create snapshot with metadata', () => {
      const snapshot = manager.createSnapshot(board.getState());

      expect(snapshot.meta.id).toBeDefined();
      expect(snapshot.meta.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
      expect(snapshot.meta.stateVersion).toBe(board.version);
      expect(snapshot.data).toBeDefined();
    });

    it('should create compressed snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        compress: true,
      });

      expect(snapshot.meta.compressed).toBe(true);
      expect(typeof snapshot.data).toBe('string');
    });

    it('should create uncompressed snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        compress: false,
      });

      expect(snapshot.meta.compressed).toBe(false);
    });

    it('should include description and tags', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        description: 'Pre-voting checkpoint',
        tags: ['checkpoint', 'voting'],
      });

      expect(snapshot.meta.description).toBe('Pre-voting checkpoint');
      expect(snapshot.meta.tags).toEqual(['checkpoint', 'voting']);
    });

    it('should generate unique IDs', () => {
      const snapshot1 = manager.createSnapshot(board.getState());
      const snapshot2 = manager.createSnapshot(board.getState());

      expect(snapshot1.meta.id).not.toBe(snapshot2.meta.id);
    });

    it('should include checksum', () => {
      const snapshot = manager.createSnapshot(board.getState());

      expect(snapshot.meta.checksum).toBeDefined();
      expect(typeof snapshot.meta.checksum).toBe('string');
    });

    it('should include timestamp', () => {
      const snapshot = manager.createSnapshot(board.getState());

      expect(snapshot.meta.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('validate()', () => {
    it('should validate correct snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const result = manager.validate(snapshot);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid checksum', () => {
      const snapshot = manager.createSnapshot(board.getState());
      (snapshot.meta as any).checksum = 'invalid-checksum';
      
      const result = manager.validate(snapshot);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CHECKSUM_INVALID')).toBe(true);
    });

    it('should detect missing required fields', () => {
      const snapshot = manager.createSnapshot(board.getState());
      delete (snapshot.meta as any).id;
      
      const result = manager.validate(snapshot);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_FIELD')).toBe(true);
    });

    it('should detect version mismatch', () => {
      const snapshot = manager.createSnapshot(board.getState());
      // Set to future version to trigger incompatibility warning
      (snapshot.meta as any).formatVersion = '99.0.0';

      const result = manager.validate(snapshot);

      expect(result.warnings.some(w => w.code === 'DEPRECATED_FORMAT')).toBe(true);
    });

    it('should return warnings for non-critical issues', () => {
      const snapshot = manager.createSnapshot(board.getState());
      // Simulate previous version (minor version difference)
      const currentVersion = snapshot.meta.formatVersion;
      const parts = currentVersion.split('.');
      parts[1] = (parseInt(parts[1]) - 1).toString(); // Decrease minor version
      (snapshot.meta as any).formatVersion = parts.join('.');

      const result = manager.validate(snapshot);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.code === 'DEPRECATED_FORMAT')).toBe(true);
    });
  });

  describe('restore()', () => {
    it('should restore state from snapshot', () => {
      const originalPhase = board.state.phase;
      const snapshot = manager.createSnapshot(board.getState());
      
      // 상태 변경
      board.state.phase = 'voting';
      
      // 복원
      const restored = manager.restore(snapshot);

      expect(restored.state.phase).toBe(originalPhase);
    });

    it('should restore compressed snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState(), {
        compress: true,
      });
      
      const restored = manager.restore(snapshot);

      expect(restored.state.phase).toBe('discussion');
    });

    it('should create new session ID when requested', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const originalSessionId = board.meta.sessionId;
      
      const restored = manager.restore(snapshot, { newSessionId: true });

      expect(restored.meta.sessionId).not.toBe(originalSessionId);
    });

    it('should preserve session ID when not requested', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const originalSessionId = board.meta.sessionId;
      
      const restored = manager.restore(snapshot, { newSessionId: false });

      expect(restored.meta.sessionId).toBe(originalSessionId);
    });

    it('should throw on invalid snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState());
      (snapshot.meta as any).checksum = 'invalid';
      
      expect(() => manager.restore(snapshot)).toThrow();
    });

    it('should skip validation when requested', () => {
      const snapshot = manager.createSnapshot(board.getState());
      (snapshot.meta as any).checksum = 'invalid';
      
      expect(() => 
        manager.restore(snapshot, { skipValidation: true })
      ).not.toThrow();
    });

    it('should restore agents', () => {
      const agent = createTestAgent({ role: 'executor' });
      board.state.registerAgent(agent);
      
      const snapshot = manager.createSnapshot(board.getState());
      board.state.removeAgent(agent.id);
      
      const restored = manager.restore(snapshot);
      
      expect(restored.state.agents.size).toBe(2);
    });

    it('should restore knowledge', () => {
      board.knowledge.addFact({
        content: 'Another fact',
        source: createAgentId('agent-2'),
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      
      const snapshot = manager.createSnapshot(board.getState());
      
      const restored = manager.restore(snapshot);
      
      expect(restored.knowledge.facts.length).toBe(2);
    });
  });

  describe('partialRestore()', () => {
    it('should restore specific sections only', () => {
      const snapshot = manager.createSnapshot(board.getState());
      
      // 모든 섹션 변경
      board.state.phase = 'voting';
      board.knowledge.addFact({
        content: 'New fact',
        source: createAgentId('agent-2'),
        confidence: 0.5,
        category: 'new',
        tags: [],
        expiresAt: null,
      });
      
      const currentState = board.getState();
      const restored = manager.partialRestore(snapshot, currentState, ['state']);

      // state만 복원됨
      expect(restored.state.phase).toBe('discussion');
      // knowledge는 현재 상태 유지
      expect(restored.knowledge.facts).toHaveLength(2);
    });

    it('should restore only knowledge', () => {
      const snapshot = manager.createSnapshot(board.getState());
      
      board.state.phase = 'voting';
      board.knowledge.addFact({
        content: 'New fact',
        source: createAgentId('agent-2'),
        confidence: 0.5,
        category: 'new',
        tags: [],
        expiresAt: null,
      });
      
      const currentState = board.getState();
      const restored = manager.partialRestore(snapshot, currentState, ['knowledge']);

      // state는 현재 상태 유지
      expect(restored.state.phase).toBe('voting');
      // knowledge는 복원
      expect(restored.knowledge.facts).toHaveLength(1);
    });

    it('should restore multiple sections', () => {
      const snapshot = manager.createSnapshot(board.getState());
      
      board.state.phase = 'voting';
      board.knowledge.addFact({
        content: 'New fact',
        source: createAgentId('agent-2'),
        confidence: 0.5,
        category: 'new',
        tags: [],
        expiresAt: null,
      });
      
      const currentState = board.getState();
      const restored = manager.partialRestore(snapshot, currentState, ['state', 'knowledge']);

      expect(restored.state.phase).toBe('discussion');
      expect(restored.knowledge.facts).toHaveLength(1);
    });
  });

  describe('toJSON() / fromJSON()', () => {
    it('should serialize and deserialize snapshot', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const json = manager.toJSON(snapshot);
      const restored = manager.fromJSON(json);

      expect(restored.meta.id).toBe(snapshot.meta.id);
      expect(manager.validate(restored).valid).toBe(true);
    });

    it('should produce valid JSON', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const json = manager.toJSON(snapshot);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should handle compressed snapshots', () => {
      const snapshot = manager.createSnapshot(board.getState(), { compress: true });
      const json = manager.toJSON(snapshot);
      const restored = manager.fromJSON(json);

      expect(restored.meta.compressed).toBe(true);
      expect(manager.validate(restored).valid).toBe(true);
    });

    it('should throw on invalid JSON', () => {
      expect(() => manager.fromJSON('invalid json')).toThrow();
    });

    it('should throw on missing required fields', () => {
      expect(() => manager.fromJSON('{}')).toThrow();
    });
  });

  describe('compare()', () => {
    it('should detect differences between snapshots', () => {
      const snapshot1 = manager.createSnapshot(board.getState());

      // 상태 변경
      board.state.phase = 'voting';
      board.knowledge.addFact({
        content: 'Another fact',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      const snapshot2 = manager.createSnapshot(board.getState());
      const diff = manager.compare(snapshot1, snapshot2);

      expect(diff.meta.versionDiff).toBeGreaterThan(0);
      expect(diff.sections.state.modified).toBeGreaterThan(0);
      expect(diff.sections.knowledge.modified).toBeGreaterThan(0);
      expect(diff.hasDifferences).toBe(true);
    });

    it('should detect no changes', () => {
      const snapshot1 = manager.createSnapshot(board.getState());
      const snapshot2 = manager.createSnapshot(board.getState());
      
      const diff = manager.compare(snapshot1, snapshot2);

      expect(diff.hasDifferences).toBe(false);
    });

    it('should detect removed items', () => {
      const snapshot1 = manager.createSnapshot(board.getState());

      // Remove agent
      const agents = board.state.getAgents();
      if (agents.length > 0) {
        board.state.removeAgent(agents[0].id);
      }

      const snapshot2 = manager.createSnapshot(board.getState());
      const diff = manager.compare(snapshot1, snapshot2);

      // 상태가 변경되면 modified로 감지됨
      expect(diff.sections.state.modified).toBeGreaterThan(0);
    });

    it('should provide detailed diff report', () => {
      const snapshot1 = manager.createSnapshot(board.getState());
      
      board.state.phase = 'voting';
      
      const snapshot2 = manager.createSnapshot(board.getState());
      const diff = manager.compare(snapshot1, snapshot2);

      expect(diff.details).toBeDefined();
      expect(diff.details.phase).toBeDefined();
      expect(diff.details.phase.before).toBe('discussion');
      expect(diff.details.phase.after).toBe('voting');
    });
  });

  describe('list()', () => {
    it('should list stored snapshots', () => {
      // Assuming manager stores snapshots internally
      manager.createSnapshot(board.getState(), { store: true });
      manager.createSnapshot(board.getState(), { store: true });
      
      const list = manager.list();
      
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by tags', () => {
      manager.createSnapshot(board.getState(), { store: true, tags: ['checkpoint'] });
      manager.createSnapshot(board.getState(), { store: true, tags: ['backup'] });
      
      const checkpoints = manager.list({ tags: ['checkpoint'] });
      
      expect(checkpoints.every(s => s.meta.tags?.includes('checkpoint'))).toBe(true);
    });

    it('should sort by date', () => {
      manager.createSnapshot(board.getState(), { store: true });
      manager.createSnapshot(board.getState(), { store: true });
      
      const list = manager.list({ sortBy: 'date', order: 'desc' });
      
      if (list.length >= 2) {
        expect(list[0].meta.createdAt >= list[1].meta.createdAt).toBe(true);
      }
    });
  });

  describe('delete()', () => {
    it('should delete snapshot by id', () => {
      const snapshot = manager.createSnapshot(board.getState(), { store: true });
      
      manager.delete(snapshot.meta.id);
      
      const found = manager.get(snapshot.meta.id);
      expect(found).toBeUndefined();
    });

    it('should return false for non-existent snapshot', () => {
      const result = manager.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('get()', () => {
    it('should get snapshot by id', () => {
      const snapshot = manager.createSnapshot(board.getState(), { store: true });
      
      const found = manager.get(snapshot.meta.id);
      
      expect(found?.meta.id).toBe(snapshot.meta.id);
    });

    it('should return undefined for non-existent id', () => {
      const found = manager.get('non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('Snapshot size', () => {
    it('should calculate snapshot size', () => {
      const snapshot = manager.createSnapshot(board.getState());
      const size = manager.size(snapshot);
      
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should be smaller when compressed', () => {
      const uncompressed = manager.createSnapshot(board.getState(), { compress: false });
      const compressed = manager.createSnapshot(board.getState(), { compress: true });
      
      const uncompressedSize = manager.size(uncompressed);
      const compressedSize = manager.size(compressed);
      
      expect(compressedSize).toBeLessThan(uncompressedSize);
    });
  });
});
