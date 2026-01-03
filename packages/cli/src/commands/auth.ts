import * as p from '@clack/prompts'
import {
  isAuthenticated,
  isGoogleAuthenticated,
  isOpenAIAuthenticated,
  listGoogleAccounts,
  loadProviderTokens,
  logout as logoutAnthropic,
  logoutGoogle,
  logoutOpenAI,
  performGoogleLoginWithMultiAccount,
  performInteractiveLogin,
  performOpenAILogin,
  removeGoogleAccount,
} from '@obora/core'

type Provider = 'anthropic' | 'openai' | 'google'

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: 'anthropic', label: 'Anthropic', hint: 'Claude Pro/Max subscription' },
  { value: 'openai', label: 'OpenAI', hint: 'ChatGPT Plus subscription' },
  { value: 'google', label: 'Google', hint: 'Gemini subscription' },
]

export async function auth(args: string[]): Promise<void> {
  const subcommand = args[0]

  if (subcommand === '-h' || subcommand === '--help') {
    showHelp()
    return
  }

  if (subcommand === 'status') {
    await status()
    return
  }

  if (subcommand === 'login') {
    const provider = args[1] as Provider | undefined
    await login(provider)
    return
  }

  if (subcommand === 'logout') {
    const provider = args[1] as Provider | undefined
    await logout(provider)
    return
  }

  await interactiveMode()
}

async function interactiveMode(): Promise<void> {
  p.intro('🔐 Obora Authentication')

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'login', label: 'Login', hint: 'Authenticate with a provider' },
      { value: 'logout', label: 'Logout', hint: 'Clear stored tokens' },
      { value: 'status', label: 'Status', hint: 'Check authentication status' },
    ],
  })

  if (p.isCancel(action)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  switch (action) {
    case 'login':
      await loginInteractive()
      break
    case 'logout':
      await logoutInteractive()
      break
    case 'status':
      await status()
      break
  }

  p.outro('Done!')
}

async function loginInteractive(): Promise<void> {
  const statuses = await getProviderStatuses()

  const options = PROVIDERS.map((prov) => {
    const status = statuses[prov.value]
    const statusIcon = status === 'authenticated' ? '✓' : status === 'expired' ? '⟳' : '○'
    return {
      value: prov.value,
      label: `${statusIcon} ${prov.label}`,
      hint: status === 'authenticated' ? 'Already logged in' : prov.hint,
    }
  })

  const provider = await p.select({
    message: 'Select provider to login:',
    options,
  })

  if (p.isCancel(provider)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  await login(provider as Provider)
}

async function logoutInteractive(): Promise<void> {
  const statuses = await getProviderStatuses()
  const authenticatedProviders = PROVIDERS.filter((prov) => statuses[prov.value] !== 'not_authenticated')

  if (authenticatedProviders.length === 0) {
    p.log.info('No active sessions to logout from')
    return
  }

  const options = [
    { value: 'all', label: 'All providers', hint: 'Logout from everything' },
    ...authenticatedProviders.map((prov) => ({
      value: prov.value,
      label: prov.label,
      hint: prov.hint,
    })),
  ]

  const choice = await p.select({
    message: 'Select provider to logout:',
    options,
  })

  if (p.isCancel(choice)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  if (choice === 'all') {
    await logout()
  } else {
    await logout(choice as Provider)
  }
}

async function login(provider?: Provider): Promise<void> {
  if (!provider) {
    await loginInteractive()
    return
  }

  const providerName = getProviderName(provider)

  if (provider === 'google') {
    await loginGoogle()
    return
  }

  const isAuth = await isProviderAuthenticated(provider)

  if (isAuth) {
    const shouldReauth = await p.confirm({
      message: `Already authenticated with ${providerName}. Re-authenticate?`,
      initialValue: false,
    })

    if (p.isCancel(shouldReauth) || !shouldReauth) {
      p.log.info('Keeping existing authentication')
      return
    }

    await logoutProvider(provider)
  }

  const s = p.spinner()
  s.start(`Opening browser for ${providerName} authentication...`)

  try {
    s.stop()

    switch (provider) {
      case 'anthropic':
        await performInteractiveLogin('max')
        break
      case 'openai':
        await performOpenAILogin()
        break
    }

    p.log.success(`Authenticated with ${providerName}!`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    p.log.error(`Authentication failed: ${message}`)
    process.exit(1)
  }
}

async function loginGoogle(): Promise<void> {
  const accounts = await listGoogleAccounts()

  if (accounts.length === 0) {
    await addGoogleAccountWithRetry()
    return
  }

  p.log.info(`You have ${accounts.length} Google account(s):`)
  for (const acc of accounts) {
    const email = acc.email || `Account ${acc.index + 1}`
    const rateLimited = Object.keys(acc.rateLimitResetTimes).length > 0
    const status = rateLimited ? ' (rate limited)' : ''
    p.log.message(`  ${acc.index + 1}. ${email}${status}`)
  }

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'add', label: 'Add another account', hint: 'Up to 10 accounts for rotation' },
      { value: 'remove', label: 'Remove account', hint: 'Select account to remove' },
      { value: 'replace', label: 'Replace all accounts', hint: 'Clear and re-authenticate' },
      { value: 'keep', label: 'Keep current accounts', hint: 'No changes' },
    ],
  })

  if (p.isCancel(action)) {
    p.cancel('Cancelled')
    process.exit(0)
  }

  if (action === 'keep') {
    p.log.info('Keeping existing accounts')
    return
  }

  if (action === 'remove') {
    await removeGoogleAccountInteractive(accounts)
    return
  }

  if (action === 'replace') {
    await logoutGoogle()
    p.log.info('Cleared all Google accounts')
  }

  await addGoogleAccountWithRetry()
}

