import { loadAccounts, saveAccounts } from './account-storage.ts'
import type { AccountStorageData, HeaderStyle, ManagedAccount, ModelFamily, QuotaKey, SwitchReason } from './types.ts'
import { MAX_ACCOUNTS } from './types.ts'

function nowMs(): number {
  return Date.now()
}

function getQuotaKey(family: ModelFamily, headerStyle: HeaderStyle): QuotaKey {
  if (family === 'claude') return 'claude'
  return headerStyle === 'gemini-cli' ? 'gemini-cli' : 'gemini-antigravity'
}

function isRateLimitedForQuotaKey(account: ManagedAccount, key: QuotaKey): boolean {
  const resetTime = account.rateLimitResetTimes[key]
  return resetTime !== undefined && nowMs() < resetTime
}

function isRateLimitedForFamily(account: ManagedAccount, family: ModelFamily): boolean {
  if (family === 'claude') {
    return isRateLimitedForQuotaKey(account, 'claude')
  }
  const antigravityLimited = isRateLimitedForQuotaKey(account, 'gemini-antigravity')
  const cliLimited = isRateLimitedForQuotaKey(account, 'gemini-cli')
  return antigravityLimited && cliLimited
}

function clearExpiredRateLimits(account: ManagedAccount): void {
  const now = nowMs()
  const keys = Object.keys(account.rateLimitResetTimes) as QuotaKey[]
  for (const key of keys) {
    const resetTime = account.rateLimitResetTimes[key]
    if (resetTime !== undefined && now >= resetTime) {
      delete account.rateLimitResetTimes[key]
    }
  }
}

export class AccountManager {
  private accounts: ManagedAccount[] = []
  private cursor = 0
  private currentIndexByFamily: Record<ModelFamily, number> = { claude: -1, gemini: -1 }

  static async loadFromDisk(): Promise<AccountManager> {
    const stored = await loadAccounts()
    return new AccountManager(stored)
  }

  constructor(stored?: AccountStorageData | null) {
    if (!stored || stored.accounts.length === 0) {
      return
    }

    const baseNow = nowMs()
    this.accounts = stored.accounts.slice(0, MAX_ACCOUNTS).map(
      (acc, index): ManagedAccount => ({
        index,
        email: acc.email,
        addedAt: acc.addedAt ?? baseNow,
        lastUsed: acc.lastUsed ?? 0,
        refreshToken: acc.refreshToken,
        projectId: acc.projectId,
        rateLimitResetTimes: acc.rateLimitResetTimes ?? {},
        lastSwitchReason: acc.lastSwitchReason,
      }),
    )

    this.cursor = stored.activeIndex % Math.max(1, this.accounts.length)
    if (this.accounts.length > 0) {
      this.currentIndexByFamily.claude = (stored.activeIndexByFamily?.claude ?? 0) % this.accounts.length
      this.currentIndexByFamily.gemini = (stored.activeIndexByFamily?.gemini ?? 0) % this.accounts.length
    }
  }

  getAccountCount(): number {
    return this.accounts.length
  }

  getAccounts(): ManagedAccount[] {
    return [...this.accounts]
  }

  addAccount(
    refreshToken: string,
    email?: string,
    projectId?: string,
  ): { account: ManagedAccount; isNew: boolean } | null {
    if (this.accounts.length >= MAX_ACCOUNTS) {
      return null
    }

    const existingByToken = this.accounts.find((a) => a.refreshToken === refreshToken)
    if (existingByToken) {
      existingByToken.email = email ?? existingByToken.email
      existingByToken.projectId = projectId ?? existingByToken.projectId
      return { account: existingByToken, isNew: false }
    }

    if (email) {
      const existingByEmail = this.accounts.find((a) => a.email === email)
      if (existingByEmail) {
        existingByEmail.refreshToken = refreshToken
        existingByEmail.projectId = projectId ?? existingByEmail.projectId
        return { account: existingByEmail, isNew: false }
      }
    }

    const now = nowMs()
    const account: ManagedAccount = {
      index: this.accounts.length,
      email,
      addedAt: now,
      lastUsed: 0,
      refreshToken,
      projectId,
      rateLimitResetTimes: {},
    }

    this.accounts.push(account)

    if (this.accounts.length === 1) {
      this.currentIndexByFamily.claude = 0
      this.currentIndexByFamily.gemini = 0
    }

    return { account, isNew: true }
  }

