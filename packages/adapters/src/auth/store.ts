import { chmodSync, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AuthStore, ProviderAuth } from "./types";

const STORE_VERSION = 1;

export function getDefaultAuthFilePath(): string {
  return path.join(os.homedir(), ".obora", "auth.json");
}

export class AuthStoreRepository {
  constructor(private readonly filePath: string = getDefaultAuthFilePath()) {}

  async load(): Promise<AuthStore> {
    if (!existsSync(this.filePath)) {
      return { version: STORE_VERSION, providers: {} };
    }

    const data = await readFile(this.filePath, "utf-8");
    const parsed = JSON.parse(data) as Partial<AuthStore>;

    return {
      version: parsed.version ?? STORE_VERSION,
      providers: parsed.providers ?? {},
    };
  }

  async upsert(provider: string, auth: ProviderAuth): Promise<void> {
    const store = await this.load();
    store.providers[provider] = auth;
    await this.save(store);
  }

  async remove(provider: string): Promise<void> {
    const store = await this.load();
    delete store.providers[provider];
    await this.save(store);
  }

  async save(store: AuthStore): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const content = `${JSON.stringify(store, null, 2)}\n`;

    await writeFile(tmpPath, content, { mode: 0o600 });
    chmodSync(tmpPath, 0o600);
    await rename(tmpPath, this.filePath);
    chmodSync(this.filePath, 0o600);
  }
}
