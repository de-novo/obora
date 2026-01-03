import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AccountStorageData } from './types.ts'

function getAccountsFilePath(): string {
  const configDir = process.env.XDG_CONFIG_HOME || join(homedir(), '.config', 'obora')
  return join(configDir, 'google-accounts.json')
}

async function ensureConfigDir(): Promise<void> {
  const accountsPath = getAccountsFilePath()
  const dir = accountsPath.substring(0, accountsPath.lastIndexOf('/'))
  try {
    await Bun.file(dir).exists()
  } catch {
    await Bun.write(join(dir, '.keep'), '')
  }
}

export async function loadAccounts(): Promise<AccountStorageData | null> {
  const accountsPath = getAccountsFilePath()
  try {
    const file = Bun.file(accountsPath)
    if (await file.exists()) {
      const content = await file.text()
      return JSON.parse(content) as AccountStorageData
    }
  } catch {
    return null
  }
  return null
}

export async function saveAccounts(data: AccountStorageData): Promise<void> {
  await ensureConfigDir()
  const accountsPath = getAccountsFilePath()
  await Bun.write(accountsPath, JSON.stringify(data, null, 2))
  try {
    const fs = await import('node:fs/promises')
    await fs.chmod(accountsPath, 0o600)
  } catch {}
}

export async function clearAccounts(): Promise<void> {
  const accountsPath = getAccountsFilePath()
  try {
    const fs = await import('node:fs/promises')
    await fs.unlink(accountsPath)
  } catch {}
}

export function getAccountsPath(): string {
  return getAccountsFilePath()
}
