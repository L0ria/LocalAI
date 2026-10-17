export function createAddon(sdk) {
  const h = sdk.React.createElement
  return { Component: () => h('p', null, 'fixture'), dispose() {} }
}
