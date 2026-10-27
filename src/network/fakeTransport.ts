import { parseMessage, encodeMessage, type WireMessage } from './protocol'
import type { ConnectionState, MessageTransport } from './transport'
/** ローカル診断と安定した自動テスト専用。ネットワークのRTTではない。 */
export class FakeTransport implements MessageTransport {
  state: ConnectionState = 'connected'
  peer?: FakeTransport
  private messages = new Set<(message: WireMessage) => void>()
  private states = new Set<(state: ConnectionState) => void>()
  static pair(): [FakeTransport, FakeTransport] {
    const a = new FakeTransport(),
      b = new FakeTransport()
    a.peer = b
    b.peer = a
    return [a, b]
  }
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
  send(message: WireMessage) {
    const parsed = parseMessage(encodeMessage(message))
    if (this.state !== 'connected' || this.peer?.state !== 'connected')
      throw new Error('接続されていません。')
    // 実際のDataChannelと同じく送信呼び出しの外で配信する。
    queueMicrotask(() => {
      if (this.state === 'connected' && this.peer?.state === 'connected')
        this.peer.messages.forEach((listener) => listener(parsed))
    })
  }
  close() {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.states.forEach((listener) => listener(this.state))
    this.peer?.close()
  }
}
