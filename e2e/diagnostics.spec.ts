import { expect, test } from '@playwright/test'

test('手動接続の貼り付けエラーと終了・再生成', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '接続に参加', exact: true }).click()
  await page.getByRole('textbox', { name: '受け取ったOffer' }).fill('LINEからコピーした不正なJSON')
  await page.getByRole('button', { name: 'Answerを生成', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('JSONを読み取れません')
  await page.getByRole('button', { name: '中止・接続終了' }).click()
  await expect(page.getByRole('button', { name: '接続を開始', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('FakeTransport：受信表示・RTT・拒否・遅延・結果不明・連続測定', async ({ page }) => {
  await page.goto('./')
  await page.getByText('1台で演出を試す', { exact: true }).click()
  await page.getByRole('button', { name: 'ローカル模擬を開始' }).click()
  await expect(
    page.getByText('ローカル模擬通信（FakeTransport）です。', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: '1回計測', exact: true }).click()
  await expect(page.getByTestId('normal')).toContainText('送信 1 ／ 応答 1')
  await page.getByLabel('移動時間', { exact: true }).selectOption('100')
  await page.getByRole('button', { name: 'カードを送信', exact: true }).click()
  await expect(page.getByTestId('card-status')).toContainText('応答成功')
  await page.getByLabel('相手の疑似応答').selectOption('reject')
  await page.getByRole('button', { name: 'カードを送信', exact: true }).click()
  await expect(page.getByTestId('card-status')).toContainText('疑似拒否')
  await page.getByLabel('相手の疑似応答').selectOption('accept')
  await page.getByLabel('人工応答遅延').selectOption('500')
  await page.getByRole('button', { name: 'カードを送信', exact: true }).click()
  await expect(page.getByTestId('card-status')).toHaveText('応答待ち')
  await expect(page.getByTestId('card-status')).toContainText('応答成功')
  await expect(page.getByTestId('artificial')).toContainText('送信 1 ／ 応答 1')
  await page.getByLabel('人工応答遅延').selectOption('0')
  await page.getByLabel('相手の疑似応答').selectOption('drop')
  await page.getByRole('button', { name: 'カードを送信', exact: true }).click()
  await expect(page.getByTestId('card-status')).toContainText('結果不明', { timeout: 5000 })
  await page.getByRole('button', { name: '表示をリセット', exact: true }).click()
  await expect(page.getByTestId('card-status')).toHaveText('手元で待機')
  await page.getByLabel('送信間隔（ms）').fill('20')
  await page.getByRole('button', { name: '連続測定を開始', exact: true }).click()
  await expect(page.getByText('連続測定：50 回送信済み', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('FakeTransport：reduced-motionで移動を省略する', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await page.getByText('1台で演出を試す', { exact: true }).click()
  await page.getByRole('button', { name: 'ローカル模擬を開始' }).click()
  await page.getByRole('button', { name: 'カードを送信', exact: true }).click()
  await expect(page.getByTestId('card-status')).toContainText('応答成功')
  await expect(page.getByText('動きを減らす設定：', { exact: false })).toBeVisible()
})

test('モックRTC：スマホの長文貼り付け・手動コピーと中止、復帰', async ({ page }) => {
  // SDP生成とクリップボードだけを固定。実RTCテストとは明確に分離する。
  await page.addInitScript(() => {
    const sdp =
      'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:abcd\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=fingerprint:sha-256 AA:BB\r\na=sctp-port:5000\r\na=candidate:1 1 udp 1 192.0.2.1 1234 typ host\r\n'
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        async write() {
          throw new Error('clipboard denied')
        },
      },
      configurable: true,
    })
    Object.defineProperty(window, 'RTCPeerConnection', {
      value: class extends EventTarget {
        iceGatheringState = 'complete'
        connectionState = 'new'
        iceConnectionState = 'new'
        localDescription: { type: string; sdp: string } | null = null
        createDataChannel() {
          return {
            label: 'speed-v1',
            ordered: true,
            maxRetransmits: null,
            maxPacketLifeTime: null,
            close() {},
          }
        }
        async createOffer() {
          return { type: 'offer', sdp }
        }
        async createAnswer() {
          return { type: 'answer', sdp }
        }
        async setLocalDescription(description: { type: string; sdp: string }) {
          this.localDescription = description
        }
        async setRemoteDescription() {}
        close() {}
      },
    })
    // VueUseのlegacy fallbackが例外になるケースを固定し、手動手順を検証。
    document.execCommand = () => {
      throw new Error('clipboard unavailable')
    }
  })
  await page.goto('./')
  await page.getByRole('button', { name: '接続を開始', exact: true }).click()
  const output = page.getByRole('textbox', { name: '送るOffer情報' })
  await expect(output).toBeVisible()
  const offer = await output.inputValue()
  await page.getByRole('button', { name: 'Offerをコピー', exact: true }).click()
  await expect(
    page.getByText('下の接続情報を長押しして全文をコピーしてください。', { exact: false }),
  ).toBeVisible()
  await output.focus()
  expect(
    await output.evaluate(
      (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart,
    ),
  ).toBe(offer.length)
  await page.getByRole('button', { name: '中止・接続終了' }).click()
  await page.getByRole('button', { name: '接続に参加', exact: true }).click()
  await page.getByRole('textbox', { name: '受け取ったOffer' }).fill(offer)
  await page.getByRole('button', { name: 'Answerを生成', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '送るAnswer情報' })).toHaveValue(/"type":"answer"/)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('画面復帰時の状態を確認しました。', { exact: false })).toBeVisible()
})

test('FakeTransport：画面を離れたら連続送信を停止する', async ({ page }) => {
  await page.goto('./')
  await page.getByText('1台で演出を試す', { exact: true }).click()
  await page.getByRole('button', { name: 'ローカル模擬を開始' }).click()
  await page.getByLabel('送信間隔（ms）').fill('1000')
  await page.getByRole('button', { name: '連続測定を開始', exact: true }).click()
  await expect(page.getByRole('button', { name: '測定を停止', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: '測定を停止', exact: true })).toBeDisabled()
})
