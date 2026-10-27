import type { Decision, RequestMessage, ResponseMessage, WireMessage } from '@/network/protocol'
import type { MessageTransport } from '@/network/transport'
export const REQUEST_TIMEOUT_MS = 3_000
export const LATE_RESPONSE_MS = 60_000
export const MAX_TRACKED = 256
export const SAMPLE_LIMIT = 1_000
export interface RequestResult {
  actionId: string
  status: 'accepted' | 'rejected' | 'unknown'
  rtt: number | null
  late: boolean
}
export interface Series {
  sent: number
  responses: number
  timeouts: number
  late: number
  samples: number[]
}
interface Pending {
  request: RequestMessage
  start: number
  timedOut: boolean
  timer: ReturnType<typeof setTimeout>
  expire?: ReturnType<typeof setTimeout>
  resolve: (result: RequestResult) => void
}
export type SessionEvent =
  | { type: 'received'; request: RequestMessage }
  | { type: 'result'; result: RequestResult }
  | { type: 'changed' }
const emptySeries = (): Series => ({ sent: 0, responses: 0, timeouts: 0, late: 0, samples: [] })
export class DiagnosticSession {
  normal = emptySeries()
  artificial = emptySeries()
  received = 0
  ignored = 0
  running = false
  progress = 0
  private pending = new Map<string, Pending>()
  private seen = new Set<string>()
  private replyTimers = new Set<ReturnType<typeof setTimeout>>()
  private listeners = new Set<(event: SessionEvent) => void>()
  private unsubscribe: (() => void)[]
  private batchTimer?: ReturnType<typeof setTimeout>
  private disposed = false
  constructor(
    readonly transport: MessageTransport,
    private now = () => performance.now(),
    private timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    this.unsubscribe = [
      transport.onMessage((message) => this.receive(message)),
      transport.onState((state) => {
        if (state !== 'connected') {
          this.stop()
          this.markUnknown()
        }
      }),
    ]
  }
  onEvent(listener: (event: SessionEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit(event: SessionEvent) {
    this.listeners.forEach((listener) => listener(event))
  }
  private series(request: RequestMessage) {
    return request.delayMs > 0 ? this.artificial : this.normal
  }
  request(
    kind: 'probe' | 'card' = 'probe',
    delayMs = 0,
    decision: Decision = 'accept',
    actionId: string = crypto.randomUUID(),
  ): Promise<RequestResult> {
    if (this.disposed || this.transport.state !== 'connected')
      return Promise.reject(new Error('接続されていません。'))
    if (this.pending.has(actionId))
      return Promise.reject(new Error('同じactionIdの要求は既に送信されています。'))
    if (this.pending.size >= MAX_TRACKED)
      return Promise.reject(new Error('未確定の要求が多すぎます。待つか接続し直してください。'))
    const request: RequestMessage = {
      version: 1,
      type: 'REQUEST',
      actionId,
      kind,
      delayMs,
      decision,
    }
    const start = this.now()
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        request,
        start,
        timedOut: false,
        resolve,
        timer: setTimeout(() => this.timeout(actionId), this.timeoutMs),
      }
      this.pending.set(actionId, pending)
      try {
        this.transport.send(request)
      } catch (error) {
        clearTimeout(pending.timer)
        this.pending.delete(actionId)
        reject(error)
        return
      }
      this.series(request).sent++
      this.emit({ type: 'changed' })
    })
  }
  private timeout(actionId: string) {
    const pending = this.pending.get(actionId)
    if (!pending || pending.timedOut) return
    pending.timedOut = true
    this.series(pending.request).timeouts++
    const result: RequestResult = { actionId, status: 'unknown', rtt: null, late: false }
    pending.resolve(result)
    // 遅着応答のために有限時間だけ保持。タイムアウトを拒否とは扱わない。
    const remaining = Math.max(0, this.timeoutMs + LATE_RESPONSE_MS - (this.now() - pending.start))
    pending.expire = setTimeout(() => this.pending.delete(actionId), remaining)
    this.emit({ type: 'result', result })
  }
  private receive(message: WireMessage) {
    if (this.disposed) return
    if (message.type === 'REQUEST') {
      if (this.seen.has(message.actionId) || this.replyTimers.size >= MAX_TRACKED) {
        this.ignored++
        this.emit({ type: 'changed' })
        return
      }
      this.seen.add(message.actionId)
      if (this.seen.size > 2_048) this.seen.delete(this.seen.values().next().value!)
      this.received++
      this.emit({ type: 'received', request: message })
      if (message.decision === 'drop') return
      const respond = () => {
        if (this.disposed || this.transport.state !== 'connected') return
        try {
          this.transport.send({
            version: 1,
            type: 'RESPONSE',
            actionId: message.actionId,
            accepted: message.decision === 'accept',
            delayMs: message.delayMs,
          })
        } catch {
          /* 接続状態はtransportが通知。相手はタイムアウトを処理する。 */
        }
      }
      if (!message.delayMs) respond()
      else {
        const timer = setTimeout(() => {
          this.replyTimers.delete(timer)
          respond()
        }, message.delayMs)
        this.replyTimers.add(timer)
      }
    } else this.response(message)
  }
  private response(message: ResponseMessage) {
    const pending = this.pending.get(message.actionId)
    if (
      !pending ||
      pending.request.delayMs !== message.delayMs ||
      pending.request.decision === 'drop' ||
      message.accepted !== (pending.request.decision === 'accept')
    ) {
      this.ignored++
      this.emit({ type: 'changed' })
      return
    }
    // タイマー抑制されたバックグラウンドからの復帰でも期限超過を認識する。
    const elapsed = this.now() - pending.start
    if (!pending.timedOut && elapsed >= this.timeoutMs) this.timeout(message.actionId)
    if (elapsed >= this.timeoutMs + LATE_RESPONSE_MS) {
      clearTimeout(pending.timer)
      clearTimeout(pending.expire)
      this.pending.delete(message.actionId)
      this.ignored++
      this.emit({ type: 'changed' })
      return
    }
    clearTimeout(pending.timer)
    clearTimeout(pending.expire)
    this.pending.delete(message.actionId)
    const series = this.series(pending.request)
    series.responses++
    if (pending.timedOut) series.late++
    else {
      series.samples.push(elapsed)
      if (series.samples.length > SAMPLE_LIMIT) series.samples.shift()
    }
    const result: RequestResult = {
      actionId: message.actionId,
      status: message.accepted ? 'accepted' : 'rejected',
      rtt: elapsed,
      late: pending.timedOut,
    }
    pending.resolve(result)
    this.emit({ type: 'result', result })
  }
  start(count: number, intervalMs: number) {
    if (this.running || this.disposed || this.transport.state !== 'connected')
      throw new Error('連続測定を開始できません。')
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100 ||
      !Number.isFinite(intervalMs) ||
      intervalMs < 20 ||
      intervalMs > 10_000
    )
      throw new Error('回数は1〜100、間隔は20〜10000msです。')
    this.running = true
    this.progress = 0
    const next = () => {
      if (!this.running) return
      // 一定送信間隔。応答を待たず、負荷の変化を観測できる。
      this.request().catch(() => this.stop())
      this.progress++
      if (this.progress < count && this.running) this.batchTimer = setTimeout(next, intervalMs)
      else this.running = false
      this.emit({ type: 'changed' })
    }
    next()
  }
  stop() {
    clearTimeout(this.batchTimer)
    this.running = false
    this.emit({ type: 'changed' })
  }
  private markUnknown() {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      clearTimeout(pending.expire)
      const result: RequestResult = { actionId: id, status: 'unknown', rtt: null, late: false }
      pending.resolve(result)
      this.emit({ type: 'result', result })
    }
    this.pending.clear()
    this.replyTimers.forEach(clearTimeout)
    this.replyTimers.clear()
  }
  dispose() {
    this.disposed = true
    this.stop()
    this.markUnknown()
    this.unsubscribe.forEach((off) => off())
    this.listeners.clear()
  }
}
