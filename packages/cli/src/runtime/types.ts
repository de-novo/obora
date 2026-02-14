export interface StepErrorMetadata {
  code: string;
  message: string;
  provider?: string;
  statusCode?: number;
  attempts?: number;
  lastError?: string;
}
