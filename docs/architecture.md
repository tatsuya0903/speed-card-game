# WebRTC スピード通信対戦アプリ — 既存プロジェクト参照アーキテクチャ v1.0

作成日: 2026-10-25 / 更新日: 2026-10-28

> 最新決定: フロントエンドはGitHub Pages。フェーズ0.5以降はLINE／コピー＆ペーストによる手動Offer / Answer交換を正式版まで継続する。Cloudflare・独自バックエンド・DBは構築しない。通信・RTT・演出・デプロイはフェーズ0に含めない。

## 目的と位置づけ

本書は `tatsuya0903/brain-training` と `tatsuya0903/daily-heatmap` の `main` ブランチを調査した結果に基づく、**既存のゲーム仕様に対する実装構造の補足**である。ゲームルール・補充・手詰まり・時計補正・アニメーションの既存決定を変更しない。新しいスピード用リポジトリを作り、既存2リポジトリは参照専用とする。

## 現行リポジトリから継承するもの

| 参照先                                                        | 確認した実装                                                                          | 新アプリへの継承                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| brain-training `src/stores/training.ts`                       | `Clock = () => number` と `performance.now()` の注入可能な時刻取得                    | 反応時間・操作時刻のテスト用FakeClock                                                                        |
| brain-training `src/views/TrainingView.vue`                   | `watch(...,{flush:'post'})`、`requestAnimationFrame`、効果音/触覚フィードバック呼出し | 表示タイミング計測の近似、アニメーション・フィードバック、後始末。ただし実画面表示時刻を保証するものではない |
| brain-training `src/domain/training/sounds.ts` / `haptics.ts` | Web Audio API と任意の触覚フィードバック                                              | サウンド／触覚を失敗してもゲーム進行を止めない補助機能に                                                     |
| daily-heatmap `src/domain/`, `src/stores/`                    | UI非依存のドメイン処理と Pinia 分離                                                   | ゲームルールは副作用のない純粋関数に、Piniaは表示向け状態を担当                                              |
| daily-heatmap `src/composables/useHeatmapInteraction.ts`      | DOM入力処理の分離・キーボード操作                                                     | `useCardInput` と `useCardAnimation` に入力/演出を分離                                                       |
| daily-heatmap `src/router/index.ts`                           | Hash Router と `createAppRouter` ファクトリ                                           | GitHub Pagesへの設置、ルートをテストしやすくする                                                             |
| daily-heatmap `playwright.config.ts`                          | chromium / firefox / webkit / mobile-chrome / mobile-safari                           | マルチブラウザUI検証。モバイル系はエミュレーションであり実機検証とは区別                                     |
| daily-heatmap `.github/workflows/ci.yml`, `deploy.yml`        | 非破壊のLint、テスト、ビルド、明示操作の公開                                          | PRのCIと本番公開を分離、公開には明示承認。複雑なタグ検証は必要に応じて段階導入                               |

参照リンク:

- https://github.com/tatsuya0903/brain-training
- https://github.com/tatsuya0903/daily-heatmap
- https://github.com/tatsuya0903/brain-training/blob/main/src/stores/training.ts
- https://github.com/tatsuya0903/brain-training/blob/main/src/views/TrainingView.vue
- https://github.com/tatsuya0903/daily-heatmap/blob/main/.github/workflows/ci.yml
- https://github.com/tatsuya0903/daily-heatmap/blob/main/.github/workflows/deploy.yml

## 技術基盤

