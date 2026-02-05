import { describe, it, expect, beforeEach } from 'vitest';
import {
  Blackboard,
  createAgentId,
  createFactId,
  createInferenceId,
  createPatternId,
} from '../../../src';
import { resetFactories } from '../../helpers/factories';

describe('KnowledgeAccessor', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard();
  });

  describe('facts', () => {
    it('should add fact', () => {
      const fact = board.knowledge.addFact({
        content: 'Test fact',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: ['tag1'],
        expiresAt: null,
      });

      expect(fact.id).toBeDefined();
      expect(fact.content).toBe('Test fact');
      expect(fact.confidence).toBe(0.9);
    });

    it('should get fact by id', () => {
      const fact = board.knowledge.addFact({
        content: 'Test fact',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      const retrieved = board.knowledge.getFact(fact.id);
      expect(retrieved).toEqual(fact);
    });

    it('should return undefined for non-existent fact', () => {
      expect(board.knowledge.getFact(createFactId('nonexistent'))).toBeUndefined();
    });

    it('should get all facts', () => {
      board.knowledge.addFact({
        content: 'Fact 1',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Fact 2',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      expect(board.knowledge.facts).toHaveLength(2);
    });

    it('should find facts by category', () => {
      board.knowledge.addFact({
        content: 'Finance fact',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'finance',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Tech fact',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'tech',
        tags: [],
        expiresAt: null,
      });

      const financeFacts = board.knowledge.findFacts({ category: 'finance' });
      expect(financeFacts).toHaveLength(1);
      expect(financeFacts[0].content).toBe('Finance fact');
    });

    it('should find facts by source', () => {
      const agent1 = createAgentId('agent-1');
      const agent2 = createAgentId('agent-2');

      board.knowledge.addFact({
        content: 'Fact from agent 1',
        source: agent1,
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Fact from agent 2',
        source: agent2,
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      const agent1Facts = board.knowledge.findFacts({ source: agent1 });
      expect(agent1Facts).toHaveLength(1);
    });

    it('should find facts by tag', () => {
      board.knowledge.addFact({
        content: 'Tagged fact',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: ['important', 'urgent'],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Another fact',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'test',
        tags: ['normal'],
        expiresAt: null,
      });

      const importantFacts = board.knowledge.findFacts({ tag: 'important' });
      expect(importantFacts).toHaveLength(1);
    });

    it('should find facts by minimum confidence', () => {
      board.knowledge.addFact({
        content: 'High confidence',
        source: createAgentId('agent-1'),
        confidence: 0.95,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Low confidence',
        source: createAgentId('agent-1'),
        confidence: 0.5,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      const highConfidence = board.knowledge.findFacts({ minConfidence: 0.9 });
      expect(highConfidence).toHaveLength(1);
      expect(highConfidence[0].content).toBe('High confidence');
    });

    it('should update fact', () => {
      const fact = board.knowledge.addFact({
        content: 'Original',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      board.knowledge.updateFact(fact.id, {
        content: 'Updated',
        confidence: 0.95,
      });

      const updated = board.knowledge.getFact(fact.id);
      expect(updated?.content).toBe('Updated');
      expect(updated?.confidence).toBe(0.95);
    });

    it('should remove fact', () => {
      const fact = board.knowledge.addFact({
        content: 'To be removed',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      board.knowledge.removeFact(fact.id);
      expect(board.knowledge.getFact(fact.id)).toBeUndefined();
    });

    it('should count facts', () => {
      board.knowledge.addFact({
        content: 'Fact 1',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addFact({
        content: 'Fact 2',
        source: createAgentId('agent-1'),
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt: null,
      });

      expect(board.knowledge.factCount).toBe(2);
    });
  });

  describe('inferences', () => {
    it('should add inference', () => {
      const inference = board.knowledge.addInference({
        conclusion: 'Test conclusion',
        premises: ['premise1', 'premise2'],
        confidence: 0.8,
        source: createAgentId('agent-1'),
        tags: [],
      });

      expect(inference.id).toBeDefined();
      expect(inference.conclusion).toBe('Test conclusion');
      expect(inference.premises).toEqual(['premise1', 'premise2']);
    });

    it('should get inference by id', () => {
      const inference = board.knowledge.addInference({
        conclusion: 'Test',
        premises: [],
        confidence: 0.8,
        source: createAgentId('agent-1'),
        tags: [],
      });

      const retrieved = board.knowledge.getInference(inference.id);
      expect(retrieved).toEqual(inference);
    });

    it('should get all inferences', () => {
      board.knowledge.addInference({
        conclusion: 'Inference 1',
        premises: [],
        confidence: 0.8,
        source: createAgentId('agent-1'),
        tags: [],
      });
      board.knowledge.addInference({
        conclusion: 'Inference 2',
        premises: [],
        confidence: 0.7,
        source: createAgentId('agent-1'),
        tags: [],
      });

      expect(board.knowledge.inferences).toHaveLength(2);
    });

    it('should find inferences by source', () => {
      const agent1 = createAgentId('agent-1');
      const agent2 = createAgentId('agent-2');

      board.knowledge.addInference({
        conclusion: 'From agent 1',
        premises: [],
        confidence: 0.8,
        source: agent1,
        tags: [],
      });
      board.knowledge.addInference({
        conclusion: 'From agent 2',
        premises: [],
        confidence: 0.7,
        source: agent2,
        tags: [],
      });

      const fromAgent1 = board.knowledge.findInferences({ source: agent1 });
      expect(fromAgent1).toHaveLength(1);
    });

    it('should update inference', () => {
      const inference = board.knowledge.addInference({
        conclusion: 'Original',
        premises: [],
        confidence: 0.8,
        source: createAgentId('agent-1'),
        tags: [],
      });

      board.knowledge.updateInference(inference.id, {
        conclusion: 'Updated',
        confidence: 0.9,
      });

      const updated = board.knowledge.getInference(inference.id);
      expect(updated?.conclusion).toBe('Updated');
      expect(updated?.confidence).toBe(0.9);
    });

    it('should remove inference', () => {
      const inference = board.knowledge.addInference({
        conclusion: 'To remove',
        premises: [],
        confidence: 0.8,
        source: createAgentId('agent-1'),
        tags: [],
      });

      board.knowledge.removeInference(inference.id);
      expect(board.knowledge.getInference(inference.id)).toBeUndefined();
    });
  });

  describe('patterns', () => {
    it('should add pattern', () => {
      const pattern = board.knowledge.addPattern({
        name: 'Test Pattern',
        description: 'A test pattern',
        conditions: [{ type: 'condition', value: 'test' }],
        consequences: [{ type: 'action', value: 'do something' }],
        confidence: 0.7,
        tags: [],
      });

      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBe('Test Pattern');
    });

    it('should get pattern by id', () => {
      const pattern = board.knowledge.addPattern({
        name: 'Test',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.7,
        tags: [],
      });

      const retrieved = board.knowledge.getPattern(pattern.id);
      expect(retrieved).toEqual(pattern);
    });

    it('should get all patterns', () => {
      board.knowledge.addPattern({
        name: 'Pattern 1',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.7,
        tags: [],
      });
      board.knowledge.addPattern({
        name: 'Pattern 2',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.8,
        tags: [],
      });

      expect(board.knowledge.patterns).toHaveLength(2);
    });

    it('should find patterns by tag', () => {
      board.knowledge.addPattern({
        name: 'Tagged',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.7,
        tags: ['important'],
      });
      board.knowledge.addPattern({
        name: 'Not tagged',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.8,
        tags: [],
      });

      const tagged = board.knowledge.findPatterns({ tag: 'important' });
      expect(tagged).toHaveLength(1);
      expect(tagged[0].name).toBe('Tagged');
    });

    it('should update pattern', () => {
      const pattern = board.knowledge.addPattern({
        name: 'Original',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.7,
        tags: [],
      });

      board.knowledge.updatePattern(pattern.id, {
        name: 'Updated',
        confidence: 0.9,
      });

      const updated = board.knowledge.getPattern(pattern.id);
      expect(updated?.name).toBe('Updated');
      expect(updated?.confidence).toBe(0.9);
    });

    it('should remove pattern', () => {
      const pattern = board.knowledge.addPattern({
        name: 'To remove',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.7,
        tags: [],
      });

      board.knowledge.removePattern(pattern.id);
      expect(board.knowledge.getPattern(pattern.id)).toBeUndefined();
    });
  });

  describe('clearAll', () => {
    it('should clear all knowledge', () => {
      board.knowledge.addFact({
        content: 'Fact',
        source: createAgentId('agent-1'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
      });
      board.knowledge.addInference({
        conclusion: 'Inference',
        premises: [],
        confidence: 0.8,
        source: createAgentId('agent-1'),
        tags: [],
      });
      board.knowledge.addPattern({
        name: 'Pattern',
        description: 'Test',
        conditions: [],
        consequences: [],
        confidence: 0.7,
        tags: [],
      });

      board.knowledge.clearAll();

      expect(board.knowledge.facts).toHaveLength(0);
      expect(board.knowledge.inferences).toHaveLength(0);
      expect(board.knowledge.patterns).toHaveLength(0);
    });
  });
});
