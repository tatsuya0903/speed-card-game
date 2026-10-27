<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, watch } from 'vue'
import { useClipboard, useDocumentVisibility, useEventListener } from '@vueuse/core'
import DiagnosticPanel from '@/components/DiagnosticPanel.vue'
import { RtcTransport } from '@/network/rtcTransport'
import { FakeTransport } from '@/network/fakeTransport'
import { DiagnosticSession } from '@/diagnostics/session'
import type { ConnectionState, MessageTransport } from '@/network/transport'
const rtc = markRaw(new RtcTransport())
const transport = ref<MessageTransport>()
const state = ref<ConnectionState>('idle')
const role = ref<'host' | 'guest' | 'fake'>()
const outgoing = ref(''),
  incoming = ref(''),
  error = ref(''),
  copyMessage = ref('')
const candidates = ref('未取得'),
  resumeMessage = ref('')
const everConnected = ref(false),
  busy = ref(false)
const { copy, isSupported } = useClipboard()
const visibility = useDocumentVisibility()
let operationId = 0
let candidateRequestId = 0
let fakePeer: DiagnosticSession | undefined
let offState: (() => void) | undefined
const stateLabel = computed(
  () =>
    ({
      idle: '未接続',
      gathering: 'ICE候補を収集中',
      'awaiting-answer': 'Answer待ち',
      connecting: '接続を確認中',
      connected: '接続済み',
      disconnected: '一時切断',
      failed: '接続失敗',
      closed: '終了',
    })[state.value],
)
function end() {
  operationId++
  busy.value = false
  fakePeer?.dispose()
  fakePeer = undefined
  transport.value?.close()
  rtc.close()
  offState?.()
  offState = undefined
  transport.value = undefined
  state.value = 'closed'
  everConnected.value = false
  outgoing.value = incoming.value = ''
  copyMessage.value = ''
  candidates.value = '未取得'
}
function bind(value: MessageTransport) {
  transport.value = markRaw(value)
  state.value = value.state
  offState = value.onState((next) => {
    state.value = next
    if (next === 'connected') {
      everConnected.value = true
      void refreshCandidates()
    } else {
      candidateRequestId++
      candidates.value = '未取得'
    }
    if (next === 'closed' || next === 'failed') outgoing.value = ''
    if (rtc.error && role.value !== 'fake') error.value = rtc.error
  })
}
async function refreshCandidates() {
  const requestId = ++candidateRequestId,
    operation = operationId,
    active = transport.value
  const value = role.value === 'fake' ? '模擬（ネットワークなし）' : await rtc.candidateTypes()
  if (
    requestId === candidateRequestId &&
    operation === operationId &&
    active === transport.value &&
    state.value === 'connected'
  )
    candidates.value = value
}
async function perform(action: () => Promise<string | void>) {
  const current = ++operationId
  busy.value = true
  error.value = ''
  copyMessage.value = ''
  try {
    const result = await action()
    if (current === operationId && typeof result === 'string') outgoing.value = result
  } catch (e) {
    if (current === operationId)
      error.value = e instanceof Error ? e.message : '接続操作に失敗しました。再生成してください。'
  } finally {
    if (current === operationId) busy.value = false
  }
}
function startHost() {
  end()
  error.value = ''
  resumeMessage.value = ''
  role.value = 'host'
  bind(rtc)
  void perform(() => rtc.createOffer())
}
function startGuest() {
  end()
  error.value = ''
  resumeMessage.value = ''
  role.value = 'guest'
  bind(rtc)
  state.value = 'idle'
}
function startFake() {
  end()
  error.value = ''
  resumeMessage.value = ''
  role.value = 'fake'
  const [local, remote] = FakeTransport.pair()
  fakePeer = new DiagnosticSession(remote)
  bind(local)
  everConnected.value = true
  void refreshCandidates()
}
async function copySignal() {
  if (!outgoing.value || busy.value) return
  const current = operationId
  if (!isSupported.value) {
    copyMessage.value =
      '自動コピーを利用できません。下の接続情報を長押しして全文をコピーしてください。'
    return
  }
  try {
    await copy(outgoing.value)
    if (current !== operationId) return
    // VueUseのlegacy fallbackはOSのコピー成否まで保証しない。
    copyMessage.value =
      'コピー操作を実行しました。貼り付け先で全文を確認してください。うまくいかない場合は下の情報を長押ししてコピーできます。'
  } catch {
    if (current === operationId)
      copyMessage.value =
        'コピーできませんでした。下の接続情報を長押しして全文をコピーしてください。'
  }
}
watch(visibility, (value) => {
  if (value !== 'visible') return
  rtc.refreshState()
  void refreshCandidates()
  resumeMessage.value =
    '画面復帰時の状態を確認しました。応答が届くか1回計測で確認してください。ページが再読み込みされた場合は接続情報を再生成します。'
})
useEventListener(window, 'pagehide', end)
onBeforeUnmount(end)
</script>

