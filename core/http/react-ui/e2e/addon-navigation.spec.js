import { test, expect } from '@playwright/test'
import { MEMBER, app, sessionFor, mockAddons } from './addons-fixtures.js'

const STUDIO = { id: 'studio', kind: 'page', titleKey: 'items.studio', icon: 'palette', mainPath: '/app/studio' }
const TALK = { id: 'talk', kind: 'page', titleKey: 'items.talk', icon: 'phone', mainPath: '/app/talk' }

async function setup(page, { apps = [], pins = ['studio', 'talk'], addons = true, builtin = [STUDIO, TALK] } = {}) {
  let saved = pins
  await page.route('**/api/auth/status', route => route.fulfill({ json: sessionFor(MEMBER, { addons }) }))
  await page.route('**/api/features', route => route.fulfill({ json: { addon_navigation: true } }))
  await page.route('**/api/addons/builtin', route => route.fulfill({ json: { builtin } }))
  // mockAddons installs the Apps routes with the real response shape ({ apps }).
  await mockAddons(page, { apps })
  await page.route('**/api/addons/pins', async route => {
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON()
    await route.fulfill({ json: saved })
  })
  return { saved: () => saved }
}

test.describe('Add-on navigation', () => {
  test('the sidebar shows Chat, Add-ons and the Pinned section', async ({ page }) => {
    await setup(page)
    await page.goto('/app')
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: 'Chat' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Add-ons' })).toBeVisible()
    const pinned = page.getByTestId('pinned-nav')
    await expect(pinned.getByRole('link', { name: 'Studio' })).toBeVisible()
    await expect(pinned.getByRole('link', { name: 'Talk' })).toBeVisible()
  })

  test('an empty Pinned section is hidden', async ({ page }) => {
    await setup(page, { pins: [] })
    await page.goto('/app')
    await expect(page.getByTestId('pinned-nav')).toHaveCount(0)
  })

  test('the drawer lists tiles, searches them and pins from the keyboard', async ({ page }) => {
    const server = await setup(page, { pins: [], apps: [app({ id: 'notes', title: 'Notes', state: 'running', mainPage: '/app/addons/notes/home' })] })
    await page.goto('/app/addons')
    await expect(page.getByTestId('addon-tile')).toHaveCount(3)
    await page.getByTestId('addon-search').fill('note')
    await expect(page.getByTestId('addon-tile')).toHaveCount(1)
    const toggle = page.getByTestId('pin-toggle').first()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toHaveAccessibleName(/Pin Notes/)
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(server.saved()).toEqual(['notes'])
  })

  test('a stopped tile opens the detail view and never the main page', async ({ page }) => {
    await setup(page, { apps: [app({ id: 'notes', title: 'Notes', enabled: false, state: 'stopped', mainPage: undefined })] })
    await page.goto('/app/addons')
    await page.getByTestId('addon-tile').filter({ hasText: 'Notes' }).getByRole('button', { name: /^Notes,/ }).click()
    await expect(page.getByTestId('addon-detail')).toBeVisible()
    expect(page.url()).toContain('/app/addons?detail=notes')
  })

  test('a pinned tile can be moved later and the new order is saved', async ({ page }) => {
    const server = await setup(page, { pins: ['studio', 'talk'] })
    await page.goto('/app/addons')
    await page.getByTestId('addon-tile').filter({ hasText: 'Studio' }).getByTestId('pin-later').click()
    await expect.poll(() => server.saved()).toEqual(['talk', 'studio'])
  })

  test('the ninth pin asks the user to unpin one', async ({ page }) => {
    const nine = Array.from({ length: 9 }, (_, i) => app({ id: `a${i}`, title: `App ${i}`, state: 'running', mainPage: `/app/addons/a${i}/home` }))
    const eight = nine.slice(0, 8).map(a => a.id)
    await setup(page, { apps: nine, pins: eight })
    await page.goto('/app/addons')
    await page.getByTestId('addon-tile').filter({ hasText: 'App 8' }).getByTestId('pin-toggle').click()
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText(/unpin/i)
  })

  test('member without the add-ons feature sees the built-in tiles and no error', async ({ page }) => {
    let appsCalled = false
    await setup(page, { addons: false })
    // Registered after setup, so it wins over the mocked Apps route.
    await page.route(/\/api\/addons\/apps$/, route => { appsCalled = true; return route.fulfill({ status: 403, json: {} }) })
    await page.goto('/app/addons')
    await expect(page.getByTestId('addon-tile')).toHaveCount(2)
    await expect(page.getByTestId('addons-browse')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(appsCalled).toBe(false)
  })

  test('the legacy flag brings the old sidebar back', async ({ page }) => {
    await setup(page)
    await page.route('**/api/features', route => route.fulfill({ json: { addon_navigation: false } }))
    await page.goto('/app')
    await expect(page.getByTestId('pinned-nav')).toHaveCount(0)
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Studio' })).toBeVisible()
  })

  test('the layout holds at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 })
    await setup(page)
    await page.goto('/app/addons')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
  })
})
