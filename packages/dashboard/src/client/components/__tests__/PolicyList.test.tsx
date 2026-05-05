// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PolicyList } from '../PolicyList';
import type { PolicyDocument } from '../../api/policy-client';

const policies: PolicyDocument[] = [
  {
    id: 'policy-alpha',
    name: 'Alpha policy',
    content: 'name: alpha',
    revision: 'r1',
    createdAt: '2026-05-05T01:00:00.000Z',
    updatedAt: '2026-05-05T01:05:00.000Z',
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PolicyList', () => {
  it('renders loading and empty states', () => {
    const callbacks = {
      onSelectPolicy: vi.fn(),
      onCreatePolicy: vi.fn(),
      onDeletePolicy: vi.fn(),
    };

    const { rerender } = render(<PolicyList policies={[]} isLoading={true} {...callbacks} />);

    expect(screen.getByText('정책 목록 로딩 중...')).toBeTruthy();

    rerender(<PolicyList policies={[]} isLoading={false} {...callbacks} />);

    expect(screen.getByText('정책이 없습니다.')).toBeTruthy();
  });

  it('creates and selects policies from the list', async () => {
    const user = userEvent.setup();
    const onCreatePolicy = vi.fn();
    const onSelectPolicy = vi.fn();

    render(
      <PolicyList
        policies={policies}
        selectedPolicyId="policy-alpha"
        onCreatePolicy={onCreatePolicy}
        onSelectPolicy={onSelectPolicy}
        onDeletePolicy={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '+ 새 정책' }));
    await user.click(screen.getByRole('button', { name: /Alpha policy/i }));

    expect(screen.getByText('rev r1')).toBeTruthy();
    expect(onCreatePolicy).toHaveBeenCalledOnce();
    expect(onSelectPolicy).toHaveBeenCalledWith('policy-alpha');
  });

  it('requires confirmation before deleting a policy', async () => {
    const user = userEvent.setup();
    const onDeletePolicy = vi.fn();
    const confirm = vi.spyOn(window, 'confirm');

    render(
      <PolicyList
        policies={policies}
        onCreatePolicy={vi.fn()}
        onSelectPolicy={vi.fn()}
        onDeletePolicy={onDeletePolicy}
      />,
    );

    confirm.mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(onDeletePolicy).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(onDeletePolicy).toHaveBeenCalledOnce();
    expect(onDeletePolicy).toHaveBeenCalledWith(policies[0]);
  });
});
