import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { load } from './render.test.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(resolve(here, '../../../../core/http/react-ui'), 'package.json'))
const React = require('react')
const { renderToString } = require('react-dom/server')

test('library: the first paint of the library page has the core test id', async () => {
  const { mod, sdk } = await load()
  const addon = await mod.createAddon(sdk)
  const html = renderToString(React.createElement(addon.Component, { page: 'library', path: '' }))
  assert.match(html, /data-testid="voice-library"/)
})

test('create: the first paint of the create page has the core test id', async () => {
  const { mod, sdk } = await load()
  const addon = await mod.createAddon(sdk)
  const html = renderToString(React.createElement(addon.Component, { page: 'create', path: '' }))
  assert.match(html, /data-testid="voice-profile-create"/)
})

test('api: the voice profile calls use the core routes through sdk.core.fetch', async () => {
  const { mod, sdk, calls } = await load()
  const { createApi } = await import('../src/api.js')
  const { createContext } = await import('../src/ctx.jsx').catch(() => ({}))
  const ctx = mod.__ctxFor ? mod.__ctxFor(sdk) : { core: sdk.core, json: async (p, i) => (await sdk.core.fetch(p, i)).json() }
  const api = createApi(ctx)
  await api.voiceProfiles.list()
  await api.voiceProfiles.remove('a/b')
  assert.equal(calls[0][0], '/api/voice-profiles')
  assert.equal(calls[1][0], '/api/voice-profiles/a%2Fb')
  assert.equal(calls[1][1].method, 'DELETE')
  assert.equal(api.voiceProfiles.audioUrl('a/b'), '/api/voice-profiles/a%2Fb/audio')
  void createContext
})

test('library: the admin-only actions are hidden for a viewer who is not an administrator', async () => {
  const { mod, sdk } = await load({ viewer: { isAdmin: () => false, hasFeature: () => true } })
  const addon = await mod.createAddon(sdk)
  const html = renderToString(React.createElement(addon.Component, { page: 'library', path: '' }))
  assert.doesNotMatch(html, /data-testid="voice-library-new"/)
})
