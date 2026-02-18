import type { FastifyInstance, FastifyReply } from 'fastify';

import type { AuditEvent } from '@obora/runtime';

import type { AuditStore } from '../audit/audit-store.js';
import type { ApiErrorPayload, AuditQueryParams } from '../types.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

const sendValidationError = (reply: FastifyReply, message: string): FastifyReply =>
  reply.code(400).send({
    code: 'DASH_5001',
    message,
  } satisfies ApiErrorPayload);

const parseDateParam = (name: 'fromTime' | 'toTime', value?: string): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid ISO 8601 datetime`);
  }

  return date;
};

const parsePositiveInt = (
  name: 'limit' | 'offset',
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
};

const normalizeEventType = (rawEventType: string | string[] | undefined): string[] | string | undefined => {
  if (!rawEventType) {
    return undefined;
  }

  if (Array.isArray(rawEventType)) {
    return rawEventType;
  }

  if (rawEventType.includes(',')) {
    return rawEventType
      .split(',')
      .map((type) => type.trim())
      .filter((type) => type.length > 0);
  }

  return rawEventType;
};

interface QueryString {
  fromTime?: string;
  toTime?: string;
  eventType?: string | string[];
  stepName?: string;
  executionId?: string;
  limit?: string;
  offset?: string;
}

const queryForEventId = async (store: AuditStore, eventId: string): Promise<AuditEvent | null> => {
  const maybeStore = store as AuditStore & { getById?: (id: string) => Promise<AuditEvent | null> };
  if (maybeStore.getById) {
    return maybeStore.getById(eventId);
  }

  const result = await store.query({ limit: MAX_LIMIT, offset: 0 });
  return result.events.find((event) => event.id === eventId) ?? null;
};

export const registerAuditRoutes = (
  app: FastifyInstance,
  apiBasePath: string,
  store: AuditStore,
): void => {
  app.get<{ Querystring: QueryString }>(`${apiBasePath}/audit/events`, async (request, reply) => {
    try {
      const fromTime = parseDateParam('fromTime', request.query.fromTime);
      const toTime = parseDateParam('toTime', request.query.toTime);
      const limit = parsePositiveInt('limit', request.query.limit, DEFAULT_LIMIT);
      const offset = parsePositiveInt('offset', request.query.offset, DEFAULT_OFFSET);

      if (fromTime && toTime && fromTime > toTime) {
        return sendValidationError(reply, 'fromTime must be earlier than or equal to toTime');
      }

      if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
        return sendValidationError(reply, `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`);
      }

      if (offset < 0) {
        return sendValidationError(reply, 'offset must be greater than or equal to 0');
      }

      const params: AuditQueryParams = {
        fromTime: request.query.fromTime,
        toTime: request.query.toTime,
        eventType: normalizeEventType(request.query.eventType),
        stepName: request.query.stepName,
        executionId: request.query.executionId,
        limit,
        offset,
      };

      const result = await store.query(params);

      return reply.send({
        events: result.events,
        total: result.total,
        hasMore: result.hasMore,
        limit,
        offset,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid query parameters';
      return sendValidationError(reply, message);
    }
  });

  app.get<{ Params: { eventId: string } }>(`${apiBasePath}/audit/events/:eventId`, async (request, reply) => {
    const event = await queryForEventId(store, request.params.eventId);

    if (!event) {
      return reply.code(404).send({
        code: 'DASH_5002',
        message: 'Audit event not found',
      } satisfies ApiErrorPayload);
    }

    return reply.send({ event });
  });

  app.get<{ Params: { executionId: string }; Querystring: QueryString }>(
    `${apiBasePath}/audit/executions/:executionId/events`,
    async (request, reply) => {
      const query = {
        ...request.query,
        executionId: request.params.executionId,
      };

      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) {
          continue;
        }

        if (Array.isArray(value)) {
          value.forEach((item) => searchParams.append(key, item));
          continue;
        }

        searchParams.set(key, value);
      }

      const response = await app.inject({
        method: 'GET',
        url: `${apiBasePath}/audit/events?${searchParams.toString()}`,
      });

      return reply.code(response.statusCode).send(response.json());
    },
  );
};
