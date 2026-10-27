import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeTransport } from '@/network/fakeTransport'
import { DiagnosticSession, REQUEST_TIMEOUT_MS } from './session'
import { statistics } from './statistics'
const sessions: DiagnosticSession[] = []
function pair() {
  const [a, b] = FakeTransport.pair()
  const sender = new DiagnosticSession(a),
    receiver = new DiagnosticSession(b)
  sessions.push(sender, receiver)
  return { a, b, sender, receiver }
}
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose())
  vi.useRealTimers()
})
describe('RTT統計', () => {
  it('空・1件・偶数・奇数とnearest-rankのP95', () => {
    expect(statistics([]).latest).toBeNull()
    expect(statistics([4])).toEqual({ latest: 4, mean: 4, p50: 4, p95: 4, max: 4 })
    expect(statistics([10, 4, 2, 8])).toEqual({ latest: 8, mean: 6, p50: 6, p95: 10, max: 10 })
    expect(statistics([3, 1, 2]).p50).toBe(2)
    expect(statistics(Array.from({ length: 100 }, (_, i) => i + 1)).p95).toBe(95)
  })
})
describe('FakeTransportによる要求・応答', () => {
  it('actionIdごとに双方向の応答を対応させ、重複を無視する', async () => {
    const { a, b, sender, receiver } = pair()
    const events = vi.fn<(...args: unknown[]) => void>()
    receiver.onEvent(events)
    const one = sender.request('probe', 0, 'accept', 'one')
    const two = receiver.request('probe', 0, 'accept', 'two')
    expect((await one).actionId).toBe('one')
    expect((await two).actionId).toBe('two')
    a.send({
      version: 1,
      type: 'REQUEST',
      actionId: 'one',
      kind: 'probe',
      delayMs: 0,
      decision: 'accept',
    })
    b.send({ version: 1, type: 'RESPONSE', actionId: 'one', delayMs: 0, accepted: true })
    await Promise.resolve()
    expect(receiver.received).toBe(1)
    expect(receiver.ignored).toBe(1)
    expect(sender.normal.responses).toBe(1)
    expect(sender.ignored).toBe(1)
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'received' }))
  })
  it('人工遅延・拒否・タイムアウトと遅着応答を分離する', async () => {
    vi.useFakeTimers()
    const { sender } = pair()
    const rejected = sender.request('card', 500, 'reject')
    await vi.advanceTimersByTimeAsync(500)
    expect((await rejected).status).toBe('rejected')
    expect(sender.artificial.samples).toEqual([500])
    expect(sender.normal.samples).toEqual([])
    const events = vi.fn<(...args: unknown[]) => void>()
    sender.onEvent(events)
    const late = sender.request('card', 4000, 'accept')
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    expect((await late).status).toBe('unknown')
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'result',
        result: expect.objectContaining({ status: 'accepted', late: true, rtt: 4000 }),
      }),
    )
    expect(sender.artificial.timeouts).toBe(1)
    expect(sender.artificial.responses).toBe(2)
    expect(sender.artificial.samples).toEqual([500])
    expect(sender.artificial.late).toBe(1)
  })
  it('応答なし・不一致応答は未確定、切断で保留を解放する', async () => {
    vi.useFakeTimers()
    const { a, b, sender } = pair()
    const unknown = sender.request('card', 0, 'drop', 'drop-one')
    b.send({ version: 1, type: 'RESPONSE', actionId: 'drop-one', delayMs: 0, accepted: true })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    expect((await unknown).status).toBe('unknown')
    expect(sender.ignored).toBe(1)
    a.close()
    expect(sender.running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('50回・100回を指定間隔で測定し、停止・破棄で追加送信しない', async () => {
    vi.useFakeTimers()
    const { sender } = pair()
    sender.start(50, 100)
    expect(sender.normal.sent).toBe(1)
    await vi.advanceTimersByTimeAsync(4_900)
    expect(sender.progress).toBe(50)
    expect(sender.running).toBe(false)
    expect(sender.normal.responses).toBe(50)
    sender.start(100, 20)
    await vi.advanceTimersByTimeAsync(1_980)
    expect(sender.normal.sent).toBe(150)
    expect(sender.normal.responses).toBe(150)
    sender.start(50, 100)
    sender.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sender.normal.sent).toBe(151)
    expect(() => sender.start(500, 0)).toThrow('回数')
    sender.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('接続終了はタイムアウトや拒否として数えず、要求を結果不明にする', async () => {
    const { a, sender } = pair()
    const pending = sender.request('card', 500)
    a.close()
    expect((await pending).status).toBe('unknown')
    expect(sender.artificial.timeouts).toBe(0)
    await expect(sender.request()).rejects.toThrow('接続')
  })
  it('バックグラウンドのタイマー抑制を想定し、時計で期限を再評価する', async () => {
    const [a, b] = FakeTransport.pair()
    let now = 0
    const sender = new DiagnosticSession(a, () => now)
    sessions.push(sender)
    const value = sender.request('probe', 0, 'accept', 'clock-one')
    now = 5_000
    b.send({ version: 1, type: 'RESPONSE', actionId: 'clock-one', delayMs: 0, accepted: true })
    expect((await value).status).toBe('unknown')
    expect(sender.normal.samples).toEqual([])
    expect(sender.normal.late).toBe(1)
  })
})

describe('有限の要求・サンプル管理', () => {
  it('同じactionIdで保留要求を上書きしない', async () => {
    const { sender } = pair()
    const first = sender.request('card', 500, 'accept', 'same')
    await expect(sender.request('card', 500, 'accept', 'same')).rejects.toThrow('既に送信')
    sender.dispose()
    expect((await first).status).toBe('unknown')
  })
  it('統計は直近1000件、件数はセッション全体を保持する', async () => {
    const { sender } = pair()
    for (let i = 0; i < 1005; i++) await sender.request()
    expect(sender.normal.samples).toHaveLength(1000)
    expect(sender.normal.sent).toBe(1005)
    expect(sender.normal.responses).toBe(1005)
  })
})

describe('復帰時の遅着応答保持期限', () => {
  it('タイマーが抑制されても保持期限を過ぎた応答を確定しない', async () => {
    const [a, b] = FakeTransport.pair()
    let now = 0
    const sender = new DiagnosticSession(a, () => now)
    sessions.push(sender)
    const pending = sender.request('probe', 0, 'accept', 'expired')
    now = REQUEST_TIMEOUT_MS + 60_000
    b.send({ version: 1, type: 'RESPONSE', actionId: 'expired', delayMs: 0, accepted: true })
    expect((await pending).status).toBe('unknown')
    expect(sender.normal.timeouts).toBe(1)
    expect(sender.normal.responses).toBe(0)
    expect(sender.normal.late).toBe(0)
    expect(sender.normal.samples).toEqual([])
    expect(sender.ignored).toBe(1)
  })
})