async function removeGoogleAccountInteractive(accounts: Awaited<ReturnType<typeof listGoogleAccounts>>): Promise<void> {
  const options = accounts.map((acc) => ({
    value: acc.index,
    label: acc.email || `Account ${acc.index + 1}`,
    hint: Object.keys(acc.rateLimitResetTimes).length > 0 ? 'rate limited' : undefined,
  }))

  const selected = await p.select({
    message: 'Select account to remove:',
    options,
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled')
    return
  }

  const removed = await removeGoogleAccount(selected as number)
  if (removed) {
    const remaining = await listGoogleAccounts()
    p.log.success(`Removed account. ${remaining.length} account(s) remaining.`)
  } else {
    p.log.error('Failed to remove account')
  }
}

async function addGoogleAccountWithRetry(): Promise<void> {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  process.stdin.resume()

  try {
    const result = await performGoogleLoginWithMultiAccount()
    if (result) {
      const email = result.account.email || `Account ${result.account.index + 1}`
      if (result.isNew) {
        p.log.success(`Added Google account: ${email}`)
      } else {
        p.log.info(`Account already exists: ${email} (refreshed tokens)`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    p.log.error(`Authentication failed: ${message}`)
    process.exit(1)
  }

  const accounts = await listGoogleAccounts()
  if (accounts.length >= 10) {
    p.log.info('Maximum of 10 accounts reached')
    return
  }

  const addMore = await p.confirm({
    message: 'Add another account?',
    initialValue: false,
  })

  if (p.isCancel(addMore) || !addMore) {
    return
  }

  await addGoogleAccountWithRetry()
}

async function logout(provider?: Provider): Promise<void> {
  if (!provider) {
    const s = p.spinner()
    s.start('Logging out from all providers...')
    await logoutAnthropic()
    await logoutOpenAI()
    await logoutGoogle()
    s.stop('Logged out from all providers')
    return
  }

  if (provider === 'google') {
    await logoutGoogleInteractive()
    return
  }

  const s = p.spinner()
  s.start(`Logging out from ${getProviderName(provider)}...`)
  await logoutProvider(provider)
  s.stop(`Logged out from ${getProviderName(provider)}`)
}

async function logoutGoogleInteractive(): Promise<void> {
  const accounts = await listGoogleAccounts()

  if (accounts.length === 0) {
    p.log.info('No Google accounts to logout')
    return
  }

  if (accounts.length === 1) {
    await logoutGoogle()
    p.log.success('Logged out from Google')
    return
  }

  p.log.info(`You have ${accounts.length} Google account(s):`)
  for (const acc of accounts) {
    const email = acc.email || `Account ${acc.index + 1}`
    p.log.message(`  ${acc.index + 1}. ${email}`)
  }

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'select', label: 'Remove specific account' },
      { value: 'all', label: 'Remove all accounts' },
      { value: 'cancel', label: 'Cancel' },
    ],
  })

  if (p.isCancel(action) || action === 'cancel') {
    p.log.info('Cancelled')
    return
  }

  if (action === 'all') {
    await logoutGoogle()
    p.log.success('Logged out from all Google accounts')
    return
  }

  const options = accounts.map((acc) => ({
    value: acc.index,
    label: acc.email || `Account ${acc.index + 1}`,
  }))

  const selected = await p.select({
    message: 'Select account to remove:',
    options,
  })

  if (p.isCancel(selected)) {
    p.log.info('Cancelled')
    return
  }

  const removed = await removeGoogleAccount(selected as number)
  if (removed) {
    const remaining = await listGoogleAccounts()
    if (remaining.length === 0) {
      await logoutGoogle()
    }
    p.log.success(`Removed account. ${remaining.length} account(s) remaining.`)
  } else {
    p.log.error('Failed to remove account')
  }
}

