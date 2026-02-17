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

type HotReloadAuditEventType =
  | 'policy.reload.success'
  | 'policy.reload.failed'
  | 'policy.reload.rollback'
  | 'policy.reload.escalation';

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

    const parsedNext = parsePolicyYaml(content);
    if (!parsedNext.policySet) {
      return this.handleFailure(policyId, `${DASH_8004}: ${parsedNext.errors[0] ?? 'Invalid YAML'}`, false);
    }

    const parsedCurrent = parsePolicyYaml(current.content);

    try {
      this.policyEngine?.loadInline(parsedNext.policySet, `dashboard-policy:${policyId}`);
    } catch (error) {
      return this.handleFailure(policyId, `${DASH_8004}: ${asError(error)}`, false);
    }

    const updated = await this.policyStore.update(policyId, {
      name: current.name,
      content,
      revision,
    });

    if (updated === null) {
      const rollbackPerformed = await this.rollbackRuntimePolicy(policyId, parsedCurrent.policySet);
      return this.handleFailure(policyId, 'Policy not found', rollbackPerformed);
    }

    if (updated === 'revision_conflict') {
      const rollbackPerformed = await this.rollbackRuntimePolicy(policyId, parsedCurrent.policySet);
      return this.handleFailure(policyId, 'Revision conflict', rollbackPerformed);
    }

    this.failureCountByPolicy.set(policyId, 0);
    this.appendAuditEvent(policyId, 'policy.reload.success', {
      policyId,
      revision: updated.revision,
    });
    return { success: true, rollbackPerformed: false };
  }

  private async rollbackRuntimePolicy(policyId: string, previousPolicySet: unknown): Promise<boolean> {
    if (!previousPolicySet) {
      return false;
    }

    try {
      this.policyEngine?.loadInline(previousPolicySet, `dashboard-policy:${policyId}:rollback`);
      this.appendAuditEvent(policyId, 'policy.reload.rollback', {
        policyId,
      });
      return true;
    } catch {
      return false;
    }
  }

  private handleFailure(policyId: string, errorMessage: string, rollbackPerformed: boolean): HotReloadResult {
    const failures = (this.failureCountByPolicy.get(policyId) ?? 0) + 1;
    this.failureCountByPolicy.set(policyId, failures);

    this.appendAuditEvent(policyId, 'policy.reload.failed', {
      policyId,
      error: errorMessage,
      rollbackPerformed,
      failures,
    });

    if (failures >= 3) {
      this.escalatedPolicies.add(policyId);
      this.appendAuditEvent(policyId, 'policy.reload.escalation', {
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

  private appendAuditEvent(policyId: string, type: HotReloadAuditEventType, data: unknown): void {
    if (!this.auditTrail) {
      return;
    }

    this.auditTrail.addEvent({
      id: randomUUID(),
      executionId: `policy:${policyId}`,
      timestamp: new Date(),
      type: type as AuditEvent['type'],
      data: (typeof data === 'object' && data !== null ? data : { data }) as Record<string, unknown>,
    });
  }
}
