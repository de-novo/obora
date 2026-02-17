export interface PolicyDocument {
  id: string;
  name: string;
  content: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: string[];
}

interface PolicyResponse {
  policy: PolicyDocument;
}

interface PolicyListResponse {
  policies: PolicyDocument[];
}

export class PolicyApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: string[];

  constructor(message: string, status: number, code?: string, details?: string[]) {
    super(message);
    this.name = 'PolicyApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isRevisionConflict(): boolean {
    return this.status === 409;
  }

  get isValidationError(): boolean {
    return this.status === 400;
  }
}

const resolveApiBaseUrl = (): string => {
  const explicit = import.meta.env.VITE_DASHBOARD_API_BASE_URL;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }

  return '/api';
};

const toPolicyApiError = async (response: Response): Promise<PolicyApiError> => {
  let body: ApiErrorBody | undefined;

  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = undefined;
  }

  const message = body?.message ?? `Policy API request failed: ${response.status}`;
  return new PolicyApiError(message, response.status, body?.code, body?.details);
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await toPolicyApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const listPolicies = async (): Promise<PolicyDocument[]> => {
  const response = await request<PolicyListResponse>('/policies', { method: 'GET' });
  return response.policies;
};

export const getPolicy = async (id: string): Promise<PolicyDocument> => {
  const response = await request<PolicyResponse>(`/policies/${encodeURIComponent(id)}`, { method: 'GET' });
  return response.policy;
};

export const createPolicy = async (data: {
  name: string;
  content: string;
}): Promise<PolicyDocument> => {
  const response = await request<PolicyResponse>('/policies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.policy;
};

export const updatePolicy = async (
  id: string,
  data: {
    name?: string;
    content: string;
    revision: string;
  },
): Promise<PolicyDocument> => {
  const response = await request<PolicyResponse>(`/policies/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.policy;
};

export const deletePolicy = async (id: string): Promise<void> => {
  await request<void>(`/policies/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};

export const validatePolicy = async (content: string): Promise<PolicyValidationResult> => {
  try {
    return await request<PolicyValidationResult>('/policies/validate', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  } catch (error) {
    if (error instanceof PolicyApiError && error.isValidationError) {
      return {
        valid: false,
        errors: error.details ?? [error.message],
      };
    }

    throw error;
  }
};
