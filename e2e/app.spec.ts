import { expect, test } from '@playwright/test'

test('プロジェクトパスでトップ画面とビルド済みアセットを読み込める', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'スピード', exact: true })).toBeVisible()
  await expect(page.getByText('対戦機能は今後追加します。', { exact: false })).toBeVisible()
  await expect(page).toHaveTitle('ホーム | Speed Card Game')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  expect(
    await page.evaluate(() =>
      [...document.scripts].some((script) =>
        new URL(script.src).pathname.startsWith('/speed-card-game/assets/'),
      ),
    ),
  ).toBe(true)
  expect(errors).toEqual([])
})

test('404を再読み込みしても表示でき、ホームへの移動と履歴が機能する', async ({ page }) => {
  await page.goto('./#/unknown/nested')
  const heading = page.getByRole('heading', { name: 'ページが見つかりません' })
  await expect(heading).toBeVisible()
  await expect(page).toHaveTitle('ページが見つかりません | Speed Card Game')
  await page.reload()
  await expect(heading).toBeVisible()
  await page.getByRole('link', { name: 'ホームに戻る' }).click()
  await expect(page).toHaveURL(/\/speed-card-game\/#\/$/)
  await expect(page.getByRole('heading', { name: 'スピード', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('ホーム | Speed Card Game')
  await page.goBack()
  await expect(heading).toBeVisible()
  await expect(page).toHaveTitle('ページが見つかりません | Speed Card Game')
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'スピード', exact: true })).toBeVisible()
})

test('トップと404が画面幅に収まり、ホームリンクをキーボードで操作できる', async ({ page }) => {
  for (const path of ['./', './#/missing']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
  // SafariのリンクへのTab移動はOS設定に依存するため、起点のフォーカスを明示する。
  const homeLink = page.getByRole('link', { name: 'ホームに戻る' })
  await homeLink.focus()
  await expect(homeLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'スピード', exact: true })).toBeVisible()
})
