import type { EventBus } from '../../events';
import type { AgentId, AgendaId } from '../../types';
import {
  AGENDA_STATUS_TRANSITIONS,
  type Agenda,
  type AgendaStatus,
  type CreateAgendaInput,
  type UpdateAgendaInput,
} from './types';
import { createAgendaEventMeta, type AgendaDomainEvent } from './events';

export class AgendaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgendaValidationError';
  }
}

export class AgendaNotFoundError extends Error {
  constructor(id: AgendaId) {
    super(`Agenda not found: ${id}`);
    this.name = 'AgendaNotFoundError';
  }
}

export class AgendaTransitionError extends Error {
  constructor(from: AgendaStatus, to: AgendaStatus) {
    super(`Invalid agenda status transition: ${from} -> ${to}`);
    this.name = 'AgendaTransitionError';
  }
}

export interface AgendaStoreOptions {
  eventBus?: EventBus;
}

export class AgendaStore {
  private readonly agendas = new Map<AgendaId, Agenda>();

  constructor(private readonly options: AgendaStoreOptions = {}) {}

  private cloneAgenda(agenda: Agenda): Agenda {
    return {
      ...agenda,
      dueAt: agenda.dueAt ? new Date(agenda.dueAt.getTime()) : undefined,
      createdAt: new Date(agenda.createdAt.getTime()),
      updatedAt: new Date(agenda.updatedAt.getTime()),
    };
  }

  private toImmutableEventDate(date: Date): Date {
    const immutable = new Date(date.getTime());
    const mutators = [
      'setTime',
      'setMilliseconds',
      'setUTCMilliseconds',
      'setSeconds',
      'setUTCSeconds',
      'setMinutes',
      'setUTCMinutes',
      'setHours',
      'setUTCHours',
      'setDate',
      'setUTCDate',
      'setMonth',
      'setUTCMonth',
      'setFullYear',
      'setUTCFullYear',
      'setYear',
    ] as const;

    for (const method of mutators) {
      Object.defineProperty(immutable, method, {
        value: () => {
          throw new TypeError('Agenda event date is immutable');
        },
        writable: false,
        configurable: false,
      });
    }

    return Object.freeze(immutable);
  }

  private cloneAgendaForEvent(agenda: Agenda): Agenda {
    return {
      ...agenda,
      dueAt: agenda.dueAt ? this.toImmutableEventDate(agenda.dueAt) : undefined,
      createdAt: this.toImmutableEventDate(agenda.createdAt),
      updatedAt: this.toImmutableEventDate(agenda.updatedAt),
    };
  }

  private getExisting(id: AgendaId): Agenda {
    const agenda = this.agendas.get(id);
    if (!agenda) {
      throw new AgendaNotFoundError(id);
    }
    return agenda;
  }

  private deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    const target = value as Record<string, unknown>;
    for (const nested of Object.values(target)) {
      this.deepFreeze(nested);
    }

    return Object.freeze(value);
  }

  create(input: CreateAgendaInput, source: AgentId | 'system' = 'system'): Agenda {
    this.validateCreateInput(input);
    if (this.agendas.has(input.id)) {
      throw new AgendaValidationError(`Agenda already exists: ${input.id}`);
    }

    const now = new Date();
    const agenda: Agenda = {
      id: input.id,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: input.priority ?? 3,
      dueAt: input.dueAt ? new Date(input.dueAt.getTime()) : undefined,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.agendas.set(agenda.id, this.cloneAgenda(agenda));
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.created',
      payload: { agenda: this.cloneAgendaForEvent(agenda) },
    });
    return this.cloneAgenda(agenda);
  }

  getById(id: AgendaId): Agenda {
    return this.cloneAgenda(this.getExisting(id));
  }

  list(): Agenda[] {
    return [...this.agendas.values()]
      .map((agenda) => this.cloneAgenda(agenda))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  update(id: AgendaId, patch: UpdateAgendaInput, source: AgentId | 'system' = 'system'): Agenda {
    const previous = this.getExisting(id);
    this.validatePatchInput(patch);

    const nextDescription =
      patch.description === undefined
        ? previous.description
        : patch.description === null
          ? undefined
          : patch.description.trim();

    const nextDueAt =
      patch.dueAt === undefined
        ? previous.dueAt
        : patch.dueAt === null
          ? undefined
          : new Date(patch.dueAt.getTime());

    const current: Agenda = {
      ...previous,
      title: patch.title?.trim() ?? previous.title,
      description: nextDescription,
      priority: patch.priority ?? previous.priority,
      dueAt: nextDueAt,
      updatedAt: new Date(),
    };

    this.agendas.set(id, this.cloneAgenda(current));
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.updated',
      payload: {
        agendaId: previous.id,
        previous: this.cloneAgendaForEvent(previous),
        current: this.cloneAgendaForEvent(current),
      },
    });

    return this.cloneAgenda(current);
  }

  transition(id: AgendaId, nextStatus: AgendaStatus, source: AgentId | 'system' = 'system'): Agenda {
    const agenda = this.getExisting(id);
    const allowed = AGENDA_STATUS_TRANSITIONS[agenda.status];
    if (!allowed.includes(nextStatus)) {
      throw new AgendaTransitionError(agenda.status, nextStatus);
    }

    const updated: Agenda = {
      ...agenda,
      status: nextStatus,
      updatedAt: new Date(),
    };

    this.agendas.set(id, this.cloneAgenda(updated));
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.status.changed',
      payload: {
        agendaId: id,
        previousStatus: agenda.status,
        newStatus: nextStatus,
      },
    });

    return this.cloneAgenda(updated);
  }

  delete(id: AgendaId, source: AgentId | 'system' = 'system'): Agenda {
    const existing = this.getExisting(id);
    this.agendas.delete(id);
    this.emit({
      ...createAgendaEventMeta(source),
      type: 'agenda.deleted',
      payload: {
        agendaId: id,
        deleted: this.cloneAgendaForEvent(existing),
      },
    });

    return this.cloneAgenda(existing);
  }

  private emit(event: AgendaDomainEvent): void {
    this.options.eventBus?.emit(this.deepFreeze(event));
  }

  private validateCreateInput(input: CreateAgendaInput): void {
    if (!input.id) {
      throw new AgendaValidationError('Agenda id is required');
    }
    if (!input.title?.trim()) {
      throw new AgendaValidationError('Agenda title is required');
    }
    if (input.description !== undefined && !input.description.trim()) {
      throw new AgendaValidationError('Agenda description cannot be empty string');
    }
    if (input.priority !== undefined && (input.priority < 1 || input.priority > 5)) {
      throw new AgendaValidationError('Agenda priority must be between 1 and 5');
    }
    if (input.dueAt && Number.isNaN(input.dueAt.getTime())) {
      throw new AgendaValidationError('Agenda dueAt must be a valid Date');
    }
  }

  private validatePatchInput(patch: UpdateAgendaInput): void {
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new AgendaValidationError('Agenda title cannot be empty');
    }
    if (patch.priority !== undefined && (patch.priority < 1 || patch.priority > 5)) {
      throw new AgendaValidationError('Agenda priority must be between 1 and 5');
    }
    if (patch.description !== undefined && patch.description !== null && !patch.description.trim()) {
      throw new AgendaValidationError('Agenda description cannot be empty string');
    }
    if (patch.dueAt && Number.isNaN(patch.dueAt.getTime())) {
      throw new AgendaValidationError('Agenda dueAt must be a valid Date');
    }
  }
}
