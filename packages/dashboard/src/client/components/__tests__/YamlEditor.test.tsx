// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { YamlEditor } from '../YamlEditor';
import type { PolicyDocument } from '../../api/policy-client';

const policyClient = vi.hoisted(() => ({
  createPolicy: vi.fn(),
  diffPolicy: vi.fn(),
  reloadPolicy: vi.fn(),
  updatePolicy: vi.fn(),
  validatePolicy: vi.fn(),
}));

vi.mock('../../api/policy-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/policy-client')>();
  return {
    ...actual,
    createPolicy: policyClient.createPolicy,
    diffPolicy: policyClient.diffPolicy,
    reloadPolicy: policyClient.reloadPolicy,
    updatePolicy: policyClient.updatePolicy,
    validatePolicy: policyClient.validatePolicy,
  };
});

const basePolicy: PolicyDocument = {
  id: 'policy-1',
  name: 'Guardrail',
  content: 'allow: true',
  revision: 'rev-1',
  createdAt: '2026-05-05T01:00:00.000Z',
  updatedAt: '2026-05-05T01:05:00.000Z',
};

beforeEach(() => {
  vi.useRealTimers();
  policyClient.createPolicy.mockReset();
  policyClient.diffPolicy.mockReset();
  policyClient.reloadPolicy.mockReset();
  policyClient.updatePolicy.mockReset();
  policyClient.validatePolicy.mockReset();
  policyClient.validatePolicy.mockResolvedValue({ valid: true, errors: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('YamlEditor', () => {
  it('creates a new policy with a default name when content is present', async () => {
    const onSaved = vi.fn();
    const created: PolicyDocument = {
      ...basePolicy,
      id: 'policy-created',
      name: 'untitled-policy',
      content: 'name: generated',
      revision: 'rev-created',
    };
    policyClient.createPolicy.mockResolvedValue(created);

    render(<YamlEditor onSaved={onSaved} />);

    fireEvent.change(screen.getByPlaceholderText('YAML 정책을 입력하세요'), {
      target: { value: 'name: generated' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created, 'create'));
    expect(policyClient.createPolicy).toHaveBeenCalledWith({
      name: 'untitled-policy',
      content: 'name: generated',
    });
  });

  it('debounces validation and renders validation errors', async () => {
    vi.useFakeTimers();
    policyClient.validatePolicy.mockResolvedValue({ valid: false, errors: ['invalid yaml'] });

    render(<YamlEditor onSaved={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('YAML 정책을 입력하세요'), {
      target: { value: 'invalid: [' },
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(policyClient.validatePolicy).toHaveBeenCalledWith('invalid: [');
    expect(screen.getByText('유효하지 않은 정책입니다.')).toBeTruthy();
    expect(screen.getByText('invalid yaml')).toBeTruthy();
  });

  it('previews diffs and applies hot reload for existing policies', async () => {
    const onSaved = vi.fn();
    const updated: PolicyDocument = {
      ...basePolicy,
      content: 'allow: false',
      revision: 'rev-2',
    };
    policyClient.diffPolicy.mockResolvedValue({
      currentRevision: 'rev-1',
      diff: {
        summary: '1 change',
        changes: [{ path: 'allow', type: 'modified', oldValue: true, newValue: false }],
      },
    });
    policyClient.reloadPolicy.mockResolvedValue({
      success: true,
      policy: updated,
    });

    render(<YamlEditor policy={basePolicy} onSaved={onSaved} />);

    fireEvent.change(screen.getByPlaceholderText('YAML 정책을 입력하세요'), {
      target: { value: 'allow: false' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview Changes' }));

    expect(await screen.findByText('1 change')).toBeTruthy();
    expect(policyClient.diffPolicy).toHaveBeenCalledWith('policy-1', 'allow: false');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated, 'update'));
    expect(policyClient.reloadPolicy).toHaveBeenCalledWith('policy-1', {
      content: 'allow: false',
      revision: 'rev-1',
    });
    expect(screen.getByText('현재 revision: rev-2')).toBeTruthy();
  });
});
