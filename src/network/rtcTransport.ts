import {
  encodeMessage,
  encodeSignal,
  parseMessage,
  parseSignal,
  type WireMessage,
} from './protocol'
import type { ConnectionState, MessageTransport } from './transport'

export const ICE_TIMEOUT_MS = 20_000
export const CONNECT_TIMEOUT_MS = 90_000
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export function waitForIce(
  pc: RTCPeerConnection,
  signal: AbortSignal,
  timeoutMs = ICE_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', change)
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    const change = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    const abort = () => finish(new Error('接続を中止しました。再生成してください。'))
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'ICE候補の収集がタイムアウトしました。ネットワークを確認して再生成してください。',
          ),
        ),
      timeoutMs,
    )
    pc.addEventListener('icegatheringstatechange', change)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else change()
  })
}

export class RtcTransport implements MessageTransport {
  state: ConnectionState = 'idle'
  error = ''
  invalidMessages = 0
  private pc: RTCPeerConnection | undefined
  private channel: RTCDataChannel | undefined
  private operation = new AbortController()
  private deadline: ReturnType<typeof setTimeout> | undefined
  private sessionId = ''
  private messages = new Set<(message: WireMessage) => void>()
  private states = new Set<(state: ConnectionState) => void>()
  constructor(
    private createPeer = () => {
      if (typeof RTCPeerConnection === 'undefined')
        throw new Error('WebRTCに対応したブラウザーで開いてください。')
      return new RTCPeerConnection(RTC_CONFIG)
    },
  ) {}
  onMessage(listener: (message: WireMessage) => void) {
    this.messages.add(listener)
    return () => {
      this.messages.delete(listener)
    }
  }
  onState(listener: (state: ConnectionState) => void) {
    this.states.add(listener)
    return () => {
      this.states.delete(listener)
    }
  }
  private setState(state: ConnectionState) {
    this.state = state
    this.states.forEach((listener) => listener(state))
  }
  private release() {
    this.operation.abort()
    clearTimeout(this.deadline)
    this.deadline = undefined
    if (this.channel) {
      this.channel.onopen =
        this.channel.onclose =
        this.channel.onerror =
        this.channel.onmessage =
          null
      this.channel.close()
      this.channel = undefined
    }
    if (this.pc) {
      this.pc.onconnectionstatechange =
        this.pc.oniceconnectionstatechange =
        this.pc.ondatachannel =
          null
      this.pc.close()
      this.pc = undefined
    }
  }
  private fail(message: string) {
    this.error = message
    this.release()
    this.setState('failed')
  }
  close() {
    this.release()
    this.setState('closed')
  }
  private begin() {
    this.release()
    this.operation = new AbortController()
    this.error = ''
    this.invalidMessages = 0
    let pc: RTCPeerConnection
    try {
      pc = this.createPeer()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'WebRTCを開始できません。')
      throw error
    }
    this.pc = pc
    pc.onconnectionstatechange = pc.oniceconnectionstatechange = () => {
      if (this.pc === pc) this.refreshState()
    }
    pc.ondatachannel = ({ channel }) => this.attachChannel(channel, pc)
    this.setState('gathering')
    return pc
  }
  private attachChannel(channel: RTCDataChannel, pc: RTCPeerConnection) {
    if (this.pc !== pc) {
      channel.close()
      return
    }
    if (
      this.channel ||
      channel.label !== 'speed-v1' ||
      !channel.ordered ||
      channel.maxRetransmits !== null ||
      channel.maxPacketLifeTime !== null
    ) {
      channel.close()
      this.fail('未対応のDataChannelです。接続情報を再生成してください。')
      return
    }
    this.channel = channel
    const current = () => this.pc === pc && this.channel === channel
    channel.onopen = () => {
      if (current()) this.refreshState()
    }
    channel.onclose = () => {
      if (current()) this.fail('相手が接続を終了しました。再生成して接続し直してください。')
    }
    channel.onerror = () => {
      if (current()) this.fail('DataChannelでエラーが発生しました。再生成してください。')
    }
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!current()) return
      let message: WireMessage
      try {
        message = parseMessage(data)
      } catch {
        this.invalidMessages++
        return
      }
      this.messages.forEach((listener) => listener(message))
    }
  }
  refreshState() {
    const pc = this.pc
    if (!pc) return
    if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
      this.fail(
        '直接接続できませんでした。TURNは使用していません。別のネットワークで接続情報を再生成してください。',
      )
    } else if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') {
      this.setState('disconnected')
      this.armDeadline()
    } else if (pc.connectionState === 'connected' && this.channel?.readyState === 'open') {
      clearTimeout(this.deadline)
      this.deadline = undefined
      this.setState('connected')
    }
  }
  private armDeadline() {
    if (this.deadline) return
    const pc = this.pc
    this.deadline = setTimeout(() => {
      if (this.pc === pc)
        this.fail('接続待機がタイムアウトしました。双方で接続情報を再生成してください。')
    }, CONNECT_TIMEOUT_MS)
  }
  private assertCurrent(pc: RTCPeerConnection, signal: AbortSignal) {
    if (signal.aborted || this.pc !== pc) throw new Error('接続操作は中止されました。')
  }
  private async localDescription(
    pc: RTCPeerConnection,
    type: 'offer' | 'answer',
    signal: AbortSignal,
  ) {
    this.assertCurrent(pc, signal)
    const description = type === 'offer' ? await pc.createOffer() : await pc.createAnswer()
    this.assertCurrent(pc, signal)
    await pc.setLocalDescription(description)
    this.assertCurrent(pc, signal)
    await waitForIce(pc, signal)
    this.assertCurrent(pc, signal)
    const sdp = pc.localDescription?.sdp
    if (!sdp) throw new Error('接続情報を生成できませんでした。')
    return encodeSignal({ version: 1, sessionId: this.sessionId, type, sdp })
  }
  async createOffer() {
    const pc = this.begin()
    this.sessionId = crypto.randomUUID()
    const signal = this.operation.signal
    try {
      this.attachChannel(pc.createDataChannel('speed-v1', { ordered: true }), pc)
      const text = await this.localDescription(pc, 'offer', signal)
      this.assertCurrent(pc, signal)
      this.setState('awaiting-answer')
      this.armDeadline()
      return text
    } catch (error) {
      if (!signal.aborted)
        this.fail(error instanceof Error ? error.message : 'Offerの生成に失敗しました。')
      throw error
    }
  }
  async createAnswer(text: string) {
    const offer = parseSignal(text, 'offer')
    const pc = this.begin()
    this.sessionId = offer.sessionId
    const signal = this.operation.signal
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp })
      this.assertCurrent(pc, signal)
      const answer = await this.localDescription(pc, 'answer', signal)
      this.assertCurrent(pc, signal)
      this.setState('connecting')
      this.armDeadline()
      this.refreshState()
      return answer
    } catch (error) {
      if (!signal.aborted)
        this.fail(error instanceof Error ? error.message : 'Answerの生成に失敗しました。')
      throw error
    }
  }
  async acceptAnswer(text: string) {
    if (this.state !== 'awaiting-answer' || !this.pc)
      throw new Error('先に新しいOfferを生成してください。')
    const answer = parseSignal(text, 'answer')
    if (answer.sessionId !== this.sessionId)
      throw new Error('別の接続のAnswerです。今回のOfferに対するAnswerを貼り付けてください。')
    const pc = this.pc
    const signal = this.operation.signal
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
      if (signal.aborted || this.pc !== pc) return
      this.setState('connecting')
      this.refreshState()
    } catch {
      if (!signal.aborted) this.fail('Answerを適用できません。双方で接続情報を再生成してください。')
    }
  }
  send(message: WireMessage) {
    const data = encodeMessage(message)
    if (this.state !== 'connected' || this.channel?.readyState !== 'open')
      throw new Error('接続されていません。')
    if (this.channel.bufferedAmount > 65_536)
      throw new Error('送信待ちデータが多すぎます。少し待ってください。')
    this.channel.send(data)
  }
  async candidateTypes(): Promise<string> {
    const pc = this.pc
    if (!pc || this.state !== 'connected') return '未取得'
    try {
      const stats = await pc.getStats()
      if (this.pc !== pc || this.state !== 'connected') return '未取得'
      let pair: { localCandidateId?: string; remoteCandidateId?: string } | undefined
      stats.forEach((stat) => {
        if (stat.type === 'transport' && stat.selectedCandidatePairId)
          pair = stats.get(stat.selectedCandidatePairId)
      })
      if (!pair)
        stats.forEach((stat) => {
          if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded')
            pair = stat
        })
      const local = pair?.localCandidateId
        ? (stats.get(pair.localCandidateId)?.candidateType as string | undefined)
        : undefined
      const remote = pair?.remoteCandidateId
        ? (stats.get(pair.remoteCandidateId)?.candidateType as string | undefined)
        : undefined
      return `${local ?? '不明'} ↔ ${remote ?? '不明'}`
    } catch {
      return '取得不可（ブラウザー制限）'
    }
  }
}
