import type { ReactElement } from "react";

import type { ExecutionStepTrace } from "./ops-model";

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
  readonly trace: ExecutionStepTrace;
}

export const TraceSummary = ({ trace }: TraceSummaryProps): ReactElement => (
  <details className="trace-detail">
    <summary>Trace</summary>
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
  </details>
);
