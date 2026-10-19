import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bumpVersion, getAppVersion } from './version-utils.mjs'

const target = process.argv[2] || 'patch'
const packageJsonPath = resolve(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const nextVersion = bumpVersion(getAppVersion(packageJsonPath), target)

packageJson.version = nextVersion
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

console.log(`Version bumped to ${nextVersion}`)
