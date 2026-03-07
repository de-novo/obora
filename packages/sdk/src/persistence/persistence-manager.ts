import type { ArtifactStore, StorageAdapter } from "@obora/runtime";

import { loadConfig, type OboraConfig } from "../config-loader.js";
import { OboraError } from "../runtime-types.js";
import type { ArtifactsConfig, OboraRuntimeConfig } from "../runtime-types.js";

/**
 * PersistenceManager centralises storage-adapter and artifact-store lifecycle:
 *  - lazy initialisation + singleton caching
 *  - delegates to SQLite, custom, or in-memory adapters based on config
 */
export class PersistenceManager {
  private _storageAdapter?: StorageAdapter;
  private _artifactStore?: ArtifactStore;

  constructor(private readonly config: OboraRuntimeConfig) {}

  /**
   * Return the configured StorageAdapter (SQLite or custom).
   * Throws if persistence is not enabled.
   */
  async getStorageAdapter(
    persistenceEnabled?: boolean,
    persistenceConfig?: OboraConfig["persistence"],
  ): Promise<StorageAdapter> {
    if (this._storageAdapter) return this._storageAdapter;

    const enabled = persistenceEnabled ?? this.config.persistence?.enabled ?? false;
    if (!enabled) {
      throw new OboraError("Persistence is not enabled", "SDK_PERSISTENCE_DISABLED");
    }

    const p = persistenceConfig ?? this.config.persistence;
    if (p?.adapter === "custom" && (p.custom as { instance?: StorageAdapter })?.instance) {
      this._storageAdapter = (p.custom as { instance: StorageAdapter }).instance;
    } else if (p?.adapter === "sqlite" && p.sqlite?.path) {
      const { SQLiteStorageAdapter } = await import("@obora/runtime");
      this._storageAdapter = new SQLiteStorageAdapter({ path: p.sqlite.path });
    } else {
      throw new OboraError("Invalid persistence configuration", "SDK_PERSISTENCE_CONFIG_ERROR");
    }

    return this._storageAdapter;
  }

  /**
   * Return an adapter suitable for cost tracking.
   * Falls back to an in-memory adapter when persistence is disabled.
   */
  async getCostTrackingAdapter(): Promise<StorageAdapter> {
    if (this.config.persistence?.enabled) {
      return this.getStorageAdapter();
    }
    const { InMemoryStorageAdapter } = await import("@obora/runtime");
    return new InMemoryStorageAdapter() as StorageAdapter;
  }

  /**
   * Return the configured ArtifactStore, or undefined when artifacts are disabled.
   */
  async getArtifactStore(config?: OboraConfig): Promise<ArtifactStore | undefined> {
    if (this._artifactStore) return this._artifactStore;

    const effectiveConfig =
      config ?? this.config.config ?? (await loadConfig(this.config.configPath));

    const artifactsConfig: ArtifactsConfig = this.config.artifacts ?? {
      enabled: effectiveConfig?.artifacts?.enabled ?? true,
      store: effectiveConfig?.artifacts?.store ?? "local",
      local: { basePath: effectiveConfig?.artifacts?.local?.basePath ?? "./data/artifacts" },
      custom: effectiveConfig?.artifacts?.custom?.instance
        ? { instance: effectiveConfig.artifacts.custom.instance as ArtifactStore }
        : undefined,
    };

    if (artifactsConfig.enabled === false) return undefined;

    if (artifactsConfig.store === "custom") {
      if (!artifactsConfig.custom?.instance) {
        throw new OboraError(
          "Invalid artifacts configuration: custom store requires instance",
          "SDK_ARTIFACT_CONFIG_ERROR",
        );
      }
      this._artifactStore = artifactsConfig.custom.instance;
      return this._artifactStore;
    }

    const { LocalFileArtifactStore } = await import("@obora/runtime");
    this._artifactStore = new LocalFileArtifactStore({
      basePath: artifactsConfig.local?.basePath ?? "./data/artifacts",
    });
    return this._artifactStore;
  }
}
