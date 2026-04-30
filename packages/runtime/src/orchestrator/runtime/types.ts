import type { ErrorCode } from "../workflow/index.js";

export type UserFacingErrorCode =
  | "E4001"
  | "E4002"
  | "E4003"
  | "E4005"
  | "E4006"
  | "E4007"
  | "E4010"
  | "E4012"
  | "E4013"
  | "E4014";

export type InternalDiagCode = "E4011";

export interface StepErrorMetadata {
  code: UserFacingErrorCode;
  message: string;
  provider?: string;
  statusCode?: number;
  attempts?: number;
  lastError?: ErrorCode;
  failedAt?: string;
}
