import type { FastifyInstance, FastifyReply } from 'fastify';

import { HotReloadEngine, type HotReloadAuditTrail } from '../policy/hot-reload.js';
import type { PolicyStore } from '../policy/policy-store.js';
import { diffYaml } from '../policy/yaml-diff.js';
import { parsePolicyYaml, validatePolicyYaml } from '../policy/policy-validator.js';
import type { ApiErrorPayload } from '../types.js';

export interface PolicyEngineAdapter {
  loadInline(policySet: unknown, source?: string): unknown;
}

interface CreatePolicyBody {
  name: string;
  content: string;
}

interface UpdatePolicyBody {
  name?: string;
  content: string;
  revision: string;
}

interface ValidatePolicyBody {
  content: string;
}

interface DiffPolicyBody {
  content: string;
}

interface ReloadPolicyBody {
  content: string;
  revision: string;
}

const DASH_8001 = 'DASH_8001';
const DASH_8002 = 'DASH_8002';
const DASH_8003 = 'DASH_8003';

const sendError = (
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: string[],
) => reply.code(statusCode).send({ code, message, details } satisfies ApiErrorPayload & { details?: string[] });

const applyPolicyToEngine = async (
  policyEngine: PolicyEngineAdapter | undefined,
  policyId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!policyEngine) {
    return { ok: true };
  }
  const parsed = parsePolicyYaml(content);
  if (!parsed.policySet) {
    return { ok: false, error: parsed.errors[0] ?? 'Invalid YAML' };
  }

  try {
    policyEngine.loadInline(parsed.policySet, `dashboard-policy:${policyId}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const registerPolicyRoutes = (
  app: FastifyInstance,
  apiBasePath: string,
  policyStore: PolicyStore,
  policyEngine?: PolicyEngineAdapter,
  auditTrail?: HotReloadAuditTrail,
): void => {
  const hotReloadEngine = new HotReloadEngine(policyStore, policyEngine, auditTrail);

  app.get(`${apiBasePath}/policies`, async () => {
    const policies = await policyStore.list();
    return { policies };
  });

  app.get<{ Params: { policyId: string } }>(`${apiBasePath}/policies/:policyId`, async (request, reply) => {
    const policy = await policyStore.get(request.params.policyId);

    if (!policy) {
      return sendError(reply, 404, DASH_8002, 'Policy not found');
    }

    return { policy };
  });

  app.post<{ Body: CreatePolicyBody }>(`${apiBasePath}/policies`, async (request, reply) => {
    if (!request.body?.name || !request.body?.content) {
      return sendError(reply, 400, DASH_8001, 'Policy validation failed', ['name and content are required']);
    }

    const validation = validatePolicyYaml(request.body.content);
    if (!validation.valid) {
      return sendError(reply, 400, DASH_8001, 'Policy validation failed', validation.errors);
    }

    const created = await policyStore.create({
      name: request.body.name,
      content: request.body.content,
    });

    const applyResult = await applyPolicyToEngine(policyEngine, created.id, created.content);
    if (!applyResult.ok) {
      return sendError(reply, 400, DASH_8001, 'Policy validation failed', [applyResult.error]);
    }

    return reply.code(201).send({ policy: created });
  });

  app.put<{ Params: { policyId: string }; Body: UpdatePolicyBody }>(
    `${apiBasePath}/policies/:policyId`,
    async (request, reply) => {
      if (!request.body?.content || !request.body?.revision) {
        return sendError(reply, 400, DASH_8001, 'Policy validation failed', ['content and revision are required']);
      }

      const validation = validatePolicyYaml(request.body.content);
      if (!validation.valid) {
        return sendError(reply, 400, DASH_8001, 'Policy validation failed', validation.errors);
      }

      const updated = await policyStore.update(request.params.policyId, {
        name: request.body.name,
        content: request.body.content,
        revision: request.body.revision,
      });

      if (updated === null) {
        return sendError(reply, 404, DASH_8002, 'Policy not found');
      }

      if (updated === 'revision_conflict') {
        return sendError(reply, 409, DASH_8003, 'Revision conflict');
      }

      const applyResult = await applyPolicyToEngine(policyEngine, updated.id, updated.content);
      if (!applyResult.ok) {
        return sendError(reply, 400, DASH_8001, 'Policy validation failed', [applyResult.error]);
      }

      return { policy: updated };
    },
  );

  app.post<{ Params: { policyId: string }; Body: DiffPolicyBody }>(
    `${apiBasePath}/policies/:policyId/diff`,
    async (request, reply) => {
      if (!request.body?.content) {
        return sendError(reply, 400, DASH_8001, 'Policy validation failed', ['content is required']);
      }

      const current = await policyStore.get(request.params.policyId);
      if (!current) {
        return sendError(reply, 404, DASH_8002, 'Policy not found');
      }

      const result = diffYaml(current.content, request.body.content);
      return { diff: result, currentRevision: current.revision };
    },
  );

  app.post<{ Params: { policyId: string }; Body: ReloadPolicyBody }>(
    `${apiBasePath}/policies/:policyId/reload`,
    async (request, reply) => {
      if (!request.body?.content || !request.body?.revision) {
        return sendError(reply, 400, DASH_8001, 'Policy validation failed', ['content and revision are required']);
      }

      const result = await hotReloadEngine.reload(request.params.policyId, request.body.content, request.body.revision);
      if (!result.success) {
        const isEscalated = result.error?.startsWith('DASH_8005') ?? false;
        return sendError(
          reply,
          400,
          isEscalated ? 'DASH_8005' : 'DASH_8004',
          isEscalated ? 'Escalation triggered (3 consecutive failures)' : 'Hot-reload failed',
          result.error ? [result.error] : undefined,
        );
      }

      const updated = await policyStore.get(request.params.policyId);
      return { result, policy: updated };
    },
  );

  app.delete<{ Params: { policyId: string } }>(`${apiBasePath}/policies/:policyId`, async (request, reply) => {
    const deleted = await policyStore.delete(request.params.policyId);

    if (!deleted) {
      return sendError(reply, 404, DASH_8002, 'Policy not found');
    }

    return reply.code(204).send();
  });

  app.post<{ Body: ValidatePolicyBody }>(`${apiBasePath}/policies/validate`, async (request, reply) => {
    if (!request.body?.content) {
      return sendError(reply, 400, DASH_8001, 'Policy validation failed', ['content is required']);
    }

    const validation = validatePolicyYaml(request.body.content);
    if (!validation.valid) {
      return sendError(reply, 400, DASH_8001, 'Policy validation failed', validation.errors);
    }

    return reply.send(validation);
  });
};
