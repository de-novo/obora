import { describe, expect, it, vi } from 'vitest';

import { NotificationEngine } from '../notification/engine.js';
import type { NotificationChannel } from '../notification/channel.js';
import type { ExecutionEvent, NotificationRule } from '../types.js';

const createEvent = (overrides: Partial<ExecutionEvent> = {}): ExecutionEvent => ({
  id: 'exec-1:00000001',
  executionId: 'exec-1',
  timestamp: '2026-02-17T12:00:00.000Z',
  type: 'gate_wait',
  stepName: 'approval',
  severity: 'warning',
  payload: {},
  ...overrides,
});

const createRule = (overrides: Partial<NotificationRule> = {}): NotificationRule => ({
  id: 'rule-1',
  name: 'gate alerts',
  enabled: true,
  trigger: {
    eventTypes: ['gate_wait'],
  },
  channel: 'test',
  ...overrides,
});

describe('notification engine', () => {
  it('matches rules by eventType', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const channel: NotificationChannel = { name: 'test', send };
    const engine = new NotificationEngine();
    engine.registerChannel(channel);
    engine.addRule(createRule({ trigger: { eventTypes: ['gate_wait'] } }));

    await engine.processEvent(createEvent({ type: 'gate_wait' }));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('filters by severity when configured', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const channel: NotificationChannel = { name: 'test', send };
    const engine = new NotificationEngine();
    engine.registerChannel(channel);
    engine.addRule(createRule({ trigger: { eventTypes: ['gate_wait'], severities: ['critical'] } }));

    await engine.processEvent(createEvent({ severity: 'warning' }));

    expect(send).not.toHaveBeenCalled();
  });

  it('filters by stepName when configured', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const channel: NotificationChannel = { name: 'test', send };
    const engine = new NotificationEngine();
    engine.registerChannel(channel);
    engine.addRule(createRule({ trigger: { eventTypes: ['gate_wait'], stepNames: ['deploy'] } }));

    await engine.processEvent(createEvent({ stepName: 'approval' }));

    expect(send).not.toHaveBeenCalled();
  });

  it('dispatches to multiple matching rules', async () => {
    const sendA = vi.fn().mockResolvedValue({ success: true });
    const sendB = vi.fn().mockResolvedValue({ success: true });
    const channelA: NotificationChannel = { name: 'chan-a', send: sendA };
    const channelB: NotificationChannel = { name: 'chan-b', send: sendB };

    const engine = new NotificationEngine();
    engine.registerChannel(channelA);
    engine.registerChannel(channelB);
    engine.addRule(createRule({ id: 'rule-a', channel: 'chan-a' }));
    engine.addRule(createRule({ id: 'rule-b', channel: 'chan-b' }));

    await engine.processEvent(createEvent());

    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);
  });

  it('logs send failures', async () => {
    const logger = { error: vi.fn() };
    const send = vi.fn().mockResolvedValue({ success: false, error: 'network down' });
    const channel: NotificationChannel = { name: 'test', send };

    const engine = new NotificationEngine({ logger });
    engine.registerChannel(channel);
    engine.addRule(createRule());

    await engine.processEvent(createEvent());

    expect(logger.error).toHaveBeenCalledWith(
      'DASH_11002 Notification send failed',
      expect.objectContaining({
        code: 'DASH_11002',
        channel: 'test',
        error: 'network down',
      }),
    );
  });

  it('skips disabled rules', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const channel: NotificationChannel = { name: 'test', send };
    const engine = new NotificationEngine();
    engine.registerChannel(channel);
    engine.addRule(createRule({ enabled: false }));

    await engine.processEvent(createEvent());

    expect(send).not.toHaveBeenCalled();
  });
});
