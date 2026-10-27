import { onScopeDispose, ref } from 'vue'
import type { RequestResult } from '@/diagnostics/session'
export type CardStage =
  'idle' | 'moving' | 'waiting' | 'unknown' | 'committing' | 'returning' | 'accepted' | 'rejected'
export function useCardAnimation(now = () => performance.now()) {
  const stage = ref<CardStage>('idle')
  const duration = ref(200)
  const approachMs = ref<number | null>(null)
  const finishMs = ref<number | null>(null)
  const totalMs = ref<number | null>(null)
  let id = '',
    started = 0,
    outcome: RequestResult['status'] | undefined
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  let finishTimer: ReturnType<typeof setTimeout> | undefined
  function settle() {
    if (outcome === 'unknown') {
      stage.value = 'unknown'
      return
    }
    if (!outcome) {
      stage.value = 'waiting'
      return
    }
    const accepted = outcome === 'accepted'
    stage.value = accepted ? 'committing' : 'returning'
    const finishStart = now()
    finishTimer = setTimeout(
      () => {
        finishMs.value = now() - finishStart
        totalMs.value = now() - started
        stage.value = accepted ? 'accepted' : 'rejected'
      },
      duration.value === 0 ? 0 : accepted ? 60 : 120,
    )
  }
  function reset() {
    clearTimeout(moveTimer)
    clearTimeout(finishTimer)
    id = ''
    outcome = undefined
    stage.value = 'idle'
    approachMs.value = finishMs.value = totalMs.value = null
  }
  function start(actionId: string, ms: number, reduced: boolean) {
    reset()
    id = actionId
    started = now()
    duration.value = reduced ? 0 : ms
    stage.value = 'moving'
    moveTimer = setTimeout(() => {
      approachMs.value = now() - started
      settle()
    }, duration.value)
  }
  function result(value: RequestResult) {
    if (
      value.actionId !== id ||
      ['accepted', 'rejected', 'committing', 'returning'].includes(stage.value)
    )
      return
    outcome = value.status
    if (stage.value !== 'moving') settle()
  }
  onScopeDispose(reset)
  return { stage, duration, approachMs, finishMs, totalMs, start, result, reset }
}
