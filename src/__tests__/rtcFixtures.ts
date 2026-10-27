import type { SignalData } from '@/network/protocol'
export const fixtureSdp =
  'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:abcd\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=fingerprint:sha-256 AA:BB\r\na=sctp-port:5000\r\na=candidate:1 1 udp 1 192.0.2.1 1234 typ host\r\n'
export const fixtureSignal: SignalData = {
  version: 1,
  sessionId: 'test-session',
  type: 'offer',
  sdp: fixtureSdp,
}