- Vue 3 + TypeScript（strict）+ Vite 8 系、Vuetify 4 + Vue Router（Hash History）+ Pinia 4
- npm 11.19.0 + package-lock.json、Node 24.21.0（既存 `daily-heatmap` と揃え、両方Volta固定）
- VueUseはUI補助に限定。フェーズ0はuseTitle、今後useClipboard / useDocumentVisibilityを検討。domainと通信プロトコルの純粋ロジックには依存させない。
- Vitest + Vue Test Utils + Playwright / ESLint + Oxlint + Prettier
- フロントエンドの静的配信: GitHub Pages。`base` は新リポジトリの名前に合わせて設定。
- シグナリング: Offer / AnswerをLINE／コピー＆ペーストで手動交換。自前の仲介サーバーは設けない。
- WebRTCはブラウザー標準の `RTCDataChannel`（ordered/reliable）。公開STUNを利用し、TURNは導入しない。直接接続できないネットワークがある制約を表示する。
- 初期版は認証・ランキング・ゲーム録画・PWAをスコープ外とする。PWA導入時は対戦中の自動更新を防止する。

## 推奨ディレクトリ構造

```text
.
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml               # フェーズ0.5で追加
├── e2e/
│   ├── local-game.spec.ts
│   ├── room-connection.spec.ts
│   ├── online-match.spec.ts
│   └── mobile.spec.ts
├── src/
│   ├── app/                      # DI/依存の組み立てとブートストラップ
│   ├── components/
│   │   ├── cards/                # PlayingCard.vue, CardSlot.vue 等
│   │   ├── board/                # TablePile.vue, PlayerBoard.vue 等
│   │   └── connection/           # 接続状態・READYダイアログ
│   ├── composables/
│   │   ├── useCardInput.ts
│   │   ├── useCardAnimation.ts
│   │   ├── useDisplayTiming.ts
│   │   └── useFeedback.ts
│   ├── domain/
│   │   └── game/
│   │       ├── types.ts
│   │       ├── deck.ts
│   │       ├── rules.ts
│   │       ├── reducer.ts        # GameState + Action -> 結果
│   │       ├── stall.ts          # 手詰まり・READY
│   │       └── *.spec.ts
│   ├── application/
│   │   ├── matchController.ts
│   │   ├── hostArbitrator.ts
│   │   ├── latencyEstimator.ts
│   │   ├── actionTracker.ts
│   │   └── *.spec.ts
│   ├── network/
│   │   ├── protocol.ts           # バージョン付きメッセージとランタイム検証
│   │   ├── transport.ts          # MessageTransport インターフェース
│   │   ├── rtcTransport.ts       # RTCPeerConnection, RTCDataChannel
│   │   ├── manualSignaling.ts     # Offer / Answerの手動交換補助
│   │   ├── clockSync.ts          # performance.now() の端末差推定
│   │   └── *.spec.ts
│   ├── stores/
│   │   ├── match.ts
│   │   ├── connection.ts
│   │   └── animation.ts
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── RoomView.vue
│   │   ├── MatchView.vue
│   │   └── ResultView.vue
│   ├── router/index.ts
│   └── main.ts
├── package.json
├── package-lock.json
├── SPEC.md
├── ARCHITECTURE.md
└── README.md
```

上記は将来の配置案であり、フェーズ0では未使用ディレクトリ・ダミー実装を作成しない。現在の実ファイル構成はREADMEを参照。初期段階では `application/` を過剰に分割しない。通信・競合制御が必要になった時点で専用モジュールを追加する。`domain` は Vue、VueUse、Pinia、DOM、RTC、時間取得に依存しない。通信プロトコルの純粋ロジックもVueUseには依存させない。

## データフローと責任境界

1. ユーザー入力: `CardSlot.vue` -> `useCardInput` -> `matchController.submitCard`。
2. ローカル時刻・対象台札のバージョン・actionIdを記録。入力直後に「移動中」アニメーション開始。
3. `MessageTransport` 経由で `PLAY_CARD` を送信。ホスト自身の入力も **同じ仲裁器のキュー** に投入する。
4. `hostArbitrator` は合法手チェック、重複除去、競合受付窓（初期は仮値）と時刻補正を扱い、結果を確定。
5. `domain/game/reducer` が副作用なしで `GameState` を更新し、必要な自動補充を確定。
6. `ACTION_RESULT` と新しいstate revisionを配信。クライアントは `actionId` と `revision` を用いて順序を確認し、欠落時は状態再同期。
7. アニメーションは `result` と独立。成功なら台札に重ね、拒否なら元に戻す。応答が遅ければ台札直前で待機。
8. 正式なゲーム状態とアニメーション表示状態を区別する。カード移動の時間は勝敗に影響させない。

