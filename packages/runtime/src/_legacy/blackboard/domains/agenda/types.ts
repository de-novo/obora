import type { AgendaId } from '../../types';

export type AgendaStatus = 'draft' | 'pending' | 'active' | 'completed' | 'cancelled';

export interface Agenda {
  readonly id: AgendaId;
  readonly title: string;
  readonly description?: string;
  readonly priority: number;
  readonly dueAt?: Date;
  readonly status: AgendaStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAgendaInput {
  id: AgendaId;
  title: string;
  description?: string;
  priority?: number;
  dueAt?: Date;
}

export interface UpdateAgendaInput {
  title?: string;
  description?: string | null;
  priority?: number;
  dueAt?: Date | null;
}

export const AGENDA_STATUS_TRANSITIONS: Record<AgendaStatus, AgendaStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
