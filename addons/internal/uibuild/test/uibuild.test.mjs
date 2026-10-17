import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAddonUI } from '../uibuild.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('buildAddonUI writes the module, the style sheet and a PNG icon', async () => {
  const dist = await buildAddonUI({ root: join(here, 'fixture'), name: 'fixture', rgb: [26, 62, 138] })
  assert.ok(existsSync(join(dist, 'ui/fixture.js')))
  assert.ok(existsSync(join(dist, 'ui/fixture.css')))
  const png = readFileSync(join(dist, 'ui/icon.png'))
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.ok(png.length < 256 * 1024, 'the icon must fit the 256 KiB manifest bound')
})

test('the bundle never imports React', async () => {
  const dist = await buildAddonUI({ root: join(here, 'fixture'), name: 'fixture', rgb: [1, 2, 3] })
  const js = readFileSync(join(dist, 'ui/fixture.js'), 'utf8')
  assert.doesNotMatch(js, /from\s+['"](react|react-dom)/)
  assert.match(js, /createAddon/)
})
