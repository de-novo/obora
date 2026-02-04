/**
 * CLI Error class for proper error handling
 * @module @obora/cli/errors
 */

/**
 * CLI Error that includes exit code information
 * This allows commands to throw errors that are caught at the top level
 * and converted to appropriate process.exit() calls.
 */
export class CLIError extends Error {
  /**
   * Exit code to use when this error is caught
   * Default is 1 (general error)
   */
  public readonly exitCode: number;

  constructor(message: string, exitCode: number = 1) {
    super(message);
    this.name = "CLIError";
    this.exitCode = exitCode;
  }
}
