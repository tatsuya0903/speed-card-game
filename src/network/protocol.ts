export const MAX_SIGNAL_BYTES = 65_536
export const MAX_MESSAGE_BYTES = 2_048
export const PROTOCOL_VERSION = 1
export type Decision = 'accept' | 'reject' | 'drop'
export interface RequestMessage {
  version: 1
  type: 'REQUEST'
  actionId: string
  kind: 'probe' | 'card'
  delayMs: number
  decision: Decision
}
export interface ResponseMessage {
  version: 1
  type: 'RESPONSE'
  actionId: string
  accepted: boolean
  delayMs: number
}
export type WireMessage = RequestMessage | ResponseMessage
export interface SignalData {
  version: 1
  sessionId: string
  type: 'offer' | 'answer'
  sdp: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)
}
function parseJson(text: unknown, max: number): unknown {
  if (typeof text !== 'string') throw new Error('テキスト形式のデータを貼り付けてください。')
  if (text.length > max || new TextEncoder().encode(text).length > max)
    throw new Error(`データが大きすぎます。上限は${max}バイトです。`)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('JSONを読み取れません。先頭から末尾まで貼り付けてください。')
  }
}
export function parseSignal(text: string, expected: SignalData['type']): SignalData {
  const value = parseJson(text, MAX_SIGNAL_BYTES)
  if (!record(value) || value.version !== PROTOCOL_VERSION || !identifier(value.sessionId))
    throw new Error('接続情報のバージョンまたはセッションIDが不正です。再生成してください。')
  if (value.type !== expected)
    throw new Error(`${expected === 'offer' ? 'Offer' : 'Answer'}を貼り付けてください。`)
  if (
    Object.keys(value).sort().join(',') !== 'sdp,sessionId,type,version' ||
    typeof value.sdp !== 'string' ||
    !value.sdp.startsWith('v=0') ||
    !/^m=application /m.test(value.sdp) ||
    !/^a=ice-ufrag:.+/m.test(value.sdp) ||
    !/^a=ice-pwd:.+/m.test(value.sdp) ||
    !/^a=fingerprint:sha-256 /m.test(value.sdp) ||
    !/^a=sctp-port:\d+/m.test(value.sdp) ||
    !/^a=candidate:.+/m.test(value.sdp)
  )
    throw new Error('SDPまたはICE候補が不正・不足しています。接続情報を再生成してください。')
  return value as unknown as SignalData
}
export function encodeSignal(signal: SignalData): string {
  const text = JSON.stringify(signal)
  parseSignal(text, signal.type)
  return text
}
export function parseMessage(data: unknown): WireMessage {
  const value = parseJson(data, MAX_MESSAGE_BYTES)
  if (
    !record(value) ||
    value.version !== PROTOCOL_VERSION ||
    !identifier(value.actionId) ||
    !Number.isInteger(value.delayMs) ||
    (value.delayMs as number) < 0 ||
    (value.delayMs as number) > 10_000
  )
    throw new Error('不正な通信メッセージです。')
  if (
    value.type === 'REQUEST' &&
    Object.keys(value).sort().join(',') === 'actionId,decision,delayMs,kind,type,version' &&
    typeof value.decision === 'string' &&
    ['accept', 'reject', 'drop'].includes(value.decision) &&
    (value.kind === 'card' ||
      (value.kind === 'probe' && value.delayMs === 0 && value.decision === 'accept'))
  )
    return value as unknown as RequestMessage
  if (
    value.type === 'RESPONSE' &&
    Object.keys(value).sort().join(',') === 'accepted,actionId,delayMs,type,version' &&
    typeof value.accepted === 'boolean'
  )
    return value as unknown as ResponseMessage
  throw new Error('未対応の通信メッセージです。')
}
export function encodeMessage(message: WireMessage): string {
  const text = JSON.stringify(message)
  parseMessage(text)
  return text
}
