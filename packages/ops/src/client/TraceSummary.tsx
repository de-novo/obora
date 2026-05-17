import type { ReactElement } from "react";

import { traceSeverityLabels, type ExecutionStepTrace, type TraceSeverity } from "./ops-model";

interface TraceListProps {
  readonly label: string;
  readonly items: ReadonlyArray<string>;
}

const TraceList = ({ items, label }: TraceListProps): ReactElement | null =>
  items.length === 0 ? null : (
    <div className="trace-list">
      <dt>{label}</dt>
      <dd>
        <ul>
          {items.map((item, index) => (
            <li key={`${label}-${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </dd>
    </div>
  );

interface TraceSummaryProps {
  readonly exportFilename: string;
  readonly onCopyRawTrace: (rawTrace: string) => void;
  readonly rawTrace: string;
  readonly severity: TraceSeverity;
  readonly trace: ExecutionStepTrace;
}

export const TraceSummary = ({
  exportFilename,
  onCopyRawTrace,
  rawTrace,
  severity,
  trace,
}: TraceSummaryProps): ReactElement => (
  <details className="trace-detail">
    <summary>
      <span>Trace</span>
      <span className={["trace-severity", `trace-severity-${severity}`].join(" ")}>
        {traceSeverityLabels[severity]}
      </span>
    </summary>
    <dl className="trace-fields">
      <div>
        <dt>Task</dt>
        <dd>{trace.task_summary}</dd>
      </div>
      <div>
        <dt>Method</dt>
        <dd>{trace.methodology}</dd>
      </div>
      <div>
        <dt>Confidence</dt>
        <dd>
          <span className={["trace-confidence", `confidence-${trace.confidence_level}`].join(" ")}>
            {trace.confidence_level}
          </span>
        </dd>
      </div>
      <TraceList label="Decisions" items={trace.key_decisions} />
      <TraceList label="Assumptions" items={trace.assumptions} />
      <TraceList label="Risks" items={trace.risks_identified} />
      <TraceList label="Artifacts" items={trace.artifacts_created} />
      <div>
        <dt>Context</dt>
        <dd>{trace.context_for_successors}</dd>
      </div>
    </dl>
    <div className="trace-actions">
      <button type="button" onClick={() => onCopyRawTrace(rawTrace)}>
        Copy raw
      </button>
      <a
        className="trace-export-link"
        href={`data:application/json;charset=utf-8,${encodeURIComponent(rawTrace)}`}
        download={exportFilename}
      >
        Export raw
      </a>
    </div>
    <details className="trace-raw">
      <summary>Raw</summary>
      <pre>{rawTrace}</pre>
    </details>
  </details>
);