<template>
  <section aria-labelledby="home-title">
    <div class="hero">
      <v-chip color="primary" variant="tonal">フェーズ0.5 / 通信・操作感の検証</v-chip>
      <h1 id="home-title" class="page-title">スピード</h1>
      <p class="lead">ふたりの間に、どれくらいの時間？</p>
      <p class="muted">
        手動でつなぎ、往復時間とカードの動きを比べます。対戦機能は今後追加します。
      </p>
    </div>
    <div class="connection-status" role="status" data-testid="connection-state">
      <span class="status-dot" :class="{ online: state === 'connected' }"></span>{{ stateLabel }}
      <span class="muted">候補タイプ：{{ candidates }}</span>
    </div>
    <p class="notice">
      公開STUNを利用します。TURNは使用しないため、直接接続できないネットワークがあります。接続できない場合は双方で終了し、ネットワークを変えて接続情報を再生成してください。
    </p>
    <div class="actions">
      <v-btn color="primary" :disabled="busy || !!transport" @click="startHost">接続を開始</v-btn>
      <v-btn variant="outlined" :disabled="busy || !!transport" @click="startGuest"
        >接続に参加</v-btn
      >
      <v-btn :disabled="!transport && !busy" @click="end">中止・接続終了</v-btn>
    </div>
    <details v-if="!transport" class="demo-details">
      <summary>1台で演出を試す</summary>
      <p>実際の通信速度は測れません。</p>
      <v-btn @click="startFake">ローカル模擬を開始</v-btn>
    </details>
    <p v-if="busy" role="status">
      処理中です。ICE収集は最大20秒で中止します。完了前の情報はコピーできません。
    </p>
    <div v-if="role && role !== 'fake' && transport" class="signaling">
      <h2>
        {{
          role === 'host'
            ? 'ホスト：Offerを送る → Answerを貼る'
            : 'ゲスト：Offerを貼る → Answerを返す'
        }}
      </h2>
      <p>
        {{
          role === 'host'
            ? '生成されたOfferをLINEなどで相手に送り、今回のOfferに対するAnswerを貼り付けてください。'
            : 'ホストから受け取ったOfferのJSON全文を貼り付けてください。Answerを生成したらホストへ返します。'
        }}
      </p>
      <template v-if="outgoing">
        <v-btn color="primary" :disabled="busy" @click="copySignal"
          >{{ role === 'host' ? 'Offer' : 'Answer' }}をコピー</v-btn
        >
        <p v-if="!isSupported" class="muted">
          自動コピーに対応していません。下の情報を手動でコピーしてください。
        </p>
        <label class="signal-label"
          >{{ role === 'host' ? '送るOffer情報' : '送るAnswer情報'
          }}<textarea
            :value="outgoing"
            readonly
            rows="4"
            spellcheck="false"
            @focus="($event.target as HTMLTextAreaElement).select()"
          ></textarea>
        </label>
      </template>
      <template v-if="!everConnected && (role === 'host' || !outgoing)">
        <label class="signal-label"
          >{{ role === 'host' ? '受け取ったAnswer' : '受け取ったOffer'
          }}<textarea
            v-model="incoming"
            rows="5"
            maxlength="65537"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            placeholder="JSON全文をここに貼り付け"
            :disabled="busy"
          ></textarea>
        </label>
        <v-btn
          v-if="role === 'host'"
          :disabled="busy || !incoming.trim() || state !== 'awaiting-answer'"
          @click="perform(() => rtc.acceptAnswer(incoming))"
          >Answerを適用して接続</v-btn
        >
        <v-btn
          v-else
          :disabled="busy || !incoming.trim() || state === 'failed' || state === 'closed'"
          @click="perform(() => rtc.createAnswer(incoming))"
          >Answerを生成</v-btn
        >
      </template>
      <p v-if="role === 'guest' && outgoing && !everConnected" role="status">
        Answerをホストに送信後、この画面で接続を待ちます。
      </p>
    </div>
    <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
    <p v-if="resumeMessage" role="status" class="muted">{{ resumeMessage }}</p>
    <p v-if="error" role="alert" class="error-message">{{ error }}</p>
    <p v-if="state === 'closed' || state === 'failed'" class="muted">
      接続は保存されません。「中止・接続終了」後、「接続を開始」か「接続に参加」で新しく生成してください。
    </p>
    <DiagnosticPanel
      v-if="everConnected && transport"
      :transport="transport"
      :simulated="role === 'fake'"
    />
  </section>
</template>
