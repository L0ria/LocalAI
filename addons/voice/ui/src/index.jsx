import { createContext } from './ctx.jsx'

export function createAddon(sdk, options = {}) {
  const ctx = createContext(sdk, options)
  const pages = {}

  function Component({ page, path }) {
    const Page = pages[page]
    return Page ? <Page path={path || ''} /> : null
  }
  return { Component, components: {}, chatActions: [], dispose() {} }
}
