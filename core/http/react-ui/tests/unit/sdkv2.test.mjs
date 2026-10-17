import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { createHostSDK, ICON_NAMES, SDK_VERSION } from '../../src/addons/sdk.js'

const C = (tag) => (p) => React.createElement(tag, { 'data-props': JSON.stringify(Object.keys(p).sort()) }, p.children)
const NAMES = ['PageHeader', 'ConfirmDialog', 'ErrorWithTraceLink', 'ModelSelector', 'MediaInput', 'WaveformPlayer', 'DistributionBars', 'EmbeddingInspector', 'TabSwitch']

function make(host = {}) {
  const controller = new AbortController()
  const components = Object.fromEntries(NAMES.map(n => [n, C('div')]))
  const sdk = createHostSDK({
    addonId: 'voice', generation: 1, signal: controller.signal, pages: ['recognition'],
    host: {
      React, components, Icon: () => null, hooks: { useMediaCapture: () => 'cap', useObjectUrl: () => 'url', useDelayedAction: () => 'act', audioBufferToWavBlob: () => 'wav' },
      viewer: { isAdmin: () => true, hasFeature: (f) => f === 'face_recognition' },
      language: () => 'en', theme: { mode: () => 'light', subscribe: () => () => {} }, subscribeLanguage: () => () => {}, api: {},
      ...host,
    },
  })
  return { sdk, controller }
}

test('SDK version is 2', () => assert.equal(SDK_VERSION, 2))

test('sdk.ui exposes every shared primitive and widget, and the wrapper passes props through unchanged', () => {
  const { sdk } = make()
  for (const n of NAMES) assert.equal(typeof sdk.ui[n], 'function', n)
  const html = renderToString(React.createElement(sdk.ui.PageHeader, { title: 'T', supporting: 'S', actions: null }))
  assert.match(html, /\[&quot;actions&quot;,&quot;supporting&quot;,&quot;title&quot;\]/)
})

test('sdk.hooks exposes the shared hooks as the host functions', () => {
  const { sdk } = make()
  assert.equal(sdk.hooks.useMediaCapture('audio'), 'cap')
  assert.equal(sdk.hooks.useObjectUrl(null), 'url')
  assert.equal(sdk.hooks.useDelayedAction(() => {}), 'act')
  assert.equal(sdk.hooks.audioBufferToWavBlob({}), 'wav')
})

test('sdk.viewer answers for the signed-in user and nothing else', () => {
  const { sdk } = make()
  assert.equal(sdk.viewer.isAdmin(), true)
  assert.equal(sdk.viewer.hasFeature('face_recognition'), true)
  assert.equal(sdk.viewer.hasFeature('addons'), false)
  assert.deepEqual(Object.keys(sdk.viewer).sort(), ['hasFeature', 'isAdmin'])
})

test('a host without viewer or hooks gives a closed viewer and no hooks, never a throw', () => {
  const { sdk } = make({ viewer: undefined, hooks: undefined })
  assert.equal(sdk.viewer.isAdmin(), false)
  assert.equal(sdk.viewer.hasFeature('x'), false)
  assert.deepEqual(Object.keys(sdk.hooks), [])
})

test('the icon allowlist holds the names the voice and face pages draw', () => {
  for (const n of ['arrow-left', 'arrow-right', 'chart-bar', 'circle-dot', 'clipboard', 'code', 'cube', 'filter-off', 'gender', 'globe', 'headphones', 'help-circle', 'mic', 'play', 'plug-off', 'save', 'shield', 'smile', 'waveform', 'camera', 'stop', 'circle', 'image', 'spinner', 'user-shield', 'mask']) {
    assert.ok(ICON_NAMES.includes(n), n)
  }
})

test('the hooks and the viewer stay frozen', () => {
  const { sdk } = make()
  assert.throws(() => { 'use strict'; sdk.viewer.isAdmin = () => false }, TypeError)
  assert.throws(() => { 'use strict'; sdk.hooks.extra = 1 }, TypeError)
})
