import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`)
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function bumpVersion(version, part = 'patch') {
  const parsed = parseVersion(version)
  switch (part) {
    case 'major':
      return `${parsed.major + 1}.0.0`
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`
    case 'patch':
    default:
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
  }
}

export function getAppVersion(packageJsonPath = resolve(process.cwd(), 'package.json')) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  return packageJson.version || '0.1.0'
}