### 時刻判定方針

- `performance.now()` を計測源とし、相互に直接比較せず、接続時・対戦中に測定したoffsetにより同一時間軸へ近似変換する。
- `displayedAt` は表示完了時刻の近似として扱う。`nextTick`/`requestAnimationFrame` は物理ディスプレイの表示完了保証ではない。ブラウザのタイマ分解能・描画負荷も考慮。
- 同一台札・同一バージョンへの競合要求のみ、補正済み操作時刻を一次判定とする。時刻差が誤差帯なら反応時間を参考情報（将来的な二次判定候補）として保存。
- **初期版の反応時間を正式な勝敗判定に導入するかは、合成遅延検証後に固定**する。導入する際は明示のタイブレーク順と閾値を文書化し、テストで固定する。
- 端末時刻は改造クライアントが偽装できる。対戦相手の不正耐性を重視するならサーバー権威型が必要。
- 固定長の保留窓では、遅延する全リクエストを確実に比較できるとは限らない。時刻順での公平性はベストエフォートと明記する。

### リクエストと応答の最低フィールド

```ts
interface PlayCardRequest {
  type: 'PLAY_CARD'
  protocolVersion: 1
  matchId: string
  actionId: string
  playerId: string
  cardId: string
  sourceSlot: number
  targetPile: 'left' | 'right'
  expectedPileVersion: number
  clientPlayedAtMs: number
  reactionTimeMs: number | null
  sequence: number
}

type PlayCardResponse =
  | { type: 'ACTION_RESULT'; actionId: string; accepted: true; revision: number }
  | { type: 'ACTION_RESULT'; actionId: string; accepted: false; reason: string; revision: number }
```

入力データは通信相手由来であるためランタイムバリデーションし、クライアント送信の playerId / 時刻 / reactionTime を無条件に信用しない。秘匿情報（山札のカード内容等）は相手側の公開stateへ不用意に含めない。ホストには両プレイヤーの山札を知り得るカジュアル対戦上の信頼モデルがあることを明記する。

## アニメーション実装方針

- `useCardAnimation` が `actionId` ごとに `idle -> moving -> waiting -> committing | returning -> completed` を管理。
- 初期仮値: 通常220ms、高速160ms、低速300ms、戻り120ms。直近の「操作要求 -> 結果確定」のp95から調整し、頻繁な揺れを抑える。
- `waiting` ではカードを台札直前に留め、通信タイムアウトだけでは拒否扱いにせず再同期へ進む。
- 成功後の自動補充・手詰まりREADYへの遷移は、正式ゲーム状態で管理。演出終了まで次の独立操作を過度にブロックしない。
- `prefers-reduced-motion` を尊重する。アニメーションは `transform` を中心に行い、DOM破棄・画面離脱時のキャンセルを行う。

## フェーズ／受け入れテスト

