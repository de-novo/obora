// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExecutionList } from '../ExecutionList';
import type { ExecutionSummary } from '../../store/execution-store';

afterEach(() => {
  cleanup();
});

const executions: ExecutionSummary[] = [
  {
    executionId: 'exec-active',
    isActive: true,
    stepCount: 2,
    lastEventAt: '2026-05-05T01:00:00.000Z',
  },
  {
    executionId: 'exec-complete',
    isActive: false,
    stepCount: 5,
    lastEventAt: '2026-05-05T01:05:00.000Z',
  },
];

describe('ExecutionList', () => {
  it('renders the empty state when no executions exist', () => {
    render(<ExecutionList executions={[]} onSelectExecution={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '활성 실행' })).toBeTruthy();
    expect(screen.getByText('실행 데이터가 없습니다.')).toBeTruthy();
  });

  it('renders active and completed execution summaries', () => {
    render(
      <ExecutionList
        executions={executions}
        selectedExecutionId="exec-complete"
        onSelectExecution={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /exec-active/i }).textContent).toContain('진행 중 · step 2');
    expect(screen.getByRole('button', { name: /exec-complete/i }).textContent).toContain('종료 · step 5');
  });

  it('selects an execution by id', async () => {
    const user = userEvent.setup();
    const onSelectExecution = vi.fn();

    render(<ExecutionList executions={executions} onSelectExecution={onSelectExecution} />);

    await user.click(screen.getByRole('button', { name: /exec-complete/i }));

    expect(onSelectExecution).toHaveBeenCalledOnce();
    expect(onSelectExecution).toHaveBeenCalledWith('exec-complete');
  });
});
