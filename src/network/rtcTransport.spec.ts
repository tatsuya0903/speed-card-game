import { afterEach, describe, expect, it, vi } from 'vitest'
import { RtcTransport, waitForIce, ICE_TIMEOUT_MS, CONNECT_TIMEOUT_MS } from './rtcTransport'
import { encodeSignal, type WireMessage } from './protocol'
import { fixtureSdp, fixtureSignal } from '@/__tests__/rtcFixtures'
class Peer extends EventTarget {
  iceGatheringState = 'complete'
  connectionState = 'new'
  iceConnectionState = 'new'
  localDescription: { sdp: string } | null = null
  onconnectionstatechange: (() => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null
  closed = false
  createOffer = vi.fn<() => Promise<unknown>>(async () => ({ type: 'offer', sdp: fixtureSdp }))
  createAnswer = vi.fn<() => Promise<unknown>>(async () => ({ type: 'answer', sdp: fixtureSdp }))
  setLocalDescription = vi.fn<() => Promise<unknown>>(async () => {
    this.localDescription = { sdp: fixtureSdp }
  })
  setRemoteDescription = vi.fn<() => Promise<unknown>>(async () => {})
  channel = {
    label: 'speed-v1',
    ordered: true,
    maxRetransmits: null,
    maxPacketLifeTime: null,
    readyState: 'connecting',
    bufferedAmount: 0,
    onopen: null as null | (() => void),
    onclose: null as null | (() => void),
    onerror: null as null | (() => void),
    onmessage: null as null | ((event: { data: unknown }) => void),
    send: vi.fn<(data: string) => void>(),
    close: vi.fn<() => void>(),
  }
  createDataChannel = vi.fn<() => RTCDataChannel>(() => this.channel as unknown as RTCDataChannel)
  close() {
    this.closed = true
  }
  rtc() {
    return this as unknown as RTCPeerConnection
  }
}
afterEach(() => {
  vi.useRealTimers()
})
describe('ICE待機', () => {
  it('完了時に解決し、イベント処理を除去する', async () => {
    const pc = new Peer()
    pc.iceGatheringState = 'gathering'
    const remove = vi.spyOn(pc, 'removeEventListener')
    const waiting = waitForIce(pc.rtc(), new AbortController().signal)
    pc.iceGatheringState = 'complete'
    pc.dispatchEvent(new Event('icegatheringstatechange'))
    await waiting
    expect(remove).toHaveBeenCalled()
  })
  it('期限超過と中止を区別し、タイマーを残さない', async () => {
    vi.useFakeTimers()
    const pc = new Peer()
    pc.iceGatheringState = 'gathering'
    const waiting = waitForIce(pc.rtc(), new AbortController().signal).catch(
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(ICE_TIMEOUT_MS)
    expect(await waiting).toMatchObject({ message: expect.stringContaining('タイムアウト') })
    const abort = new AbortController()
    const canceled = waitForIce(pc.rtc(), abort.signal).catch((error: unknown) => error)
    abort.abort()
    expect(await canceled).toMatchObject({ message: expect.stringContaining('中止') })
    expect(vi.getTimerCount()).toBe(0)
  })
})
describe('RTCPeerConnectionのライフサイクル（モック）', () => {
  it('収集完了後だけOfferを返し、ordered/reliableチャネルを生成する', async () => {
    const peer = new Peer()
    peer.iceGatheringState = 'gathering'
    const rtc = new RtcTransport(() => peer.rtc())
    const result = rtc.createOffer()
    await vi.waitFor(() => expect(peer.localDescription).not.toBeNull())
    expect(rtc.state).toBe('gathering')
    peer.iceGatheringState = 'complete'
    peer.dispatchEvent(new Event('icegatheringstatechange'))
    const offer = JSON.parse(await result) as typeof fixtureSignal
    expect(offer.sdp).toContain('a=candidate:')
    expect(peer.createDataChannel).toHaveBeenCalledWith('speed-v1', { ordered: true })
    expect(rtc.state).toBe('awaiting-answer')
    await expect(
      rtc.acceptAnswer(encodeSignal({ ...fixtureSignal, type: 'answer' })),
    ).rejects.toThrow('別の接続')
    await rtc.acceptAnswer(encodeSignal({ ...offer, type: 'answer' }))
    expect(rtc.state).toBe('connecting')
    peer.connectionState = 'connected'
    peer.channel.readyState = 'open'
    peer.onconnectionstatechange?.()
    expect(rtc.state).toBe('connected')
    const receive = vi.fn<(message: WireMessage) => void>()
    rtc.onMessage(receive)
    peer.channel.onmessage?.({ data: '{}' })
    expect(rtc.invalidMessages).toBe(1)
    const message: WireMessage = {
      version: 1,
      type: 'RESPONSE',
      actionId: 'one',
      accepted: true,
      delayMs: 0,
    }
    peer.channel.onmessage?.({ data: JSON.stringify(message) })
    expect(receive).toHaveBeenCalledWith(message)
    rtc.send(message)
    expect(peer.channel.send).toHaveBeenCalledWith(JSON.stringify(message))
    peer.connectionState = 'disconnected'
    peer.onconnectionstatechange?.()
    expect(rtc.state).toBe('disconnected')
    peer.connectionState = 'connected'
    peer.onconnectionstatechange?.()
    expect(rtc.state).toBe('connected')
    rtc.close()
    expect(rtc.state).toBe('closed')
    expect(peer.closed).toBe(true)
    expect(peer.channel.onmessage).toBeNull()
    expect(peer.onconnectionstatechange).toBeNull()
  })
  it('ゲストがAnswerを生成し、予期しないチャネルを拒否する', async () => {
    const peer = new Peer(),
      rtc = new RtcTransport(() => peer.rtc())
    const answer = JSON.parse(
      await rtc.createAnswer(encodeSignal(fixtureSignal)),
    ) as typeof fixtureSignal
    expect(answer.sessionId).toBe(fixtureSignal.sessionId)
    expect(answer.type).toBe('answer')
    peer.channel.ordered = false
    peer.ondatachannel?.({ channel: peer.channel as unknown as RTCDataChannel })
    expect(rtc.state).toBe('failed')
    expect(peer.closed).toBe(true)
  })
  it('収集タイムアウト・再試行・接続期限・リソース解放', async () => {
    vi.useFakeTimers()
    const first = new Peer()
    first.iceGatheringState = 'gathering'
    const second = new Peer()
    const rtc = new RtcTransport(
      vi
        .fn<() => RTCPeerConnection>()
        .mockReturnValueOnce(first.rtc())
        .mockReturnValueOnce(second.rtc()),
    )
    const waiting = rtc.createOffer().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(ICE_TIMEOUT_MS)
    expect(await waiting).toMatchObject({ message: expect.stringContaining('ICE候補') })
    expect(rtc.state).toBe('failed')
    expect(first.closed).toBe(true)
    await rtc.createOffer()
    expect(rtc.state).toBe('awaiting-answer')
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS)
    expect(rtc.state).toBe('failed')
    expect(second.closed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('収集中の中止は古い操作を復活させない', async () => {
    const peer = new Peer()
    peer.iceGatheringState = 'gathering'
    const rtc = new RtcTransport(() => peer.rtc())
    const waiting = rtc.createOffer().catch((error: unknown) => error)
    await vi.waitFor(() => expect(peer.localDescription).not.toBeNull())
    rtc.close()
    expect(await waiting).toMatchObject({ message: expect.stringContaining('中止') })
    expect(rtc.state).toBe('closed')
    expect(peer.closed).toBe(true)
  })
})

describe('ブラウザー初期化失敗', () => {
  it('PeerConnection生成失敗もfailed状態として通知する', async () => {
    const rtc = new RtcTransport(() => {
      throw new Error('WebRTCを開始できません。')
    })
    await expect(rtc.createOffer()).rejects.toThrow('開始できません')
    expect(rtc.state).toBe('failed')
  })
})

describe('古い非同期処理とイベントの隔離', () => {
  it.each(['offer', 'answer'] as const)(
    '%s生成の完了直後の再試行でも旧状態を復活させない',
    async (type) => {
      vi.useFakeTimers()
      const first = new Peer(),
        second = new Peer()
      const rtc = new RtcTransport(
        vi
          .fn<() => RTCPeerConnection>()
          .mockReturnValueOnce(first.rtc())
          .mockReturnValueOnce(second.rtc()),
      )
      let retried: Promise<string> | undefined
      first.setLocalDescription.mockResolvedValue(undefined)
      Object.defineProperty(first, 'localDescription', {
        get() {
          // 収集完了確認と呼び出し元のawait再開との境界で再試行する。
          void Promise.resolve().then(() => {
            retried = rtc.createOffer()
          })
          return { sdp: fixtureSdp }
        },
      })
      const old = (
        type === 'offer' ? rtc.createOffer() : rtc.createAnswer(encodeSignal(fixtureSignal))
      ).catch((error: unknown) => error)
      expect(await old).toMatchObject({ message: expect.stringContaining('中止') })
      expect(retried).toBeDefined()
      await retried
      expect(rtc.state).toBe('awaiting-answer')
      expect(first.closed).toBe(true)
      expect(second.closed).toBe(false)
      rtc.close()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('古いSDP生成の完了後に終了済みPeerへ書き込まない', async () => {
    vi.useFakeTimers()
    const first = new Peer(),
      second = new Peer()
    let resolveOffer!: (value: unknown) => void
    first.createOffer.mockReturnValue(
      new Promise((resolve) => {
        resolveOffer = resolve
      }),
    )
    const rtc = new RtcTransport(
      vi
        .fn<() => RTCPeerConnection>()
        .mockReturnValueOnce(first.rtc())
        .mockReturnValueOnce(second.rtc()),
    )
    const old = rtc.createOffer().catch((error: unknown) => error)
    await rtc.createOffer()
    resolveOffer({ type: 'offer', sdp: fixtureSdp })
    expect(await old).toMatchObject({ message: expect.stringContaining('中止') })
    expect(first.setLocalDescription).not.toHaveBeenCalled()
    expect(rtc.state).toBe('awaiting-answer')
    rtc.close()
  })

  it('解放済みチャネルの遅いイベントは新しい接続・計数に影響しない', async () => {
    const first = new Peer(),
      second = new Peer()
    const rtc = new RtcTransport(
      vi
        .fn<() => RTCPeerConnection>()
        .mockReturnValueOnce(first.rtc())
        .mockReturnValueOnce(second.rtc()),
    )
    await rtc.createOffer()
    const oldClose = first.channel.onclose,
      oldError = first.channel.onerror,
      oldMessage = first.channel.onmessage,
      oldData = first.ondatachannel
    await rtc.createOffer()
    oldClose?.()
    oldError?.()
    oldMessage?.({ data: '{}' })
    const orphan = new Peer().channel
    oldData?.({ channel: orphan as unknown as RTCDataChannel })
    expect(orphan.close).toHaveBeenCalledOnce()
    expect(rtc.invalidMessages).toBe(0)
    expect(rtc.state).toBe('awaiting-answer')
    expect(second.closed).toBe(false)
    rtc.close()
  })

  it('候補情報の取得中に切断した場合は古い候補を表示しない', async () => {
    const peer = new Peer()
    let resolveStats!: (value: RTCStatsReport) => void
    Object.assign(peer, {
      getStats: () =>
        new Promise<RTCStatsReport>((resolve) => {
          resolveStats = resolve
        }),
    })
    const rtc = new RtcTransport(() => peer.rtc())
    await rtc.createOffer()
    peer.connectionState = 'connected'
    peer.channel.readyState = 'open'
    rtc.refreshState()
    const candidates = rtc.candidateTypes()
    peer.connectionState = 'disconnected'
    rtc.refreshState()
    resolveStats(new Map() as unknown as RTCStatsReport)
    expect(await candidates).toBe('未取得')
    rtc.close()
  })
})
