import type { FastifyInstance } from 'fastify';

import type { NotificationEngine } from '../notification/engine.js';
import type { NotificationRule } from '../types.js';

interface CreateRuleBody {
  id?: string;
  name: string;
  enabled?: boolean;
  trigger: NotificationRule['trigger'];
  channel: string;
  template?: string;
}

interface UpdateRuleBody {
  name?: string;
  enabled?: boolean;
  trigger?: NotificationRule['trigger'];
  channel?: string;
  template?: string;
}

const isValidTrigger = (trigger: NotificationRule['trigger'] | undefined): boolean =>
  !!trigger && Array.isArray(trigger.eventTypes) && trigger.eventTypes.length > 0;

export const registerNotificationRoutes = (
  app: FastifyInstance,
  apiBasePath: string,
  notificationEngine: NotificationEngine,
): void => {
  app.get(`${apiBasePath}/notifications/rules`, async () => {
    return { rules: notificationEngine.getRules() };
  });

  app.post<{ Body: CreateRuleBody }>(`${apiBasePath}/notifications/rules`, async (request, reply) => {
    if (!request.body?.name || !request.body?.channel || !isValidTrigger(request.body.trigger)) {
      return reply.code(400).send({
        code: 'DASH_11010',
        message: 'Invalid notification rule payload',
      });
    }

    const id = request.body.id ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const rule: NotificationRule = {
      id,
      name: request.body.name,
      enabled: request.body.enabled ?? true,
      trigger: request.body.trigger,
      channel: request.body.channel,
      template: request.body.template,
    };

    notificationEngine.addRule(rule);

    return reply.code(201).send({ rule });
  });

  app.put<{ Params: { ruleId: string }; Body: UpdateRuleBody }>(
    `${apiBasePath}/notifications/rules/:ruleId`,
    async (request, reply) => {
      const existing = notificationEngine.getRules().find((rule) => rule.id === request.params.ruleId);
      if (!existing) {
        return reply.code(404).send({ code: 'DASH_11011', message: 'Notification rule not found' });
      }

      if (request.body.trigger && !isValidTrigger(request.body.trigger)) {
        return reply.code(400).send({ code: 'DASH_11010', message: 'Invalid notification rule payload' });
      }

      const updated: NotificationRule = {
        ...existing,
        ...request.body,
        trigger: request.body.trigger ?? existing.trigger,
      };

      notificationEngine.addRule(updated);
      return { rule: updated };
    },
  );

  app.delete<{ Params: { ruleId: string } }>(`${apiBasePath}/notifications/rules/:ruleId`, async (request, reply) => {
    const deleted = notificationEngine.removeRule(request.params.ruleId);
    if (!deleted) {
      return reply.code(404).send({ code: 'DASH_11011', message: 'Notification rule not found' });
    }

    return reply.code(204).send();
  });
};
