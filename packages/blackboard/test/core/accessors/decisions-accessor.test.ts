import { describe, it, expect, beforeEach } from 'vitest';
import {
  Blackboard,
  createAgentId,
  createAgendaId,
  AgendaStatus,
} from '../../../src';
import { resetFactories, createTestAgenda } from '../../helpers/factories';

describe('DecisionsAccessor', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard();
  });

  describe('agendas', () => {
    it('should submit agenda', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test Agenda',
        description: 'Description',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      expect(agenda.id).toBeDefined();
      expect(agenda.title).toBe('Test Agenda');
      expect(agenda.status).toBe(AgendaStatus.SUBMITTED);
    });

    it('should get agenda by id', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      const retrieved = board.decisions.getAgenda(agenda.id);
      expect(retrieved).toEqual(agenda);
    });

    it('should return undefined for non-existent agenda', () => {
      expect(board.decisions.getAgenda(createAgendaId('nonexistent'))).toBeUndefined();
    });

    it('should get current agenda', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.setCurrentAgenda(agenda.id);
      expect(board.decisions.current?.id).toBe(agenda.id);
    });

    it('should get pending agendas', () => {
      board.decisions.submitAgenda({
        title: 'Agenda 1',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });
      board.decisions.submitAgenda({
        title: 'Agenda 2',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      expect(board.decisions.pending).toHaveLength(2);
    });

    it('should update agenda status', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.updateAgendaStatus(agenda.id, AgendaStatus.DISCUSSING);
      
      const updated = board.decisions.getAgenda(agenda.id);
      expect(updated?.status).toBe(AgendaStatus.DISCUSSING);
    });

    it('should close agenda', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.closeAgenda(agenda.id, 'approved');
      
      const updated = board.decisions.getAgenda(agenda.id);
      expect(updated?.status).toBe(AgendaStatus.RESOLVED);
    });

    it('should get agenda history', () => {
      const agenda1 = board.decisions.submitAgenda({
        title: 'Agenda 1',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });
      board.decisions.closeAgenda(agenda1.id, 'approved');

      const agenda2 = board.decisions.submitAgenda({
        title: 'Agenda 2',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });
      board.decisions.closeAgenda(agenda2.id, 'rejected');

      expect(board.decisions.history).toHaveLength(2);
    });
  });

  describe('opinions', () => {
    let agenda: any;

    beforeEach(() => {
      agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('agent-1'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });
    });

    it('should submit opinion', () => {
      const opinion = board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Good proposal',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      expect(opinion.id).toBeDefined();
      expect(opinion.stance).toBe('approve');
    });

    it('should get opinions for agenda', () => {
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-3'),
        agendaId: agenda.id,
        stance: 'reject',
        reason: 'No',
        conditions: [],
        confidence: 0.8,
        references: [],
      });

      const opinions = board.decisions.getOpinions(agenda.id);
      expect(opinions).toHaveLength(2);
    });

    it('should get opinion by agent', () => {
      const agentId = createAgentId('agent-2');
      
      board.decisions.submitOpinion({
        agentId,
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      const opinion = board.decisions.getOpinionByAgent(agenda.id, agentId);
      expect(opinion).toBeDefined();
      expect(opinion?.agentId).toBe(agentId);
    });

    it('should prevent duplicate opinions from same agent', () => {
      const agentId = createAgentId('agent-2');
      
      board.decisions.submitOpinion({
        agentId,
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      expect(() => 
        board.decisions.submitOpinion({
          agentId,
          agendaId: agenda.id,
          stance: 'reject',
          reason: 'Changed mind',
          conditions: [],
          confidence: 0.8,
          references: [],
        })
      ).toThrow();
    });

    it('should update opinion', () => {
      const agentId = createAgentId('agent-2');
      const opinion = board.decisions.submitOpinion({
        agentId,
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      board.decisions.updateOpinion(opinion.id, {
        stance: 'abstain',
        reason: 'Not sure anymore',
      });

      const updated = board.decisions.getOpinionByAgent(agenda.id, agentId);
      expect(updated?.stance).toBe('abstain');
      expect(updated?.reason).toBe('Not sure anymore');
    });

    it('should remove opinion', () => {
      const agentId = createAgentId('agent-2');
      const opinion = board.decisions.submitOpinion({
        agentId,
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      board.decisions.removeOpinion(opinion.id);
      
      const opinions = board.decisions.getOpinions(agenda.id);
      expect(opinions).toHaveLength(0);
    });
  });

  describe('summarizeOpinions', () => {
    let agenda: any;

    beforeEach(() => {
      agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('proposer'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });
    });

    it('should summarize opinions correctly', () => {
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-1'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'reject',
        reason: 'No',
        conditions: [],
        confidence: 0.8,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-3'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.85,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-4'),
        agendaId: agenda.id,
        stance: 'abstain',
        reason: 'Not sure',
        conditions: [],
        confidence: 0.5,
        references: [],
      });

      const summary = board.decisions.summarizeOpinions(agenda.id);
      
      expect(summary.total).toBe(4);
      expect(summary.approve).toBe(2);
      expect(summary.reject).toBe(1);
      expect(summary.abstain).toBe(1);
      expect(summary.approvalRate).toBeCloseTo(0.5);
    });

    it('should handle empty opinions', () => {
      const summary = board.decisions.summarizeOpinions(agenda.id);
      
      expect(summary.total).toBe(0);
      expect(summary.approve).toBe(0);
      expect(summary.reject).toBe(0);
      expect(summary.abstain).toBe(0);
    });

    it('should calculate quorum status', () => {
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-1'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      const summary = board.decisions.summarizeOpinions(agenda.id);
      expect(summary.quorumReached).toBe(false); // requiredQuorum is 3

      board.decisions.submitOpinion({
        agentId: createAgentId('agent-3'),
        agendaId: agenda.id,
        stance: 'reject',
        reason: 'No',
        conditions: [],
        confidence: 0.8,
        references: [],
      });

      const summary2 = board.decisions.summarizeOpinions(agenda.id);
      expect(summary2.quorumReached).toBe(true);
    });
  });

  describe('voting methods', () => {
    it('should check majority result', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('proposer'),
        deadline: null,
        requiredQuorum: 2,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.submitOpinion({
        agentId: createAgentId('agent-1'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-3'),
        agendaId: agenda.id,
        stance: 'reject',
        reason: 'No',
        conditions: [],
        confidence: 0.8,
        references: [],
      });

      const result = board.decisions.checkVotingResult(agenda.id);
      expect(result.passed).toBe(true);
      expect(result.method).toBe('majority');
    });

    it('should check unanimous result', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('proposer'),
        deadline: null,
        requiredQuorum: 2,
        votingMethod: 'unanimous',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.submitOpinion({
        agentId: createAgentId('agent-1'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-2'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      const result = board.decisions.checkVotingResult(agenda.id);
      expect(result.passed).toBe(true);

      // Add rejection
      board.decisions.submitOpinion({
        agentId: createAgentId('agent-3'),
        agendaId: agenda.id,
        stance: 'reject',
        reason: 'No',
        conditions: [],
        confidence: 0.8,
        references: [],
      });

      const result2 = board.decisions.checkVotingResult(agenda.id);
      expect(result2.passed).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all decisions', () => {
      const agenda = board.decisions.submitAgenda({
        title: 'Test',
        description: 'Test',
        proposer: createAgentId('proposer'),
        deadline: null,
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: [],
        attachments: [],
      });

      board.decisions.submitOpinion({
        agentId: createAgentId('agent-1'),
        agendaId: agenda.id,
        stance: 'approve',
        reason: 'Yes',
        conditions: [],
        confidence: 0.9,
        references: [],
      });

      board.decisions.clearAll();

      expect(board.decisions.current).toBeNull();
      expect(board.decisions.pending).toHaveLength(0);
      expect(board.decisions.history).toHaveLength(0);
    });
  });
});
