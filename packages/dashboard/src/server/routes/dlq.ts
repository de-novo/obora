import type { FastifyInstance } from 'fastify';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface DLQEntry {
  id: string;
  createdAt: string;
  executionId: string;
  workflowName: string;
  stepName?: string;
  errorCode: string;
  errorMessage: string;
  errorStack?: string;
  repairAttempts: number;
  status: 'pending' | 'reviewed' | 'retried' | 'dismissed';
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
}

interface DLQSnapshot {
  entries: DLQEntry[];
  lastUpdated: string;
}

async function loadDLQ(filePath: string): Promise<DLQSnapshot> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as DLQSnapshot;
  } catch {
    return { entries: [], lastUpdated: new Date().toISOString() };
  }
}

async function saveDLQ(filePath: string, snapshot: DLQSnapshot): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export const registerDLQRoutes = (
  app: FastifyInstance,
  apiBasePath: string,
  options: { dlqFilePath?: string } = {},
): void => {
  const dlqPath = options.dlqFilePath ?? '.obora/dlq/dead-letters.json';

  // List all DLQ entries
  app.get(`${apiBasePath}/dlq`, async (request) => {
    const { status, limit, offset } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const snapshot = await loadDLQ(dlqPath);
    const filteredEntries = status
      ? snapshot.entries.filter((e) => e.status === status)
      : snapshot.entries;

    const total = filteredEntries.length;
    const limitNum = parseInt(limit ?? '50', 10);
    const offsetNum = parseInt(offset ?? '0', 10);

    const entries = filteredEntries
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offsetNum, offsetNum + limitNum);

    return {
      entries,
      total,
      limit: limitNum,
      offset: offsetNum,
      pending: snapshot.entries.filter((e) => e.status === 'pending').length,
    };
  });

  // Get single DLQ entry
  app.get(`${apiBasePath}/dlq/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const snapshot = await loadDLQ(dlqPath);
    const entry = snapshot.entries.find((e) => e.id === id);

    if (!entry) {
      return reply.status(404).send({ error: 'DLQ entry not found' });
    }

    return entry;
  });

  // Resolve a DLQ entry
  app.post(`${apiBasePath}/dlq/:id/resolve`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      status: 'reviewed' | 'retried' | 'dismissed';
      actor?: string;
      note?: string;
    };

    if (!body.status || !['reviewed', 'retried', 'dismissed'].includes(body.status)) {
      return reply.status(400).send({ error: 'Invalid status. Must be: reviewed, retried, or dismissed' });
    }

    const snapshot = await loadDLQ(dlqPath);
    const entryIndex = snapshot.entries.findIndex((e) => e.id === id);

    if (entryIndex === -1) {
      return reply.status(404).send({ error: 'DLQ entry not found' });
    }

    snapshot.entries[entryIndex] = {
      ...snapshot.entries[entryIndex]!,
      status: body.status,
      resolvedAt: new Date().toISOString(),
      resolvedBy: body.actor,
      resolution: body.note,
    };
    snapshot.lastUpdated = new Date().toISOString();

    await saveDLQ(dlqPath, snapshot);

    return snapshot.entries[entryIndex];
  });

  // Get DLQ summary/stats
  app.get(`${apiBasePath}/dlq/summary`, async () => {
    const snapshot = await loadDLQ(dlqPath);
    const entries = snapshot.entries;
    const pending = entries.filter((e) => e.status === 'pending');

    return {
      totalEntries: entries.length,
      pendingCount: pending.length,
      reviewedCount: entries.filter((e) => e.status === 'reviewed').length,
      retriedCount: entries.filter((e) => e.status === 'retried').length,
      dismissedCount: entries.filter((e) => e.status === 'dismissed').length,
      oldestPendingAt: pending.length > 0
        ? pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt
        : null,
      lastUpdated: snapshot.lastUpdated,
    };
  });
};
