import { describe, expect, it } from 'vitest'
import {
  encodeMessage,
  encodeSignal,
  MAX_SIGNAL_BYTES,
  parseMessage,
  parseSignal,
} from './protocol'
import { fixtureSdp, fixtureSignal } from '@/__tests__/rtcFixtures'
describe('手動シグナリング・メッセージのランタイム検証', () => {
  it('収集済みOfferとAnswerを往復し、空白を許容する', () => {
    for (const type of ['offer', 'answer'] as const) {
      const value = { ...fixtureSignal, type }
      expect(parseSignal(` ${encodeSignal(value)} \n`, type)).toEqual(value)
    }
  })
  it.each([
    '',
    '{',
    '[]',
    'null',
    JSON.stringify({ ...fixtureSignal, version: 2 }),
    JSON.stringify({ ...fixtureSignal, sessionId: '<script>' }),
    JSON.stringify({ ...fixtureSignal, extra: true }),
    JSON.stringify({ ...fixtureSignal, sdp: 'v=0\r\n' }),
    JSON.stringify({ ...fixtureSignal, sdp: fixtureSdp.replace('a=candidate:', 'a=missing:') }),
    'a'.repeat(MAX_SIGNAL_BYTES + 1),
    'あ'.repeat(MAX_SIGNAL_BYTES / 2),
  ])('不正な接続情報を拒否する（%#）', (text) => {
    expect(() => parseSignal(text, 'offer')).toThrow(Error)
  })
  it('種別の取り違えを説明する', () => {
    expect(() => parseSignal(encodeSignal(fixtureSignal), 'answer')).toThrow('Answer')
  })
  it('送信・受信両方のメッセージを検証する', () => {
    const request = {
      version: 1,
      type: 'REQUEST',
      actionId: 'a-1',
      kind: 'probe',
      delayMs: 0,
      decision: 'accept',
    } as const
    expect(parseMessage(encodeMessage(request))).toEqual(request)
    const response = {
      version: 1,
      type: 'RESPONSE',
      actionId: 'a-1',
      delayMs: 0,
      accepted: true,
    } as const
    expect(parseMessage(encodeMessage(response))).toEqual(response)
    for (const value of [
      null,
      new ArrayBuffer(2),
      '{}',
      'x'.repeat(2049),
      JSON.stringify({ ...request, delayMs: -1 }),
      JSON.stringify({ ...request, version: 2 }),
      JSON.stringify({ ...request, kind: 'card', decision: ['accept'] }),
      JSON.stringify({ ...request, kind: 'card', decision: ['reject'] }),
      JSON.stringify({ ...request, delayMs: 1 }),
      JSON.stringify({ ...response, accepted: 'true' }),
      JSON.stringify({ ...request, extra: 1 }),
    ])
      expect(() => parseMessage(value)).toThrow(Error)
  })
})