async function status(): Promise<void> {
  p.log.info('Authentication Status')

  const statuses = await getProviderStatuses()

  for (const prov of PROVIDERS) {
    const status = statuses[prov.value]
    const tokens = await loadProviderTokens(prov.value)

    let statusText: string
    if (status === 'authenticated' && tokens) {
      const expiresAt = new Date(tokens.expiresAt).toLocaleString()
      statusText = `✓ Authenticated (expires: ${expiresAt})`
    } else if (status === 'expired') {
      statusText = '⟳ Expired (will refresh on use)'
    } else {
      statusText = '○ Not authenticated'
    }

    p.log.message(`${prov.label.padEnd(12)} ${statusText}`)

    if (prov.value === 'google') {
      const accounts = await listGoogleAccounts()
      if (accounts.length > 0) {
        p.log.message(`             └─ ${accounts.length} account(s) for rotation:`)
        for (const acc of accounts) {
          const email = acc.email || `Account ${acc.index + 1}`
          const rateLimitKeys = Object.keys(acc.rateLimitResetTimes)
          const rateLimited = rateLimitKeys.length > 0
          const status = rateLimited ? ' ⚠ rate limited' : ' ✓'
          p.log.message(`                ${acc.index + 1}. ${email}${status}`)
        }
      }
    }
  }
}

async function getProviderStatuses(): Promise<Record<Provider, string>> {
  const result: Record<Provider, string> = {
    anthropic: 'not_authenticated',
    openai: 'not_authenticated',
    google: 'not_authenticated',
  }

  for (const prov of PROVIDERS) {
    const tokens = await loadProviderTokens(prov.value)
    if (!tokens) {
      result[prov.value] = 'not_authenticated'
    } else if (tokens.expiresAt < Date.now()) {
      result[prov.value] = 'expired'
    } else {
      result[prov.value] = 'authenticated'
    }
  }

  return result
}

function getProviderName(provider: Provider): string {
  return PROVIDERS.find((p) => p.value === provider)?.label ?? provider
}

async function isProviderAuthenticated(provider: Provider): Promise<boolean> {
  switch (provider) {
    case 'anthropic':
      return isAuthenticated()
    case 'openai':
      return isOpenAIAuthenticated()
    case 'google':
      return isGoogleAuthenticated()
  }
}

async function logoutProvider(provider: Provider): Promise<void> {
  switch (provider) {
    case 'anthropic':
      await logoutAnthropic()
      break
    case 'openai':
      await logoutOpenAI()
      break
    case 'google':
      await logoutGoogle()
      break
  }
}

function showHelp(): void {
  console.log(`
Auth - Manage OAuth authentication

Usage:
  obora auth                   Interactive mode
  obora auth login [provider]  Login with OAuth
  obora auth logout [provider] Clear stored tokens
  obora auth status            Check authentication status

Providers: anthropic, openai, google
`)
}
