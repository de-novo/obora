import type { FastifyInstance, FastifyReply } from 'fastify';

import type { ApiErrorPayload } from '../types.js';
import type { HistoryRunsQuery, HistoryStore } from '../history/history-store.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;
const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 500;

interface ListQuery {
  status?: 'running' | 'completed' | 'failed' | 'suspended';
  workflowName?: string;
  from?: string;
  to?: string;
  costMin?: string;
  costMax?: string;
  limit?: string;
  offset?: string;
  sortBy?: 'startedAt' | 'completedAt' | 'totalCostUsd';
  sortOrder?: 'asc' | 'desc';
}

interface DetailQuery {
  auditLimit?: string;
  auditOffset?: string;
}

const sendValidationError = (reply: FastifyReply, message: string): FastifyReply =>
  reply.code(400).send({
    code: 'DASH_7001',
    message,
  } satisfies ApiErrorPayload);

const parseIntParam = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) throw new Error('Expected integer');
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) throw new Error('Expected integer');
  return parsed;
};

const parseNumberParam = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Expected number');
  return parsed;
};

const parseListQuery = (query: ListQuery): HistoryRunsQuery => {
  const limit = parseIntParam(query.limit, DEFAULT_LIMIT);
  const offset = parseIntParam(query.offset, DEFAULT_OFFSET);

  if (limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_LIMIT}`);
  }
  if (offset < 0) {
    throw new Error('offset must be greater than or equal to 0');
  }

  return {
    status: query.status,
    workflowName: query.workflowName,
    from: query.from,
    to: query.to,
    costMin: parseNumberParam(query.costMin),
    costMax: parseNumberParam(query.costMax),
    limit,
    offset,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
};

export const registerHistoryRoutes = (app: FastifyInstance, apiBasePath: string, store: HistoryStore): void => {
  app.get<{ Querystring: ListQuery }>(`${apiBasePath}/history/runs`, async (request, reply) => {
    try {
      const parsed = parseListQuery(request.query);
      const result = await store.listRuns(parsed);
      return reply.send(result);
    } catch (error) {
      return sendValidationError(reply, error instanceof Error ? error.message : 'Invalid query');
    }
  });

  app.get<{ Params: { runId: string }; Querystring: DetailQuery }>(`${apiBasePath}/history/runs/:runId`, async (request, reply) => {
    try {
      const auditLimit = parseIntParam(request.query.auditLimit, DEFAULT_AUDIT_LIMIT);
      const auditOffset = parseIntParam(request.query.auditOffset, DEFAULT_OFFSET);

      if (auditLimit < 1 || auditLimit > MAX_AUDIT_LIMIT) {
        return sendValidationError(reply, `auditLimit must be between 1 and ${MAX_AUDIT_LIMIT}`);
      }
      if (auditOffset < 0) {
        return sendValidationError(reply, 'auditOffset must be greater than or equal to 0');
      }

      const result = await store.getRunDetail(request.params.runId, { auditLimit, auditOffset });
      if (!result) {
        return reply.code(404).send({ code: 'DASH_7002', message: 'Run not found' } satisfies ApiErrorPayload);
      }

      return reply.send(result);
    } catch (error) {
      return sendValidationError(reply, error instanceof Error ? error.message : 'Invalid query');
    }
  });

  app.post<{ Params: { runId: string } }>(`${apiBasePath}/history/runs/:runId/resume`, async (request, reply) => {
    const result = await store.resumeRun(request.params.runId);
    if (!result.ok) {
      const statusCode = result.reason === 'Run not found' ? 404 : 400;
      return reply.code(statusCode).send({ code: 'DASH_7003', message: result.reason } satisfies ApiErrorPayload);
    }
    return reply.send({ ok: true });
  });
};
