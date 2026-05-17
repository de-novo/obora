export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
  id: string;
  executionId: string;
  timestamp: string;
  type: string;
  stepName?: string;
  severity?: AuditSeverity;
  summary?: string;
  payload?: unknown;
  metadata?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
    costUsd?: number;
  };
}

export interface AuditQueryParams {
  from?: string;
  to?: string;
  eventTypes?: string[];
  stepName?: string;
  executionId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
  limit?: number;
  offset?: number;
}

interface AuditEventApiResponse {
  id: string;
  executionId: string;
  timestamp: string | Date;
  type: string;
  data?: unknown;
  metadata?: AuditEvent['metadata'];
}

interface AuditQueryApiResponse {
  events: AuditEventApiResponse[];
  total: number;
  hasMore: boolean;
  limit?: number;
  offset?: number;
}

interface AuditEventDetailApiResponse {
  event: AuditEventApiResponse;
}

export class AuditClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly causeError?: unknown,
  ) {
    super(message);
    this.name = 'AuditClientError';
  }
}

const resolveApiBase = (): string => {
  const configured = import.meta.env.VITE_DASHBOARD_API_BASE;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.replace(/\/$/, '');
  }

  return '/api';
};

const API_BASE = resolveApiBase();

const toIsoString = (value: string | Date): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
};

const getStepNameFromData = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const stepName = record.stepName;
  return typeof stepName === 'string' && stepName.length > 0 ? stepName : undefined;
};

const inferSeverity = (type: string): AuditSeverity => {
  if (type === 'policy_deny') {
    return 'warning';
  }

  if (type === 'error' || type.startsWith('recovery_')) {
    return 'critical';
  }

  return 'info';
};

const buildSummary = (raw: AuditEventApiResponse): string => {
  const stepName = getStepNameFromData(raw.data);
  if (stepName) {
    return `${raw.type} · ${stepName}`;
  }

  if (raw.data && typeof raw.data === 'object') {
    const keys = Object.keys(raw.data as Record<string, unknown>);
    if (keys.length > 0) {
      return `${raw.type} · ${keys.slice(0, 2).join(', ')}`;
    }
  }

  return raw.type;
};

const mapEvent = (raw: AuditEventApiResponse): AuditEvent => {
  const stepName = getStepNameFromData(raw.data);

  return {
    id: raw.id,
    executionId: raw.executionId,
    timestamp: toIsoString(raw.timestamp),
    type: raw.type,
    stepName,
    severity: inferSeverity(raw.type),
    summary: buildSummary(raw),
    payload: raw.data,
    metadata: raw.metadata,
  };
};

const serializeAuditQueryParams = (params: AuditQueryParams): string => {
  const query = new URLSearchParams();

  if (params.from) {
    query.set('fromTime', params.from);
  }

  if (params.to) {
    query.set('toTime', params.to);
  }

  params.eventTypes?.forEach((eventType) => {
    if (eventType.trim().length > 0) {
      query.append('eventType', eventType);
    }
  });

  if (params.stepName) {
    query.set('stepName', params.stepName);
  }

  if (params.executionId) {
    query.set('executionId', params.executionId);
  }

  if (typeof params.limit === 'number') {
    query.set('limit', String(params.limit));
  }

  if (typeof params.offset === 'number') {
    query.set('offset', String(params.offset));
  }

  return query.toString();
};

const parseApiError = async (response: Response): Promise<never> => {
  const payload = await response.json().catch(() => undefined) as unknown;

  const errorCode =
    payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string'
      ? payload.code
      : 'DASH_AUDIT_QUERY_FAILED';

  const message =
    payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : `Audit API request failed with status ${response.status}`;

  throw new AuditClientError(message, errorCode, response.status);
};

const requestJson = async <T>(path: string): Promise<T> => {
  try {
    const response = await fetch(`${API_BASE}${path}`);

    if (!response.ok) {
      await parseApiError(response);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuditClientError) {
      throw error;
    }

    throw new AuditClientError('Network error while requesting audit API', 'DASH_AUDIT_NETWORK_ERROR', undefined, error);
  }
};

export const fetchAuditEvents = async (params: AuditQueryParams = {}): Promise<AuditQueryResult> => {
  const query = serializeAuditQueryParams(params);
  const response = await requestJson<AuditQueryApiResponse>(`/audit/events${query ? `?${query}` : ''}`);

  return {
    ...response,
    events: response.events.map(mapEvent),
  };
};

export const fetchAuditEvent = async (eventId: string): Promise<AuditEvent> => {
  const response = await requestJson<AuditEventDetailApiResponse>(`/audit/events/${encodeURIComponent(eventId)}`);
  return mapEvent(response.event);
};

export const fetchExecutionEvents = async (
  executionId: string,
  params: Omit<AuditQueryParams, 'executionId'> = {},
): Promise<AuditQueryResult> => {
  const query = serializeAuditQueryParams(params);
  const response = await requestJson<AuditQueryApiResponse>(
    `/audit/executions/${encodeURIComponent(executionId)}/events${query ? `?${query}` : ''}`,
  );

  return {
    ...response,
    events: response.events.map(mapEvent),
  };
};

export const __private__ = {
  serializeAuditQueryParams,
  mapEvent,
};
