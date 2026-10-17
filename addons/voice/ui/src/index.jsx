import { createContext } from './ctx.jsx'
import { createSpeech } from './Speech.jsx'

// The second argument is for tests: the host passes the SDK only. Tasks 15-17
// fill `pages` with the real page components.
export function createAddon(sdk, options = {}) {
  const ctx = createContext(sdk)
  const { h } = ctx
  const pages = { speech: createSpeech(ctx).Speech, ...options.pages }

  function Component({ page, path }) {
    const Page = pages[page]
    return Page ? <Page path={path || ''} /> : null
  }
  return { Component, components: {}, chatActions: [], dispose() {} }
}
