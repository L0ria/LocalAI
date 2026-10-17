import { createContext } from './ctx.jsx'

// The second argument is for tests: the host passes the SDK only. Tasks 15-17
// fill `pages` with the real page components.
export function createAddon(sdk, options = {}) {
  const ctx = createContext(sdk)
  const { h } = ctx
  const pages = { ...options.pages }

  function Component({ page, path }) {
    const Page = pages[page]
    return Page ? <Page path={path || ''} /> : null
  }
  return { Component, components: {}, chatActions: [], dispose() {} }
}
