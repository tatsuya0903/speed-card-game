import { expect, test, type Page } from '@playwright/test'
async function clipboardCopy(page: Page, button: string) {
  await page.getByRole('button', { name: button, exact: true }).click()
  await expect(page.getByText('コピー操作を実行しました。', { exact: false })).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}

test('実WebRTC：独立した2ブラウザーでOffer/Answer、双方向RTT、終了、再生成', async ({
  browser,
  playwright,
  baseURL,
}) => {
  // BrowserContext2個だけでなく、Chromiumプロセスを2個起動する。
  const secondBrowser = await playwright.chromium.launch()
  const hostContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const guestContext = await secondBrowser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage()
  try {
    await Promise.all([host.goto(baseURL!), guest.goto(baseURL!)])
    await host.getByRole('button', { name: '接続を開始', exact: true }).click()
    const offerField = host.getByRole('textbox', { name: '送るOffer情報' })
    await expect(offerField).toBeVisible({ timeout: 25_000 })
    const offer = await clipboardCopy(host, 'Offerをコピー')
    expect(offer).toBe(await offerField.inputValue())
    expect(JSON.parse(offer)).toEqual(expect.objectContaining({ version: 1, type: 'offer' }))
    expect(offer).toContain('a=candidate:')
    await guest.getByRole('button', { name: '接続に参加', exact: true }).click()
    await guest.getByRole('textbox', { name: '受け取ったOffer' }).fill(offer)
    await guest.getByRole('button', { name: 'Answerを生成', exact: true }).click()
    await expect(guest.getByRole('textbox', { name: '送るAnswer情報' })).toBeVisible({
      timeout: 25_000,
    })
    const answer = await clipboardCopy(guest, 'Answerをコピー')
    await host.getByRole('textbox', { name: '受け取ったAnswer' }).fill(answer)
    await host.getByRole('button', { name: 'Answerを適用して接続', exact: true }).click()
    for (const page of [host, guest]) {
      await expect(page.getByTestId('connection-state')).toContainText('接続済み', {
        timeout: 15_000,
      })
      await page.getByRole('button', { name: '1回計測', exact: true }).click()
      await expect(page.getByTestId('normal')).toContainText('送信 1 ／ 応答 1')
    }
    await expect(host.getByTestId('receive-indicator')).toContainText('1 回')
    await expect(guest.getByTestId('receive-indicator')).toContainText('1 回')
    await host.getByLabel('人工応答遅延').selectOption('4000')
    await host.getByRole('button', { name: 'カードを送信', exact: true }).click()
    await expect(host.getByTestId('card-status')).toContainText('結果不明', { timeout: 5000 })
    await expect(host.getByTestId('card-status')).toContainText('応答成功')
    await expect(host.getByTestId('artificial')).toContainText('タイムアウト 1 ／ 遅着 1')
    await host.getByRole('button', { name: '中止・接続終了' }).click()
    await expect(guest.getByTestId('connection-state')).toContainText(/接続失敗|一時切断/, {
      timeout: 15_000,
    })
    await host.getByRole('button', { name: '接続を開始', exact: true }).click()
    await expect(offerField).toBeVisible({ timeout: 25_000 })
    await expect(offerField).not.toHaveValue(offer)
    await host.reload()
    await expect(host.getByTestId('connection-state')).toContainText('未接続')
  } finally {
    await hostContext.close()
    await guestContext.close()
    await secondBrowser.close()
  }
})
