import type { AgentId } from '../../types';
import type {
  AgendaCreatedDomainEvent,
  AgendaUpdatedDomainEvent,
  AgendaStatusChangedDomainEvent,
  AgendaDeletedDomainEvent,
} from '../../events/types';

export type AgendaCreatedEvent = AgendaCreatedDomainEvent;
export type AgendaUpdatedEvent = AgendaUpdatedDomainEvent;
export type AgendaStatusChangedEvent = AgendaStatusChangedDomainEvent;
export type AgendaDeletedEvent = AgendaDeletedDomainEvent;

export type AgendaDomainEvent =
  | AgendaCreatedEvent
  | AgendaUpdatedEvent
  | AgendaStatusChangedEvent
  | AgendaDeletedEvent;

const createImmutableEventDate = (date = new Date()): Date => {
  // Capture epoch once; all reads derive from this frozen value.
  const epoch = Date.prototype.getTime.call(date);
  const source = new Date(epoch);

  const mutators = new Set<PropertyKey>([
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
  ]);

  // Use a plain-object target so Date.prototype.set*.call(proxy, ...)
  // throws TypeError ("called on incompatible receiver") even if the
  // caller bypasses the Proxy get-trap via .call/.apply on the prototype.
  const shell: Record<PropertyKey, unknown> = {};

  const immutableDate = new Proxy(shell, {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    get(_target, prop, _receiver) {
      if (mutators.has(prop)) {
        return () => {
          throw new TypeError('Agenda event date is immutable');
        };
      }
      if (prop === Symbol.toPrimitive) {
        return (hint: string) => (hint === 'number' ? epoch : source.toString());
      }
      const value = (source as unknown as Record<PropertyKey, unknown>)[prop];
      if (typeof value === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        return (value as Function).bind(source);
      }
      return value;
    },
    getPrototypeOf() {
      return Date.prototype;
    },
    set() {
      throw new TypeError('Agenda event date is immutable');
    },
    defineProperty() {
      throw new TypeError('Agenda event date is immutable');
    },
    deleteProperty() {
      throw new TypeError('Agenda event date is immutable');
    },
    setPrototypeOf() {
      throw new TypeError('Agenda event date is immutable');
    },
  });

  return Object.freeze(immutableDate) as unknown as Date;
};

export const createAgendaEventMeta = (source: AgentId | 'system' = 'system') => ({
  id: `evt-agenda-${crypto.randomUUID()}`,
  timestamp: createImmutableEventDate(),
  source,
});
