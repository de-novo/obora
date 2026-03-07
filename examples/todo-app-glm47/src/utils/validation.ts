/**
 * Input validation utilities for TODO Application
 * 
 * Based on: docs/10-architecture.md (Section 9.2)
 * - Trim whitespace
 * - Check minimum length (1+ character)
 * - Check maximum length (1000 characters)
 */

const MAX_TODO_LENGTH = 1000;
const MIN_TODO_LENGTH = 1;

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validate todo text input
 */
export const validateTodoText = (text: string): ValidationResult => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: '태스크 내용을 입력해주세요.',
    };
  }

  if (trimmed.length > MAX_TODO_LENGTH) {
    return {
      isValid: false,
      error: `최대 ${MAX_TODO_LENGTH}자까지 입력 가능합니다. ${trimmed.length - MAX_TODO_LENGTH}자를 삭제해주세요.`,
    };
  }

  return { isValid: true, error: null };
};

/**
 * Get remaining character count
 */
export const getRemainingChars = (text: string): number => {
  return MAX_TODO_LENGTH - text.trim().length;
};

/**
 * Check if text length is valid (without trimming)
 */
export const isLengthValid = (text: string): boolean => {
  return text.trim().length >= MIN_TODO_LENGTH && text.trim().length <= MAX_TODO_LENGTH;
};

/**
 * Sanitize text to prevent XSS
 */
export const sanitizeText = (text: string): string => {
  // Basic sanitization - in production consider using DOMPurify
  return text.replace(/[<>]/g, '');
};
