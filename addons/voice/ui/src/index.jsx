import { createContext } from './ctx.jsx'
import { createSpeech } from './Speech.jsx'
import { createApi } from './api.js'
import { createVoiceLibrary } from './VoiceLibrary.jsx'
import { createVoiceProfileCreate } from './VoiceProfileCreate.jsx'

// The second argument is for tests: the host passes the SDK only. Tasks 15-17
// fill `pages` with the real page components.
export function createAddon(sdk, options = {}) {
  const ctx = createContext(sdk)
  const { h } = ctx
  const api = createApi(ctx)
  const pages = {
    library: createVoiceLibrary(ctx, api).VoiceLibrary,
    create: createVoiceProfileCreate(ctx, api).VoiceProfileCreate,
    speech: createSpeech(ctx).Speech,
    ...options.pages,
  }

  function Component({ page, path }) {
    const Page = pages[page]
    return Page ? <Page path={path || ''} /> : null
  }
  return { Component, components: {}, chatActions: [], dispose() {} }
}
