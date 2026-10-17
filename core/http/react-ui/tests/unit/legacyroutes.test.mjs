import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STUDIO_TABS, studioRedirect, MIGRATION_ROUTES } from '../../src/utils/legacyRoutes.js'

const here = dirname(fileURLToPath(import.meta.url))
const router = readFileSync(join(here, '../../src/router.jsx'), 'utf8')

test('studioRedirect keeps the model, the query and the hash', () => {
  assert.equal(studioRedirect('image', 'stable/diffusion', '?x=1', '#top'), '/app/studio/images/stable%2Fdiffusion?x=1#top')
  assert.equal(studioRedirect('3d', undefined, '', ''), '/app/studio/threed')
  assert.equal(studioRedirect('tts', 'piper', '?voice=a', ''), '/app/studio/tts/piper?voice=a')
})

test('every standalone generator route maps to a Studio tab', () => {
  assert.deepEqual(Object.keys(STUDIO_TABS).sort(), ['3d', 'diarization', 'image', 'sound', 'transform', 'tts', 'video'])
})

test('every moved row targets what studioRedirect builds for its own generator', () => {
  const moved = MIGRATION_ROUTES.filter(r => r.kind === 'studio-tab')
  assert.equal(moved.length, 7)
  for (const r of moved) {
    const key = r.from.replace('/app/', '')
    assert.equal(r.to, studioRedirect(key), `${r.from} targets ${r.to}`)
  }
})

test('each moved route has its own redirect entry, plain and with a model, bound to its own generator', () => {
  const lines = router.split('\n')
  for (const r of MIGRATION_ROUTES.filter(x => x.kind === 'studio-tab')) {
    const key = r.from.replace('/app/', '')
    for (const path of [key, `${key}/:model`]) {
      const entry = lines.find(l => l.includes(`{ path: '${path}', element:`))
      assert.ok(entry, `router.jsx has no entry for path ${path}`)
      assert.ok(entry.includes(`<StudioTabRedirect legacy="${key}" />`), `entry for ${path} is not bound to legacy="${key}": ${entry.trim()}`)
    }
  }
})

test('Studio has a route that carries a model', () => {
  assert.ok(router.includes("path: 'studio/:tab/:model'"))
})

test('the same-path routes need no redirect', () => {
  for (const r of MIGRATION_ROUTES.filter(x => x.kind === 'same')) assert.equal(r.from, r.to)
})
