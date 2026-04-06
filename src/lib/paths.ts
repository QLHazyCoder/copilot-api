import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Use XDG_DATA_HOME if set (for Docker), otherwise use ~/.local/share
const dataHome =
  process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
const APP_DIR = path.join(dataHome, "copilot-api")

const GITHUB_TOKEN_PATH = path.join(APP_DIR, "github_token")
const CONFIG_PATH = path.join(APP_DIR, "config.json")
const USAGE_LOG_DB_PATH = path.join(APP_DIR, "usage-logs.sqlite")

export const PATHS = {
  APP_DIR,
  GITHUB_TOKEN_PATH,
  CONFIG_PATH,
  USAGE_LOG_DB_PATH,
}

export async function ensurePaths(): Promise<void> {
  await fs.mkdir(PATHS.APP_DIR, { recursive: true })
  await ensureFile(PATHS.GITHUB_TOKEN_PATH)
  await ensureFile(PATHS.CONFIG_PATH)
}

async function ensureFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.W_OK)
  } catch {
    await fs.writeFile(filePath, "")
    await fs.chmod(filePath, 0o600)
  }
}
