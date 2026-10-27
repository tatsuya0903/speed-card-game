import type { WireMessage } from './protocol'
export type ConnectionState =
  | 'idle'
  | 'gathering'
  | 'awaiting-answer'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'
export type Unsubscribe = () => void
/** Vueや診断処理に依存しない、双方向メッセージ通信の最小境界。 */
export interface MessageTransport {
  readonly state: ConnectionState
  send(message: WireMessage): void
  onMessage(listener: (message: WireMessage) => void): Unsubscribe
  onState(listener: (state: ConnectionState) => void): Unsubscribe
  close(): void
}
