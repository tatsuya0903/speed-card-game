<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDocumentVisibility, usePreferredReducedMotion } from '@vueuse/core'
import type { MessageTransport } from '@/network/transport'
import type { Decision } from '@/network/protocol'
import { DiagnosticSession, REQUEST_TIMEOUT_MS } from '@/diagnostics/session'
import { statistics } from '@/diagnostics/statistics'
import { useCardAnimation } from '@/composables/useCardAnimation'
const props = defineProps<{ transport: MessageTransport; simulated?: boolean }>()
const session = new DiagnosticSession(props.transport)
const revision = ref(0)
const state = ref(props.transport.state)
const receivedId = ref('')
const flash = ref(false)
const error = ref('')
const count = ref(50),
  interval = ref(200),
  animationMs = ref(200),
  delayMs = ref(0)
const decision = ref<Decision>('accept')
const card = useCardAnimation()
const { stage, duration, approachMs, finishMs, totalMs } = card
const reduced = usePreferredReducedMotion()
const visibility = useDocumentVisibility()
let flashFrame = 0
let flashTimer: ReturnType<typeof setTimeout> | undefined
const off = session.onEvent((event) => {
  revision.value++
  if (event.type === 'result') card.result(event.result)
  if (event.type === 'received') {
    receivedId.value = event.request.actionId
    flash.value = false
    cancelAnimationFrame(flashFrame)
    flashFrame = requestAnimationFrame(() => {
      flash.value = true
    })
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      flash.value = false
    }, 700)
  }
})
const offState = props.transport.onState((value) => {
  state.value = value
})
const snapshot = computed(() => {
  void revision.value
  return {
    normal: { ...session.normal, stats: statistics(session.normal.samples) },
    artificial: { ...session.artificial, stats: statistics(session.artificial.samples) },
    received: session.received,
    ignored: session.ignored,
    running: session.running,
    progress: session.progress,
  }
})
const busyCard = computed(() =>
  ['moving', 'waiting', 'unknown', 'committing', 'returning'].includes(stage.value),
)
const labels = {
  idle: '手元で待機',
  moving: '移動中',
  waiting: '応答待ち',
  unknown: '結果不明 — タイムアウト・切断は拒否ではありません',
  committing: '台札へ移動',
  returning: '手元へ戻る',
  accepted: '応答成功：台札へ重なりました',
  rejected: '疑似拒否：手元へ戻りました',
}
const formatMs = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} ms`)
async function probe() {
  error.value = ''
  try {
    await session.request()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '送信できません。'
  }
}
function batch() {
  error.value = ''
  try {
    session.start(Number(count.value), Number(interval.value))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '測定を開始できません。'
  }
}
function submit() {
  error.value = ''
  const id = crypto.randomUUID()
  card.start(id, Number(animationMs.value), reduced.value === 'reduce')
  session.request('card', Number(delayMs.value), decision.value, id).catch((e: unknown) => {
    card.result({ actionId: id, status: 'unknown', rtt: null, late: false })
    error.value = e instanceof Error ? e.message : '送信できません。'
  })
}
watch(visibility, (value) => {
  if (value === 'hidden') session.stop()
})
onBeforeUnmount(() => {
  off()
  offState()
  session.dispose()
  clearTimeout(flashTimer)
  cancelAnimationFrame(flashFrame)
})
</script>

<template>
  <section aria-labelledby="diagnostics-title" class="diagnostics">
    <h2 id="diagnostics-title">通信診断</h2>
    <p v-if="simulated" class="notice">
      ローカル模擬通信（FakeTransport）です。ネットワークのRTTではありません。
    </p>
    <p class="muted">同じ端末の performance.now() で往復を計測します。片道遅延は算出しません。</p>
    <div class="receive-indicator" :class="{ flash }" role="status" data-testid="receive-indicator">
      REQUEST受信：{{ snapshot.received }} 回
      <span v-if="receivedId">（{{ receivedId.slice(0, 8) }}）</span>
    </div>
    <div class="stat-series">
      <article
        v-for="[key, title] in [
          ['normal', '通常RTT'],
          ['artificial', '人工遅延を含む往復時間'],
        ] as const"
        :key="key"
        class="metric-block"
        :data-testid="key"
      >
        <h3>{{ title }}{{ simulated ? '（模擬）' : '' }}</h3>
        <dl class="metrics">
          <div
            v-for="[metric, label] in [
              ['latest', '最新'],
              ['mean', '平均'],
              ['p50', 'P50（中央値）'],
              ['p95', 'P95'],
              ['max', '最大'],
            ] as const"
            :key="metric"
          >
            <dt>{{ label }}</dt>
            <dd>{{ formatMs(snapshot[key].stats[metric]) }}</dd>
          </div>
        </dl>
        <p class="counters">
          送信 {{ snapshot[key].sent }} ／ 応答 {{ snapshot[key].responses }} ／ タイムアウト
          {{ snapshot[key].timeouts }} ／ 遅着 {{ snapshot[key].late }}
        </p>
      </article>
    </div>
    <p class="muted small">
      統計は接続中の直近1,000件の期限内応答。P50は中央値（偶数件は中央2値の平均）、P95はnearest-rank。拒否応答も往復時間に含みます。遅着応答は件数のみ加算し、統計から除外します。
    </p>
    <div class="actions">
      <v-btn color="primary" :disabled="state !== 'connected'" @click="probe">1回計測</v-btn>
      <v-btn :disabled="state !== 'connected' || snapshot.running" @click="batch"
        >連続測定を開始</v-btn
      >
      <v-btn :disabled="!snapshot.running" @click="session.stop()">測定を停止</v-btn>
    </div>
    <div class="fields">
      <label
        >測定回数<select v-model="count" aria-label="測定回数">
          <option :value="50">50回</option>
          <option :value="100">100回</option>
        </select></label
      >
      <label
        >送信間隔（ms）<input
          v-model="interval"
          type="number"
          min="20"
          max="10000"
          step="20"
          inputmode="numeric"
      /></label>
    </div>
    <p role="status">
      連続測定：{{ snapshot.progress }} 回送信済み{{ snapshot.running ? '・測定中' : '' }}
    </p>
    <p class="muted small">
      送信間隔は応答待ち時間を含みません。短い間隔は通信負荷を増やします。画面を離れると連続送信を停止します。要求の期限は{{
        REQUEST_TIMEOUT_MS
      }}msです。
    </p>
    <hr />
    <h2>擬似カードの操作感</h2>
    <div class="fields">
      <label
        >移動時間<select v-model="animationMs" aria-label="移動時間">
          <option :value="100">100ms</option>
          <option :value="200">200ms</option>
          <option :value="300">300ms</option>
        </select></label
      >
      <label
        >相手の疑似応答<select v-model="decision" aria-label="相手の疑似応答">
          <option value="accept">成功</option>
          <option value="reject">拒否</option>
          <option value="drop">応答なし</option>
        </select></label
      >
      <label
        >人工応答遅延<select v-model="delayMs" aria-label="人工応答遅延">
          <option :value="0">0ms（通常）</option>
          <option :value="500">500ms</option>
          <option :value="4000">4000ms（期限超過）</option>
        </select></label
      >
    </div>
    <p v-if="Number(delayMs) > 0" class="notice">
      テスト用に受信側が{{
        delayMs
      }}ms待って応答します。観測値にはこの待機が含まれ、通常RTTとは別に集計します。
    </p>
    <p v-if="reduced === 'reduce'" class="muted">
      動きを減らす設定：移動を省略して状態だけを表示します。
    </p>
    <div
      class="card-board"
      :style="{
        '--move-ms': `${duration}ms`,
        '--settle-ms': duration === 0 ? '0ms' : stage === 'returning' ? '120ms' : '60ms',
      }"
    >
      <div class="pile">台札</div>
      <div class="pseudo-card" :class="stage" data-testid="pseudo-card" aria-hidden="true">
        <span>S</span><span>試験カード</span>
      </div>
      <span class="hand-label">手元</span>
    </div>
    <p role="status" data-testid="card-status">{{ labels[stage] }}</p>
    <div class="actions">
      <v-btn color="primary" :disabled="state !== 'connected' || busyCard" @click="submit"
        >カードを送信</v-btn
      >
      <v-btn
        :disabled="stage === 'moving' || stage === 'committing' || stage === 'returning'"
        @click="card.reset()"
        >表示をリセット</v-btn
      >
    </div>
    <p class="muted small">
      結果不明では提出失敗を確定しません。60秒間は遅着応答で確定できます。それ以降は表示をリセットするか再接続してください。表示のリセットは相手への取消通知ではありません。
    </p>
    <p data-testid="animation-timing">
      前進の経過 {{ formatMs(approachMs) }} ／ 確定・戻りの経過 {{ formatMs(finishMs) }} ／
      操作から演出完了（待機含む） {{ formatMs(totalMs) }}
    </p>
    <p class="muted small">
      演出時間は端末内タイマーの経過時間です。描画・物理ディスプレイの完了は保証せず、バックグラウンドの抑制も含みます。前進後、成功は60ms、拒否は120msで確定します。
    </p>
    <p v-if="error" role="alert" class="error-message">{{ error }}</p>
    <p class="muted small">重複・対応不明のメッセージ：{{ snapshot.ignored }} 件</p>
  </section>
</template>
