import consola from "consola"

import { type AccountConfig, getConfig, saveConfig } from "./config"

export type Account = AccountConfig

interface AccountsData {
  activeAccountId: string | null
  accounts: Array<Account>
}

/**
 * Get accounts data from unified config
 */
function getAccountsSync(): AccountsData {
  const config = getConfig()
  return {
    activeAccountId: config.activeAccountId ?? null,
    accounts: config.accounts ?? [],
  }
}

/**
 * Get accounts data from unified config (async version)
 */
export function getAccounts(): Promise<AccountsData> {
  return Promise.resolve(getAccountsSync())
}

/**
 * Save accounts data to unified config
 */
async function saveAccounts(data: AccountsData): Promise<void> {
  const config = getConfig()
  await saveConfig({
    ...config,
    accounts: data.accounts,
    activeAccountId: data.activeAccountId,
  })
}

/**
 * Add a new account or update existing one
 */
export async function addAccount(
  account: Account,
  options: {
    activateIfNone?: boolean
  } = {},
): Promise<void> {
  const data = await getAccounts()

  // Check if account already exists (by id or login)
  const existingIndex = data.accounts.findIndex(
    (a) => a.id === account.id || a.login === account.login,
  )

  if (existingIndex !== -1) {
    // Update existing account
    data.accounts[existingIndex] = account
    consola.info(`Updated existing account: ${account.login}`)
  } else {
    // Add new account
    data.accounts.push(account)
    consola.info(`Added new account: ${account.login}`)
  }

  // If this is the first account or no active account, set it as active
  if ((options.activateIfNone ?? true) && !data.activeAccountId) {
    data.activeAccountId = account.id
  }

  await saveAccounts(data)
}

/**
 * Remove an account by ID
 */
export async function removeAccount(accountId: string): Promise<boolean> {
  const data = await getAccounts()

  const index = data.accounts.findIndex((a) => a.id === accountId)
  if (index === -1) {
    return false
  }

  data.accounts.splice(index, 1)

  // If we removed the active account, switch to another one
  if (data.activeAccountId === accountId) {
    data.activeAccountId = data.accounts[0]?.id ?? null
  }

  await saveAccounts(data)
  return true
}

/**
 * Reorder accounts by ID
 */
export async function reorderAccounts(
  accountIds: Array<string>,
): Promise<boolean> {
  const data = await getAccounts()

  if (accountIds.length !== data.accounts.length) {
    return false
  }

  const uniqueIds = new Set(accountIds)
  if (uniqueIds.size !== accountIds.length) {
    return false
  }

  const accountMap = new Map(
    data.accounts.map((account) => [account.id, account]),
  )
  if (accountMap.size !== data.accounts.length) {
    return false
  }

  if (accountIds.some((accountId) => !accountMap.has(accountId))) {
    return false
  }

  const reorderedAccounts = accountIds
    .map((accountId) => accountMap.get(accountId))
    .filter((account): account is Account => account !== undefined)

  if (reorderedAccounts.length !== accountIds.length) {
    return false
  }

  data.accounts = reorderedAccounts
  await saveAccounts(data)
  return true
}

/**
 * Set active account by ID
 */
export async function setActiveAccount(
  accountId: string,
): Promise<Account | null> {
  const data = await getAccounts()

  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) {
    return null
  }

  data.activeAccountId = accountId
  await saveAccounts(data)

  return account
}

/**
 * Get the currently active account
 */
export async function getActiveAccount(): Promise<Account | null> {
  const data = await getAccounts()

  if (!data.activeAccountId) {
    return data.accounts[0] ?? null
  }

  return data.accounts.find((a) => a.id === data.activeAccountId) ?? null
}

export async function getAccountById(
  accountId: string,
): Promise<Account | null> {
  const data = await getAccounts()
  return data.accounts.find((account) => account.id === accountId) ?? null
}
