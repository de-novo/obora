import { randomUUID } from 'node:crypto';

import type { AuditEvent } from '@obora-kit/runtime';

import type { PolicyStore } from './policy-store.js';
import { parsePolicyYaml } from './policy-validator.js';

export interface HotReloadResult {
  success: boolean;
  error?: string;
  rollbackPerformed?: boolean;
}

export interface HotReloadEngineAdapter {
  loadInline(policySet: unknown, source?: string): unknown;
}

export interface HotReloadAuditTrail {
  addEvent(event: AuditEvent): void;
}

const DASH_8004 = 'DASH_8004';
const DASH_8005 = 'DASH_8005';

const asError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class HotReloadEngine {
  private readonly failureCountByPolicy = new Map<string, number>();

  private readonly escalatedPolicies = new Set<string>();

  constructor(
    private readonly policyStore: PolicyStore,
    private readonly policyEngine?: HotReloadEngineAdapter,
    private readonly auditTrail?: HotReloadAuditTrail,
  ) {}

  async reload(policyId: string, content: string, revision: string): Promise<HotReloadResult> {
    if (this.escalatedPolicies.has(policyId)) {
      return { success: false, error: `${DASH_8005}: Escalation triggered (3 consecutive failures)` };
    }

    const current = await this.policyStore.get(policyId);
    if (!current) {
      return { success: false, error: 'Policy not found' };
    }

    const parsed = parsePolicyYaml(content);
    if (!parsed.policySet) {
      return this.handleFailure(policyId, `${DASH_8004}: ${parsed.errors[0] ?? 'Invalid YAML'}`, current, false);
    }

    const updated = await this.policyStore.update(policyId, {
      name: current.name,
      content,
      revision,
    });

    if (updated === null) {
      return { success: false, error: 'Policy not found' };
    }

    if (updated === 'revision_conflict') {
      return { success: false, error: 'Revision conflict' };
    }

    try {
      this.policyEngine?.loadInline(parsed.policySet, `dashboard-policy:${policyId}`);
      this.failureCountByPolicy.set(policyId, 0);
      this.appendAuditEvent(policyId, 'policy_reload_success', {
        policyId,
        revision: updated.revision,
      });
      return { success: true, rollbackPerformed: false };
    } catch (error) {
      const failed = await this.handleFailure(policyId, `${DASH_8004}: ${asError(error)}`, current, true, updated.revision);
      return failed;
    }
  }

  private async handleFailure(
    policyId: string,
    errorMessage: string,
    previousPolicy: { name: string; content: string; revision: string },
    shouldRollback: boolean,
    failedRevision?: string,
  ): Promise<HotReloadResult> {
    const failures = (this.failureCountByPolicy.get(policyId) ?? 0) + 1;
    this.failureCountByPolicy.set(policyId, failures);

    let rollbackPerformed = false;

    if (shouldRollback) {
      const rollbackUpdate = await this.policyStore.update(policyId, {
        name: previousPolicy.name,
        content: previousPolicy.content,
        revision: failedRevision ?? previousPolicy.revision,
      });

      if (rollbackUpdate && rollbackUpdate !== 'revision_conflict') {
        try {
          const rollbackParsed = parsePolicyYaml(previousPolicy.content);
          if (rollbackParsed.policySet) {
            this.policyEngine?.loadInline(rollbackParsed.policySet, `dashboard-policy:${policyId}:rollback`);
            rollbackPerformed = true;
          }
        } catch {
          rollbackPerformed = false;
        }
      }
    }

    this.appendAuditEvent(policyId, 'policy_reload_failed', {
      policyId,
      error: errorMessage,
      rollbackPerformed,
      failures,
    });

    if (failures >= 3) {
      this.escalatedPolicies.add(policyId);
      this.appendAuditEvent(policyId, 'policy_reload_escalated', {
        policyId,
        errorCode: DASH_8005,
        failures,
      });

      return {
        success: false,
        error: `${DASH_8005}: Escalation triggered (3 consecutive failures)`,
        rollbackPerformed,
      };
    }

    return {
      success: false,
      error: errorMessage,
      rollbackPerformed,
    };
  }

  private appendAuditEvent(policyId: string, type: AuditEvent['type'] | 'error', data: unknown): void {
    if (!this.auditTrail) {
      return;
    }

    this.auditTrail.addEvent({
      id: randomUUID(),
      executionId: `policy:${policyId}`,
      timestamp: new Date(),
      type: 'error',
      data: {
        eventType: type,
        ...((typeof data === 'object' && data !== null ? data : { data }) as Record<string, unknown>),
      },
    });
  }
}
