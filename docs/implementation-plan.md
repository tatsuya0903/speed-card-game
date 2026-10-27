# 実装計画

更新日: 2026-10-27

## 共通方針

- `daily-heatmap` の責務分離、Hash Router、チェック専用Lint、Vitest、Playwright、CIを優先的に参照する。
- `brain-training` の注入可能なClock、描画後の計測、補助的な音・触覚の扱いは、該当フェーズで参照する。
- 既存2リポジトリは参照専用。新アプリの実装・依存を無条件にコピーしない。
- フロントエンドはGitHub Pages。正式版もLINE／コピー＆ペーストによる手動シグナリングを継続する。
- Cloudflare、自前のシグナリングサーバー、独自バックエンド、DBは構築しない。
- ゲーム、通信、状態管理、操作演出を分離する。純粋なゲーム／プロトコル処理はVueUse・Vue・DOM・RTCに依存させない。
- 1 Issue / 1 PRを基本とし、外部へのpush・PR作成・マージ・タグ・デプロイは明示承認後に行う。

## フェーズ0 — Issue #1

作業ブランチ: `codex/1-project-foundation`

実装範囲:

- Vue 3 / TypeScript strict / Vite 8 / Vuetify 4 / Pinia 4 / Hash Router。
- Node.js 24.21.0 / npm 11.19.0をVoltaとenginesに固定。lockfileを共有し、CIも同じ環境を使う。
- `@vueuse/core` の `useTitle` による画面タイトル更新と、その実使用を検証するテスト。
- トップ画面と404画面。GitHub Pagesの `/speed-card-game/` に対応するビルド設定。
- ESLint / Oxlint / Prettier。`lint` / `format:check` はファイルを変更しない。
- Vitest + Vue Test Utils、PlaywrightのPC・スマホ基本E2E。
- PRとmain更新時のGitHub Actions CI。公開用ワークフローは追加しない。

受け入れ条件:

- `npm ci` / `npm run type-check` / `npm run lint` / `npm run format:check` / `npm run test:unit` / `npm run build` / `npm run test:e2e` が成功。
- VueUseのタイトル初期表示・更新・停止、トップと404の遷移、ビルド済みアセットのプロジェクトパス、PC・スマホ表示を確認。
- ローカル・CI設定・lockfile・Volta・enginesの整合性を確認。
- WebRTC、ゲームルール、RTT、手動Offer / Answer交換、カード演出、時刻同期・競合判定・デプロイを先行実装しない。
- CIのリモート成功は、承認されたpush後に確認する。ローカル検証の成功と区別して報告する。

実施結果は [phase-0-validation.md](phase-0-validation.md) に記録する。

## フェーズ0.5 — 通信・操作感の先行検証

次のIssueで扱う内容:

- GitHub Pagesの公開用ワークフローと承認後の初回公開。
- 2台のスマートフォンで、LINEやコピー＆ペーストによるOffer / Answer手動交換。
- ブラウザー標準APIによるWebRTC DataChannel接続・終了・失敗時の再試行。
- REQUEST / RESPONSEによるRTT測定、擬似カードアニメーションと操作感の評価。
- `useClipboard` / `useDocumentVisibility` は必要なUI補助に絞って導入する。
- PC/スマホ、iPhone/Android、Wi-Fi/セルラー混在時の接続性を記録。エミュレーション結果と実機結果を区別する。
- STUN/TURNの必要性、利用サービス、接続できないネットワークでの案内を検討する。独自バックエンドを前提としない。
- 受け入れ結果から、ゲーム本体を実装する前に通信・遅延・操作感の設計を見直す。

## 以降のIssue分割案

1. ゲームエンジン: 配札、合法手、自動補充、手詰まり、勝敗。純粋関数の境界値・52枚一意性・決定性をテスト。
2. ローカル対戦UI: PC/スマホ入力、カード・台札表示、アクセシビリティ。
3. 操作演出: 注入可能なClock、表示時刻の近似、成功・拒否・遅延時の演出をFakeTransportで検証。
4. 手動接続と対戦の統合: 接続状態表示、キャンセル・終了、通信プロトコルの検証。
5. ホスト仲裁と状態同期: 時計差推定、競合窓、重複・順序・切断処理。公平性の制約を明文化。
6. 実機対戦の仕上げ: 異なる端末・ネットワークでの操作感、低減モーション対応、補助的な音・触覚。

時刻取得・演出の完了時刻を正式な勝敗判定と混同しない。反応時間を判定に採用するか、時計差の誤差帯・競合受付窓・再接続時の扱いは、それぞれの検証後に確定する。
