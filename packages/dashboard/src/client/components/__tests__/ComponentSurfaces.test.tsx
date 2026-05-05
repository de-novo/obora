// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditEventList } from '../AuditEventList';
import { AuditFilter } from '../AuditFilter';
import { BlackboardSnapshot } from '../BlackboardSnapshot';
import { PlaybackTimeline } from '../PlaybackTimeline';
import { PolicyDiff } from '../PolicyDiff';
import { StepDetail } from '../StepDetail';
import { Timeline } from '../Timeline';
import type { AuditEvent } from '../../api/audit-client';
import type { ExecutionStep, StepDetailData } from '../../store/execution-store';

afterEach(() => {
  cleanup();
});

const auditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    executionId: 'exec-1',
    timestamp: '2026-05-05T01:00:00.000Z',
    type: 'step_end',
    stepName: 'plan',
    severity: 'warning',
    summary: 'Finished plan',
    payload: { result: 'ok' },
  },
  {
    id: 'audit-2',
    executionId: 'exec-1',
    timestamp: '2026-05-05T01:01:00.000Z',
    type: 'error',
    severity: 'critical',
    payload: { code: 'E_FAIL' },
  },
];

const steps: ExecutionStep[] = [
  {
    stepName: 'plan',
    status: 'running',
    firstSeenAt: '2026-05-05T01:00:00.000Z',
    lastUpdatedAt: '2026-05-05T01:00:00.000Z',
  },
  {
    stepName: 'execute',
    status: 'completed',
    firstSeenAt: '2026-05-05T01:01:00.000Z',
    lastUpdatedAt: '2026-05-05T01:02:00.000Z',
  },
  {
    stepName: 'review',
    status: 'failed',
    firstSeenAt: '2026-05-05T01:03:00.000Z',
    lastUpdatedAt: '2026-05-05T01:04:00.000Z',
  },
];

