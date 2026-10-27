import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCardAnimation } from './useCardAnimation'
function animation() {
  const scope = effectScope()
  const card = scope.run(() => useCardAnimation())!
  return { card, scope }
}
afterEach(() => {
  vi.useRealTimers()
})
describe('通信と独立した擬似カード演出', () => {
  it.each([100, 200, 300])('早い応答でも前進%smsを継続する', async (duration) => {
    vi.useFakeTimers()
    const { card, scope } = animation()
    card.start('one', duration, false)
    card.result({ actionId: 'one', status: 'accepted', rtt: 5, late: false })
    await vi.advanceTimersByTimeAsync(duration - 1)
    expect(card.stage.value).toBe('moving')
    await vi.advanceTimersByTimeAsync(1)
    expect(card.stage.value).toBe('committing')
    await vi.advanceTimersByTimeAsync(60)
    expect(card.stage.value).toBe('accepted')
    expect(card.approachMs.value).toBe(duration)
    expect(card.totalMs.value).toBe(duration + 60)
    scope.stop()
  })
  it('遅延は直前で待機し、拒否で戻る。別actionIdを混同しない', async () => {
    vi.useFakeTimers()
    const { card, scope } = animation()
    card.start('one', 200, false)
    await vi.advanceTimersByTimeAsync(500)
    expect(card.stage.value).toBe('waiting')
    card.result({ actionId: 'other', status: 'accepted', rtt: 500, late: false })
    expect(card.stage.value).toBe('waiting')
    card.result({ actionId: 'one', status: 'rejected', rtt: 500, late: false })
    expect(card.stage.value).toBe('returning')
    await vi.advanceTimersByTimeAsync(120)
    expect(card.stage.value).toBe('rejected')
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('タイムアウトは結果不明。遅着の成功で確定できる', async () => {
    vi.useFakeTimers()
    const { card, scope } = animation()
    card.start('one', 200, false)
    await vi.advanceTimersByTimeAsync(3000)
    card.result({ actionId: 'one', status: 'unknown', rtt: null, late: false })
    expect(card.stage.value).toBe('unknown')
    card.result({ actionId: 'one', status: 'accepted', rtt: 4000, late: true })
    await vi.advanceTimersByTimeAsync(60)
    expect(card.stage.value).toBe('accepted')
    scope.stop()
  })
  it('低減モーションとスコープ終了を処理する', async () => {
    vi.useFakeTimers()
    const { card, scope } = animation()
    card.start('one', 300, true)
    expect(card.duration.value).toBe(0)
    card.result({ actionId: 'one', status: 'accepted', rtt: 0, late: false })
    await vi.runAllTimersAsync()
    expect(card.stage.value).toBe('accepted')
    card.start('two', 300, false)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
