import test from 'node:test'
import assert from 'node:assert/strict'
import { bumpVersion, parseVersion } from './version-utils.mjs'

test('parseVersion extracts semantic version parts', () => {
  assert.deepEqual(parseVersion('1.2.3'), {
    major: 1,
    minor: 2,
    patch: 3,
  })
})

test('bumpVersion increments the requested semantic version part', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4')
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0')
})