describe('AuditEventList', () => {
  it('renders loading and empty states with guarded pagination', () => {
    const callbacks = {
      onPrevPage: vi.fn(),
      onNextPage: vi.fn(),
    };

    const { rerender } = render(
      <AuditEventList events={[]} loading={true} offset={0} limit={10} total={0} {...callbacks} />,
    );

    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect((screen.getByRole('button', { name: '이전' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '다음' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<AuditEventList events={[]} offset={0} limit={10} total={0} {...callbacks} />);

    expect(screen.getByText('조회된 감사 이벤트가 없습니다.')).toBeTruthy();
    expect(screen.getByText('페이지 1 / 1 · 총 0건')).toBeTruthy();
  });

  it('expands event payloads, replays executions, and pages forward', async () => {
    const user = userEvent.setup();
    const onReplayExecution = vi.fn();
    const onNextPage = vi.fn();

    render(
      <AuditEventList
        events={auditEvents}
        offset={10}
        limit={10}
        total={25}
        onPrevPage={vi.fn()}
        onNextPage={onNextPage}
        onReplayExecution={onReplayExecution}
      />,
    );

    await user.click(screen.getByText('Finished plan'));
    expect(screen.getByText(/"result": "ok"/)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Replay' })[0]!);
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(onReplayExecution).toHaveBeenCalledWith('exec-1');
    expect(onNextPage).toHaveBeenCalledOnce();
    expect(screen.getByText('페이지 2 / 3 · 총 25건')).toBeTruthy();
  });
});

describe('AuditFilter', () => {
  it('normalizes form values on submit and reset', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onReset = vi.fn();

    render(
      <AuditFilter
        initialValue={{ eventTypes: ['error'], stepName: ' initial ', executionId: 'exec-old' }}
        onSearch={onSearch}
        onReset={onReset}
      />,
    );

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-05-05T10:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-05-05T11:00' } });
    fireEvent.change(screen.getByLabelText('Step Name'), { target: { value: '  plan  ' } });
    fireEvent.change(screen.getByLabelText('Execution ID'), { target: { value: ' exec-1 ' } });

    const eventTypeSelect = screen.getByLabelText('Event Types') as HTMLSelectElement;
    for (const option of Array.from(eventTypeSelect.options)) {
      option.selected = option.value === 'error' || option.value === 'step_end';
    }
    fireEvent.change(eventTypeSelect);

    await user.click(screen.getByRole('button', { name: '검색' }));
    await user.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(onSearch).toHaveBeenNthCalledWith(1, {
      from: '2026-05-05T10:00',
      to: '2026-05-05T11:00',
      eventTypes: ['step_end', 'error'],
      stepName: 'plan',
      executionId: 'exec-1',
    });
    expect(onReset).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenNthCalledWith(2, {
      from: undefined,
      to: undefined,
      eventTypes: [],
      stepName: '',
      executionId: '',
    });
  });
});

describe('BlackboardSnapshot', () => {
  it('renders no-data, primitive, object, and array snapshots', () => {
    const { rerender } = render(<BlackboardSnapshot value={undefined} changedPaths={new Set()} />);

    expect(screen.getByText('Blackboard 데이터가 없습니다.')).toBeTruthy();

    rerender(<BlackboardSnapshot value="ready" changedPaths={new Set()} />);
    expect(screen.getByText('ready')).toBeTruthy();

    rerender(
      <BlackboardSnapshot
        value={{ context: { count: 2 }, items: ['alpha'] }}
        changedPaths={new Set(['context.count', 'items.0'])}
      />,
    );

    expect(screen.getByText('context')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('[0] alpha')).toBeTruthy();
  });
});

describe('PlaybackTimeline', () => {
  it('renders empty playback state and jumps to event markers', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const { rerender } = render(<PlaybackTimeline events={[]} currentIndex={0} onJump={onJump} />);

    expect(screen.getByText('선택된 execution의 이벤트가 없습니다.')).toBeTruthy();

    rerender(<PlaybackTimeline events={auditEvents} currentIndex={1} onJump={onJump} />);

    await user.click(screen.getByRole('button', { name: /error/i }));

    expect(screen.getByText('Playback Timeline')).toBeTruthy();
    expect(onJump).toHaveBeenCalledWith(1);
  });
});

describe('PolicyDiff', () => {
  it('renders empty and populated diff summaries', () => {
    const { rerender } = render(<PolicyDiff diff={{ summary: 'No changes', changes: [] }} />);

    expect(screen.getByText('No changes')).toBeTruthy();
    expect(screen.getByText('변경 사항이 없습니다.')).toBeTruthy();

    rerender(
      <PolicyDiff
        diff={{
          summary: '3 changes',
          changes: [
            { path: 'rules[0]', type: 'added', newValue: { allow: true } },
            { path: 'rules[1]', type: 'removed', oldValue: { allow: false } },
            { path: 'rules[2]', type: 'modified', oldValue: 'old', newValue: 'new' },
          ],
        }}
      />,
    );

    expect(screen.getByText('[ADDED] rules[0]')).toBeTruthy();
    expect(screen.getByText('[REMOVED] rules[1]')).toBeTruthy();
    expect(screen.getByText('[MODIFIED] rules[2]')).toBeTruthy();
  });
});

describe('Timeline', () => {
  it('renders selection prompts, empty executions, and selectable steps', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    const { rerender } = render(<Timeline steps={[]} />);

    expect(screen.getByText('좌측에서 실행을 선택하세요.')).toBeTruthy();

    rerender(<Timeline executionId="exec-1" steps={[]} />);
    expect(screen.getByText('step 이벤트를 기다리는 중입니다.')).toBeTruthy();

    rerender(<Timeline executionId="exec-1" steps={steps} selectedStepName="execute" onStepClick={onStepClick} />);

    await user.click(screen.getByRole('button', { name: /execute/i }));

    expect(screen.getByRole('heading', { name: 'Timeline · exec-1' })).toBeTruthy();
    expect(screen.getByText(/실행 중/)).toBeTruthy();
    expect(screen.getByText(/완료/)).toBeTruthy();
    expect(screen.getByText(/실패/)).toBeTruthy();
    expect(onStepClick).toHaveBeenCalledWith(steps[1]);
  });
});

describe('StepDetail', () => {
  it('renders empty selection, structured sections, errors, and blackboard diffs', async () => {
    const user = userEvent.setup();
    const detail: StepDetailData = {
      input: { query: 'hello' },
      output: 'done',
      policy: { allow: true },
      error: { code: 'E_FAIL', message: 'failed', stack: 'Error: failed' },
      blackboard: { context: { count: 2 } },
    };
    const { rerender } = render(<StepDetail />);

    expect(screen.getByText('Timeline에서 step을 선택하세요.')).toBeTruthy();

    rerender(
      <StepDetail
        executionId="exec-1"
        step={steps[0]}
        detail={detail}
        previousBlackboard={{ context: { count: 1 } }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Step Detail · exec-1 / plan' })).toBeTruthy();
    expect(screen.getByText(/"query": "hello"/)).toBeTruthy();
    expect(screen.getByText('E_FAIL')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText('count')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Input/ }));
    expect(screen.queryByText(/"query": "hello"/)).toBeNull();
  });
});
