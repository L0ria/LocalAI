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

test('the old-route table has a redirect entry in the router for every moved route', () => {
  const moved = MIGRATION_ROUTES.filter(r => r.kind === 'studio-tab')
  assert.equal(moved.length, 7)
  for (const r of moved) {
    const key = r.from.replace('/app/', '')
    assert.ok(router.includes(`path: '${key}', element:`) && router.includes(`legacy="${key}"`), `router.jsx has no redirect entry for ${r.from}`)
    assert.ok(router.includes(`path: '${key}/:model'`), `router.jsx has no model redirect entry for ${r.from}`)
  }
})

test('Studio has a route that carries a model', () => {
  assert.ok(router.includes("path: 'studio/:tab/:model'"))
})

test('the same-path routes need no redirect', () => {
  for (const r of MIGRATION_ROUTES.filter(x => x.kind === 'same')) assert.equal(r.from, r.to)
})
