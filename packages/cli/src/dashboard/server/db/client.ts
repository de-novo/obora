import Database from "better-sqlite3";
import { join } from "pathe";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { consola } from "consola";

/**
 * Find git root directory
 */
function findGitRoot(): string | null {
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return gitRoot;
  } catch {
    return null;
  }
}

/**
 * Find database path by checking multiple locations
 */
function findDbPath(): string {
  const possiblePaths = [
    // Git root .claude/logs/
    findGitRoot() ? join(findGitRoot()!, ".claude", "logs", "agents.db") : null,
    // Current working directory
    join(process.cwd(), ".claude", "logs", "agents.db"),
    // Home directory
    join(process.env.HOME || "~", ".claude", "logs", "agents.db"),
  ].filter((p): p is string => p !== null);

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Default to git root or cwd
  return possiblePaths[0] || join(process.cwd(), ".claude", "logs", "agents.db");
}

/**
 * SQLite Database Client
 * Singleton wrapper for better-sqlite3 with read-only mode
 */
class AgentDbClient {
  private static instance: AgentDbClient | null = null;
  private db: Database.Database | null = null;
  private dbPath: string;

  private constructor(customPath?: string) {
    this.dbPath = customPath || findDbPath();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(customPath?: string): AgentDbClient {
    if (!AgentDbClient.instance) {
      AgentDbClient.instance = new AgentDbClient(customPath);
    }
    return AgentDbClient.instance;
  }

  /**
   * Reset instance (for testing or path change)
   */
  public static resetInstance(): void {
    if (AgentDbClient.instance) {
      AgentDbClient.instance.close();
      AgentDbClient.instance = null;
    }
  }

  /**
   * Get database connection
   * Opens DB in read-only mode by default
   */
  public getConnection(options: { readonly?: boolean } = { readonly: true }): Database.Database | null {
    // If requesting writable connection but we have readonly, close and reopen
    if (this.db && options.readonly === false) {
      // Need writable but have readonly - return null (can't upgrade)
      // For migrations, use getWritableConnection instead
      return null;
    }

    if (this.db) {
      return this.db;
    }

    if (!existsSync(this.dbPath)) {
      consola.warn(`Database not found at ${this.dbPath}`);
      return null;
    }

    try {
      this.db = new Database(this.dbPath, {
        readonly: options.readonly !== false,
        fileMustExist: true,
      });

      consola.success(`Connected to agent database: ${this.dbPath}`);
      return this.db;
    } catch (error) {
      consola.error("Failed to connect to agent database:", error);
      return null;
    }
  }

  /**
   * Get writable database connection for migrations
   * Creates a separate connection that allows writes
   */
  public getWritableConnection(): Database.Database | null {
    if (!existsSync(this.dbPath)) {
      consola.warn(`Database not found at ${this.dbPath}`);
      return null;
    }

    try {
      // Create a new writable connection (separate from the readonly singleton)
      const writableDb = new Database(this.dbPath, {
        readonly: false,
        fileMustExist: true,
      });

      consola.success(`Writable connection established: ${this.dbPath}`);
      return writableDb;
    } catch (error) {
      consola.error("Failed to open writable database connection:", error);
      return null;
    }
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      consola.info("Database connection closed");
    }
  }

  /**
   * Check if database exists and is accessible
   */
  public isAvailable(): boolean {
    return existsSync(this.dbPath);
  }

  /**
   * Get database path
   */
  public getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Set custom database path
   */
  public setDbPath(path: string): void {
    this.close();
    this.dbPath = path;
  }
}

// Export singleton instance getter
export const getAgentDb = (customPath?: string): AgentDbClient =>
  AgentDbClient.getInstance(customPath);

export const resetAgentDb = (): void => AgentDbClient.resetInstance();

export type { Database };
