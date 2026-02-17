import { randomUUID } from 'node:crypto';

import type { PolicyDocument } from '../types.js';

export interface PolicyStore {
  list(): Promise<PolicyDocument[]>;
  get(policyId: string): Promise<PolicyDocument | null>;
  create(input: { name: string; content: string }): Promise<PolicyDocument>;
  update(
    policyId: string,
    input: { name?: string; content: string; revision: string },
  ): Promise<PolicyDocument | null | 'revision_conflict'>;
  delete(policyId: string): Promise<boolean>;
}

const cloneDocument = (document: PolicyDocument): PolicyDocument => ({ ...document });

export class InMemoryPolicyStore implements PolicyStore {
  private readonly documents = new Map<string, PolicyDocument>();

  async list(): Promise<PolicyDocument[]> {
    return [...this.documents.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneDocument);
  }

  async get(policyId: string): Promise<PolicyDocument | null> {
    const document = this.documents.get(policyId);
    return document ? cloneDocument(document) : null;
  }

  async create(input: { name: string; content: string }): Promise<PolicyDocument> {
    const timestamp = new Date().toISOString();
    const document: PolicyDocument = {
      id: randomUUID(),
      name: input.name,
      content: input.content,
      revision: '1',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.documents.set(document.id, document);
    return cloneDocument(document);
  }

  async update(
    policyId: string,
    input: { name?: string; content: string; revision: string },
  ): Promise<PolicyDocument | null | 'revision_conflict'> {
    const current = this.documents.get(policyId);
    if (!current) {
      return null;
    }

    if (current.revision !== input.revision) {
      return 'revision_conflict';
    }

    const nextRevision = (Number.parseInt(current.revision, 10) + 1).toString();
    const updated: PolicyDocument = {
      ...current,
      name: input.name ?? current.name,
      content: input.content,
      revision: nextRevision,
      updatedAt: new Date().toISOString(),
    };

    this.documents.set(policyId, updated);
    return cloneDocument(updated);
  }

  async delete(policyId: string): Promise<boolean> {
    return this.documents.delete(policyId);
  }
}
