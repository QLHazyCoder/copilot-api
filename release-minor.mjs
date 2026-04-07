#!/usr/bin/env node

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

/** @typedef {Record<string, unknown> & { version: string }} PackageJson */

/**
 * @param {string} command
 */
function run(command) {
  execSync(command, { stdio: "inherit" })
}

/**
 * @param {string} command
 * @returns {string}
 */
function runText(command) {
  return execSync(command, { encoding: "utf8" }).trim()
}

function isGitClean() {
  try {
    execSync("git diff --quiet")
    execSync("git diff --cached --quiet")
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} version
 * @returns {string}
 */
function bumpMinor(version) {
  const parts = version.split(".")
  if (parts.length !== 3) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])
  if (![major, minor, patch].every((value) => Number.isInteger(value))) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  return `${major}.${minor + 1}.0`
}

/**
 * @param {string} tag
 * @returns {boolean}
 */
function tagExists(tag) {
  try {
    execSync(`git rev-parse -q --verify refs/tags/${tag}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} raw
 * @returns {PackageJson}
 */
function parsePackageJson(raw) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const parsed = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError("package.json content is not a valid object")
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const candidate = /** @type {Record<string, unknown>} */ (parsed)
  if (typeof candidate.version !== "string") {
    throw new TypeError("package.json missing string version field")
  }

  return /** @type {PackageJson} */ (candidate)
}

function main() {
  const branch = runText("git rev-parse --abbrev-ref HEAD")
  if (branch !== "main") {
    throw new Error(
      `Release must run on main branch. Current branch: ${branch}`,
    )
  }

  if (!isGitClean()) {
    throw new Error(
      "Working tree is not clean. Commit or stash your changes first.",
    )
  }

  const packageJsonPath = resolve(process.cwd(), "package.json")
  const packageJson = parsePackageJson(readFileSync(packageJsonPath, "utf8"))

  const currentVersion = packageJson.version
  const nextVersion = bumpMinor(currentVersion)

  if (tagExists(nextVersion)) {
    throw new Error(`Tag ${nextVersion} already exists.`)
  }

  packageJson.version = nextVersion
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  )

  run("git add package.json")
  run(`git commit -m "chore(release): bump version to ${nextVersion}"`)
  run("git push origin main")
  run(`git tag -a ${nextVersion} -m "release ${nextVersion}"`)
  run(`git push origin ${nextVersion}`)

  console.log(`Release completed: ${nextVersion}`)
}

main()
