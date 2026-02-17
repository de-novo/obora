import { describe, expect, it, vi } from 'vitest';

import { HotReloadEngine } from '../policy/hot-reload.js';
import { InMemoryPolicyStore } from '../policy/policy-store.js';

describe('hot-reload', () => {
  it('succeeds when engine apply is successful', async () => {
    const store = new InMemoryPolicyStore();
    const created = await store.create({ name: 'p1', content: 'version: v1' });

    const loadInline = vi.fn();
    const engine = new HotReloadEngine(store, { loadInline });

    const result = await engine.reload(created.id, 'version: v2', created.revision);

    expect(result.success).toBe(true);
    expect(loadInline).toHaveBeenCalledTimes(1);
    const updated = await store.get(created.id);
    expect(updated?.content).toContain('v2');
  });

  it('performs rollback on failure', async () => {
    const store = new InMemoryPolicyStore();
    const created = await store.create({ name: 'p1', content: 'version: v1' });

    const loadInline = vi.fn().mockImplementationOnce(() => {
      throw new Error('apply failed');
    });
    const engine = new HotReloadEngine(store, { loadInline });

    const result = await engine.reload(created.id, 'version: v2', created.revision);

    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(true);
    const restored = await store.get(created.id);
    expect(restored?.content).toContain('v1');
  });

  it('records audit events for success/failure/escalation', async () => {
    const store = new InMemoryPolicyStore();
    const created = await store.create({ name: 'p1', content: 'version: v1' });

    const loadInline = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => {
        throw new Error('always fail');
      });
    const addEvent = vi.fn();
    const engine = new HotReloadEngine(store, { loadInline }, { addEvent });

    const success = await engine.reload(created.id, 'version: v2', created.revision);
    expect(success.success).toBe(true);

    let revision = (await store.get(created.id))?.revision ?? created.revision;
    await engine.reload(created.id, 'version: v3', revision);
    revision = (await store.get(created.id))?.revision ?? revision;
    await engine.reload(created.id, 'version: v4', revision);
    revision = (await store.get(created.id))?.revision ?? revision;
    await engine.reload(created.id, 'version: v5', revision);

    const eventTypes = addEvent.mock.calls.map((call) => call[0]?.data?.eventType);
    expect(eventTypes).toContain('policy_reload_success');
    expect(eventTypes).toContain('policy_reload_failed');
    expect(eventTypes).toContain('policy_reload_escalated');
  });

  it('triggers escalation after 3 consecutive failures', async () => {
    const store = new InMemoryPolicyStore();
    const created = await store.create({ name: 'p1', content: 'version: v1' });

    const loadInline = vi.fn(() => {
      throw new Error('always fail');
    });
    const engine = new HotReloadEngine(store, { loadInline });

    let revision = created.revision;
    for (let i = 0; i < 3; i += 1) {
      const result = await engine.reload(created.id, `version: v${i + 2}`, revision);
      const current = await store.get(created.id);
      revision = current?.revision ?? revision;
      if (i < 2) {
        expect(result.error).toContain('DASH_8004');
      } else {
        expect(result.error).toContain('DASH_8005');
      }
    }

    const blocked = await engine.reload(created.id, 'version: v9', revision);
    expect(blocked.error).toContain('DASH_8005');
  });
});