| 段階 | 実装範囲                                                                          | 最低限の合格条件                                                           |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0    | Vue/Vite/TS/Pinia/Vuetify/router、Lint/Format/Unit/E2E/CI                         | npm ci、type-check、lint、format:check、test:unit、build、test:e2e、CI成功 |
| 0.5  | GitHub Pages公開、2台のスマホで手動Offer / Answer交換・DataChannel・RTT・擬似演出 | REQUEST / RESPONSEのRTT、操作感、LINE往復・コピー＆ペーストを実機検証      |
| 1    | カード・配札・自動補充・合法手・手詰まりREADY・勝敗                               | 純粋関数の境界値、52枚一意性、不正操作、決定性をVitestで検証               |
| 2    | ローカル対戦画面、スマホ表示、入力操作                                            | Playwrightでタップ・クリック・描画・画面方向・基本アクセシビリティを確認   |
| 3    | 動作演出＋表示時刻計測                                                            | fakeClock/FakeTransportで成功・失敗・遅延・タイムアウトを再現              |
| 4    | `MessageTransport` + シグナリング + WebRTC                                        | 2タブ/2端末で手動接続、拒否、終了、STUN/TURNの必要性を確認                 |
| 5    | ホスト仲裁、時計差推定、競合窓、状態同期                                          | 同時操作（±0～100ms）、順序入替、重複、遅延、切断復帰のテスト              |
| 6    | 公開・実機テスト・運用                                                            | GitHub Pages URL、iPhone/Android・Wi-Fi/セルラー混在で対戦成功             |

- ブラウザE2Eは FakeTransport による再現可能なシナリオを主に検証。実RTCは別の統合テストに分離して不安定なネットワーク条件を前提とした曖昧なCI失敗を防ぐ。
- GitHub Actions では `daily-heatmap` 同様、lintはチェックのみ・テスト・ビルドを実行する。E2Eモバイルはエミュレータであり実機保証ではない。
- 公開はPR/main pushと切り離して明示の操作と承認で行う。フェーズ0には公開用ワークフローを追加しない。

## Codex進行上の取り決め

1. 既存の2リポジトリは参照専用。新規リポジトリ内に独自実装する。コードの丸ごとコピーと、依存の無条件追加を避ける。
2. 新規タスクは1 Issue / 1 PRに分ける。変更範囲と受け入れテストを先に書く。
3. 変更後はtype-check / lint / format:check / unit / build / 該当E2Eを確認。パスしたテストと未実施テストを区別して報告。
4. 外部サービスへのデプロイ、GitHubへのpush、PR作成、マージ等の外部書き込みは明示の承認がある場合だけ実施。
5. READMEにフロントの起動方法と検証手順を記載。手動シグナリングの操作方法・デプロイ手順はフェーズ0.5で追加。

## フェーズ0の実装方針

Issue #1の範囲で、トップ・404画面、型チェック、チェック専用Lint・整形、Vitest、PC・スマホE2E、PR/mainのCIを実装する。VueUseのタイトル更新をテストする。Node/npmをVolta・engines・lockfile・CI間で揃える。通信・ゲーム・アニメーション・デプロイを先行実装しない。

## フェーズ0.5で実装した境界

現行実装の設計は [phase-0.5-validation.md](phase-0.5-validation.md) を参照する。上記のゲーム関連ディレクトリ・メッセージ・時間同期・演出の自動調整は将来案で、今回の実装ではない。

- `network/protocol.ts` に接続情報・診断メッセージのバージョン付きJSONとランタイム検証。
- `MessageTransport` の最小境界を `RtcTransport` と `FakeTransport` が実装する。
- `DiagnosticSession` が双方向REQUEST / RESPONSE・actionId・タイムアウト・遅着応答・RTT・連続測定を担当する。
- `useCardAnimation` は応答結果と端末内の演出時間を扱い、通信時間・正式なゲーム判定と分離する。前進100/200/300ms、成功確定60ms、拒否戻り120ms。低減モーションは0ms。
- Offer / AnswerはICE収集完了後にのみコピー可能。20秒のICE期限と中止、90秒の接続期限、ページ破棄時の解放を持つ。正式版も手動交換を継続する。
- VueUseはclipboard・visibility・reduced-motion等のUI補助。Piniaは既存アプリ登録を維持し、接続は画面内で管理する。
- Pagesはworkflow_dispatchのみ。指定SHAに一致するmainのCI成功を検証し、公開権限はdeployジョブだけに付与する。現時点で公開は未実施。
