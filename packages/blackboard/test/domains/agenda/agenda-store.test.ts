import { describe, expect, it } from 'vitest';

import { createAgendaId } from '../../../src/types';
import { EventBus } from '../../../src/events';
import {
  AgendaStore,
  AgendaTransitionError,
  AgendaValidationError,
} from '../../../src/domains/agenda';

describe('AgendaStore', () => {
  it('creates agenda with defaults', () => {
    const store = new AgendaStore();

    const agenda = store.create({
      id: createAgendaId('agenda-1'),
      title: '  Adopt blackboard-first policy  ',
    });

    expect(agenda.status).toBe('draft');
    expect(agenda.priority).toBe(3);
    expect(agenda.title).toBe('Adopt blackboard-first policy');
    expect(store.getById(agenda.id).id).toBe(agenda.id);
  });

  it('validates priority range', () => {
    const store = new AgendaStore();

    expect(() =>
      store.create({
        id: createAgendaId('agenda-2'),
        title: 'Invalid agenda',
        priority: 9,
      })
    ).toThrow(AgendaValidationError);
  });

  it('rejects empty description consistently on create', () => {
    const store = new AgendaStore();

    expect(() =>
      store.create({
        id: createAgendaId('agenda-2b'),
        title: 'Invalid description',
        description: '   ',
      })
    ).toThrow(AgendaValidationError);
  });

  it('enforces linear status transitions', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-3');

    store.create({ id, title: 'Status test' });
    store.transition(id, 'pending');
    store.transition(id, 'active');
    const completed = store.transition(id, 'completed');

    expect(completed.status).toBe('completed');
    expect(() => store.transition(id, 'pending')).toThrow(AgendaTransitionError);
  });

  it('emits agenda domain events via event bus', () => {
    const bus = new EventBus();
    const store = new AgendaStore({ eventBus: bus });
    const received: string[] = [];

    bus.subscribe('agenda.*', (event) => {
      received.push(event.type);
    });

    const id = createAgendaId('agenda-4');
    store.create({ id, title: 'Event test' });
    store.update(id, { description: 'updated' });
    store.transition(id, 'pending');
    store.delete(id);

    expect(received).toEqual(['agenda.created', 'agenda.updated', 'agenda.status.changed', 'agenda.deleted']);
  });

  it('prevents external mutation through returned agenda objects', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-5');

    const created = store.create({ id, title: 'Immutable return' });
    (created as unknown as { title: string }).title = 'tampered';

    const persisted = store.getById(id);
    expect(persisted.title).toBe('Immutable return');
  });

  it('supports clearing optional fields explicitly', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-6');
    store.create({
      id,
      title: 'Clear fields',
      description: 'desc',
      dueAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const updated = store.update(id, { description: null, dueAt: null });

    expect(updated.description).toBeUndefined();
    expect(updated.dueAt).toBeUndefined();
  });

  it('emits immutable event payload snapshots', () => {
    const bus = new EventBus();
    const store = new AgendaStore({ eventBus: bus });
    const id = createAgendaId('agenda-7');

    let mutationError: Error | undefined;
    let dateMutationError: Error | undefined;
    let metaDateMutationError: Error | undefined;
    let prototypeCallMutationError: Error | undefined;
    bus.subscribe('agenda.created', (event) => {
      try {
        (event.payload.agenda as unknown as { title: string }).title = 'mutated-from-subscriber';
      } catch (error) {
        mutationError = error as Error;
      }

      try {
        event.payload.agenda.createdAt.setUTCFullYear(2050);
      } catch (error) {
        dateMutationError = error as Error;
      }

      try {
        event.timestamp.setUTCFullYear(2050);
      } catch (error) {
        metaDateMutationError = error as Error;
      }

      try {
        Date.prototype.setTime.call(event.timestamp, 0);
      } catch (error) {
        prototypeCallMutationError = error as Error;
      }
    });

    store.create({ id, title: 'Event snapshot' });

    expect(mutationError).toBeDefined();
    expect(dateMutationError).toBeDefined();
    expect(metaDateMutationError).toBeDefined();
    expect(prototypeCallMutationError).toBeDefined();
    expect(store.getById(id).title).toBe('Event snapshot');
  });

  it('deletes agenda and prevents further reads', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-8');
    store.create({ id, title: 'Will be deleted' });

    const deleted = store.delete(id);

    expect(deleted.id).toBe(id);
    expect(() => store.getById(id)).toThrow('Agenda not found');
  });

  it('isolates dueAt from caller date mutation', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-9');
    const dueAt = new Date('2030-01-01T00:00:00.000Z');

    store.create({ id, title: 'Date isolation', dueAt });
    dueAt.setUTCFullYear(2040);

    const persisted = store.getById(id);
    expect(persisted.dueAt?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('keeps stored dates immutable against returned object date mutation', () => {
    const store = new AgendaStore();
    const id = createAgendaId('agenda-10');
    store.create({ id, title: 'Date immutability', dueAt: new Date('2031-01-01T00:00:00.000Z') });

    const agenda = store.getById(id);
    agenda.dueAt?.setUTCFullYear(2050);

    expect(store.getById(id).dueAt?.toISOString()).toBe('2031-01-01T00:00:00.000Z');
  });

  it('resists Date.prototype.set*.call bypass on event timestamps', () => {
    const bus = new EventBus();
    const store = new AgendaStore({ eventBus: bus });
    const id = createAgendaId('agenda-proto');

    let capturedTimestamp: Date | undefined;
    bus.subscribe('agenda.created', (event) => {
      capturedTimestamp = event.timestamp;
    });

    store.create({ id, title: 'Proto bypass test' });

    expect(capturedTimestamp).toBeDefined();
    const before = capturedTimestamp!.getTime();

    // Direct prototype call should throw TypeError (incompatible receiver)
    expect(() => Date.prototype.setUTCFullYear.call(capturedTimestamp, 2099)).toThrow(TypeError);
    expect(capturedTimestamp!.getTime()).toBe(before);
  });
});