  removeAccount(account: ManagedAccount): boolean {
    const idx = this.accounts.indexOf(account)
    if (idx < 0) return false

    this.accounts.splice(idx, 1)
    this.accounts.forEach((acc, i) => {
      acc.index = i
    })

    if (this.accounts.length === 0) {
      this.cursor = 0
      this.currentIndexByFamily = { claude: -1, gemini: -1 }
      return true
    }

    if (this.cursor > idx) this.cursor -= 1
    this.cursor = this.cursor % this.accounts.length

    for (const family of ['claude', 'gemini'] as ModelFamily[]) {
      if (this.currentIndexByFamily[family] > idx) {
        this.currentIndexByFamily[family] -= 1
      }
      if (this.currentIndexByFamily[family] >= this.accounts.length) {
        this.currentIndexByFamily[family] = -1
      }
    }

    return true
  }

  getCurrentForFamily(family: ModelFamily): ManagedAccount | null {
    const idx = this.currentIndexByFamily[family]
    if (idx >= 0 && idx < this.accounts.length) {
      return this.accounts[idx] ?? null
    }
    return null
  }

  getCurrentOrNextForFamily(family: ModelFamily): ManagedAccount | null {
    const current = this.getCurrentForFamily(family)
    if (current) {
      clearExpiredRateLimits(current)
      if (!isRateLimitedForFamily(current, family)) {
        current.lastUsed = nowMs()
        return current
      }
    }
    return this.getNextForFamily(family)
  }

  getNextForFamily(family: ModelFamily): ManagedAccount | null {
    const available = this.accounts.filter((a) => {
      clearExpiredRateLimits(a)
      return !isRateLimitedForFamily(a, family)
    })

    if (available.length === 0) return null

    const account = available[this.cursor % available.length]
    if (!account) return null

    this.cursor++
    account.lastUsed = nowMs()
    this.currentIndexByFamily[family] = account.index
    return account
  }

  markRateLimited(
    account: ManagedAccount,
    retryAfterMs: number,
    family: ModelFamily,
    headerStyle: HeaderStyle = 'antigravity',
  ): void {
    const key = getQuotaKey(family, headerStyle)
    account.rateLimitResetTimes[key] = nowMs() + retryAfterMs
  }

  markSwitched(account: ManagedAccount, reason: SwitchReason, family: ModelFamily): void {
    account.lastSwitchReason = reason
    this.currentIndexByFamily[family] = account.index
  }

  getAvailableHeaderStyle(account: ManagedAccount, family: ModelFamily): HeaderStyle | null {
    clearExpiredRateLimits(account)
    if (family === 'claude') {
      return isRateLimitedForQuotaKey(account, 'claude') ? null : 'antigravity'
    }
    if (!isRateLimitedForQuotaKey(account, 'gemini-antigravity')) return 'antigravity'
    if (!isRateLimitedForQuotaKey(account, 'gemini-cli')) return 'gemini-cli'
    return null
  }

  getMinWaitTimeForFamily(family: ModelFamily): number {
    const available = this.accounts.filter((a) => {
      clearExpiredRateLimits(a)
      return !isRateLimitedForFamily(a, family)
    })
    if (available.length > 0) return 0

    const waitTimes: number[] = []
    for (const a of this.accounts) {
      if (family === 'claude') {
        const t = a.rateLimitResetTimes.claude
        if (t !== undefined) waitTimes.push(Math.max(0, t - nowMs()))
      } else {
        const t1 = a.rateLimitResetTimes['gemini-antigravity']
        const t2 = a.rateLimitResetTimes['gemini-cli']
        const wait = Math.min(
          t1 !== undefined ? Math.max(0, t1 - nowMs()) : Infinity,
          t2 !== undefined ? Math.max(0, t2 - nowMs()) : Infinity,
        )
        if (wait !== Infinity) waitTimes.push(wait)
      }
    }

    return waitTimes.length > 0 ? Math.min(...waitTimes) : 0
  }

  updateTokens(account: ManagedAccount, accessToken: string, expiresAt: number): void {
    account.accessToken = accessToken
    account.expiresAt = expiresAt
  }

  async saveToDisk(): Promise<void> {
    const claudeIdx = Math.max(0, this.currentIndexByFamily.claude)
    const geminiIdx = Math.max(0, this.currentIndexByFamily.gemini)

    const storage: AccountStorageData = {
      version: 1,
      accounts: this.accounts.map((a) => ({
        email: a.email,
        refreshToken: a.refreshToken,
        projectId: a.projectId,
        addedAt: a.addedAt,
        lastUsed: a.lastUsed,
        rateLimitResetTimes: Object.keys(a.rateLimitResetTimes).length > 0 ? a.rateLimitResetTimes : undefined,
        lastSwitchReason: a.lastSwitchReason,
      })),
      activeIndex: claudeIdx,
      activeIndexByFamily: { claude: claudeIdx, gemini: geminiIdx },
    }

    await saveAccounts(storage)
  }
}
