import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { getBlackboardDiffPaths, type ExecutionStep, type StepDetailData } from '../store/execution-store';
import { BlackboardSnapshot } from './BlackboardSnapshot';

interface StepDetailProps {
  executionId?: string;
  step?: ExecutionStep;
  detail?: StepDetailData;
  previousBlackboard?: unknown;
}

type SectionKey = 'input' | 'output' | 'policy' | 'error' | 'blackboard';

const formatStructured = (value: unknown): string => {
  if (value === undefined) {
    return '데이터 없음';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const StepDetail = ({ executionId, step, detail, previousBlackboard }: StepDetailProps): ReactElement => {
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    input: false,
    output: false,
    policy: false,
    error: false,
    blackboard: false,
  });

  const blackboardDiffSet = useMemo(
    () => new Set(getBlackboardDiffPaths(previousBlackboard, detail?.blackboard)),
    [detail?.blackboard, previousBlackboard],
  );

  const toggle = (key: SectionKey): void => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!executionId || !step) {
    return <p style={{ margin: 0, color: '#6b7280' }}>Timeline에서 step을 선택하세요.</p>;
  }

  const sectionStyle = {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    marginBottom: '10px',
    backgroundColor: '#fff',
  } as const;

  const sectionHeaderStyle = {
    width: '100%',
    textAlign: 'left' as const,
    border: 0,
    background: 'transparent',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  };

  return (
    <section>
      <h2 style={{ marginTop: 0, marginBottom: '10px' }}>
        Step Detail · {executionId} / {step.stepName}
      </h2>

      <div style={sectionStyle}>
        <button type="button" style={sectionHeaderStyle} onClick={() => toggle('input')}>
          Input {collapsed.input ? '▸' : '▾'}
        </button>
        {!collapsed.input ? <pre style={{ margin: 0, padding: '0 12px 12px' }}>{formatStructured(detail?.input)}</pre> : null}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionHeaderStyle} onClick={() => toggle('output')}>
          Output {collapsed.output ? '▸' : '▾'}
        </button>
        {!collapsed.output ? <pre style={{ margin: 0, padding: '0 12px 12px' }}>{formatStructured(detail?.output)}</pre> : null}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionHeaderStyle} onClick={() => toggle('policy')}>
          Policy {collapsed.policy ? '▸' : '▾'}
        </button>
        {!collapsed.policy ? <pre style={{ margin: 0, padding: '0 12px 12px' }}>{formatStructured(detail?.policy)}</pre> : null}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionHeaderStyle} onClick={() => toggle('error')}>
          Error {collapsed.error ? '▸' : '▾'}
        </button>
        {!collapsed.error ? (
          <div style={{ padding: '0 12px 12px' }}>
            {detail?.error ? (
              <>
                <div style={{ color: '#dc2626', fontWeight: 700 }}>{detail.error.code ?? 'UNKNOWN_ERROR'}</div>
                <div style={{ color: '#7f1d1d', marginTop: '4px' }}>{detail.error.message ?? '메시지 없음'}</div>
                {detail.error.stack ? (
                  <pre style={{ marginTop: '8px', background: '#fef2f2', padding: '10px', overflowX: 'auto' }}>
                    {detail.error.stack}
                  </pre>
                ) : null}
              </>
            ) : (
              <p style={{ margin: 0, color: '#6b7280' }}>에러 정보가 없습니다.</p>
            )}
          </div>
        ) : null}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionHeaderStyle} onClick={() => toggle('blackboard')}>
          Blackboard Snapshot {collapsed.blackboard ? '▸' : '▾'}
        </button>
        {!collapsed.blackboard ? (
          <div style={{ padding: '0 12px 12px' }}>
            <BlackboardSnapshot value={detail?.blackboard} changedPaths={blackboardDiffSet} />
          </div>
        ) : null}
      </div>
    </section>
  );
};
