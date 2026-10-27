# Speed Card Game

**WebRTCを利用して、トランプゲーム「スピード」をオンラインでリアルタイム対戦できるWebアプリケーションです。**

> **開発状況：フェーズ0の開発基盤を実装済み**
>
> トップ画面・404画面・品質管理を整備しています。対戦・通信機能は未実装、アプリは未公開です。

## 概要

Speed Card Gameは、2人のプレイヤーがブラウザーから参加し、トランプの「スピード」を対戦できることを目指すプロジェクトです。

アカウント登録を不要とし、接続情報（Offer / Answer）をLINEやコピー＆ペーストで手動交換して対戦を始める体験を目標としています。正式版でも手動シグナリングを継続します。PCとスマートフォンの両方に対応する予定です。

スピードならではの素早い操作感を損なわないよう、**カード移動のアニメーション中に通信による判定を進める**仕組みと、**通信遅延を考慮した同時操作の競合解決**を重視します。

## ゲームルール（初期仕様）

- ジョーカーを除いた52枚を使用し、赤・黒の26枚ずつを各プレイヤーに割り当てます。
- 各プレイヤーは4枚の場札を持ち、中央の2か所の台札にカードを出します。
- 台札と数字が1つ違うカードを出せます。AとKは連続するものとして扱います。
- 場札を出したら、山札が残っている限り自動で補充します。
- 両者とも出せるカードがなくなった場合は、**双方が準備完了になってから**台札を更新して再開します。
- 自分の山札と場札をすべてなくしたプレイヤーが勝利します。

細部の例外処理（山札が尽きた後の手詰まりなど）は、ゲームエンジン実装前に仕様として確定し、テストで固定します。

## 主な機能（開発予定）

- **2人対戦**：WebRTC DataChannelによるリアルタイム通信
- **手動シグナリング**：LINEやコピー＆ペーストで接続情報を交換
- **自動補充**：カードを出した後の場札補充
- **手詰まり時の再開**：双方の準備完了を確認して台札を更新
- **カードアニメーション**：提出操作と同時に移動を開始し、判定成功なら台札へ重ね、失敗なら元に戻す
- **競合解決**：同じ台札へほぼ同時に出された操作を一貫した結果に確定
- **レスポンシブUI**：タッチ操作とマウス操作に対応
- **接続状態表示**：接続中・再接続中・切断を分かりやすく表示

## リアルタイム対戦の設計方針

### ゲーム状態とアニメーションを分離

カード操作時には、正式な判定が返る前から移動アニメーションを開始します。判定結果に応じて、台札にカードを重ねるか、元の場札へ戻します。結果が間に合わない場合は、台札の直前で待機させます。

アニメーションの長さは通信状況に応じて調整する方針ですが、**アニメーションの終了時刻はゲーム判定には使用しません**。

### 同時操作の競合解決

初期版では、ホストが正式なゲーム状態を管理する**ホスト権威型**を想定しています。

カード提出リクエストに操作ID、対象台札、台札バージョン、操作時刻などを含め、ホスト側で検証・確定して双方に結果を配信します。端末間の時計の誤差を考慮した操作時刻の比較に加え、台札表示から操作までの**反応時間**を補助的な判定材料として検証します。

反応時間や端末内の時刻情報だけでは、通信遅延や不正な申告を完全には排除できません。初期版は友人同士のカジュアル対戦を想定し、公平性に関する制約を検証しながら改善します。

## 技術構成

| 分類                            | 技術                                                 |
| ------------------------------- | ---------------------------------------------------- |
| フロントエンド                  | Vue 3 / TypeScript strict / Vite 8                   |
| UI・状態管理                    | Vuetify 4 / Pinia 4 / Vue Router（Hash History）     |
| UI補助                          | VueUse（@vueuse/core）                               |
| 実行環境                        | Volta / Node.js 24.21.0 / npm 11.19.0                |
| P2P通信（フェーズ0.5以降）      | ブラウザー標準のWebRTC DataChannel                   |
| シグナリング（フェーズ0.5以降） | LINE／コピー＆ペーストによる手動交換（正式版も継続） |
| 接続補助（今後検証）            | STUN / TURNの必要性・利用方針をフェーズ0.5で評価     |
| 単体・結合テスト                | Vitest / Vue Test Utils                              |
| E2Eテスト                       | Playwright                                           |
| 品質管理                        | ESLint / Oxlint / Prettier / GitHub Actions          |
| フロントエンド公開              | GitHub Pages（予定）                                 |

## セットアップ

[Volta公式ガイド](https://docs.volta.sh/guide/getting-started)に従ってVoltaをインストールし、`volta setup`後にターミナルを再起動してください。

```sh
volta --version
# リポジトリ内ではpackage.jsonのvolta設定が自動適用される
node --version  # v24.21.0
npm --version   # 11.19.0
npm ci
npm run dev
```

開発URLは `http://localhost:5173/speed-card-game/` です。環境変数やバックエンドは不要です。
グローバルのNode.js/npmを切り替える必要はありません。固定バージョンを先に取得したい場合は `volta fetch node@24.21.0 npm@11.19.0` を実行します。
バージョンを意図的に更新する場合のみ `volta pin node@<version>` / `volta pin npm@<version>` を使用し、`engines`とlockfileも更新します。

```sh
npm run type-check
npm run lint
npm run format:check
npm run test:unit
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

LinuxではブラウザーのOS依存ライブラリも必要なため、`npx playwright install --with-deps chromium firefox webkit` を使用します。
`test:e2e`は本番ビルドとプレビューサーバーを自動で起動・終了します。ポート4173は空けておいてください。
Chromium / Firefox / WebKit / Pixel 7 / iPhone 13の5プロジェクトで実行します。スマートフォン設定はエミュレーションで、実機検証はフェーズ0.5で行います。

`lint`と`format:check`は検査のみでファイルを書き換えません。明示的に修正する場合は `npm run lint:fix` / `npm run format`、単体テストの監視は `npm run test:unit:watch` を利用できます。

## 現在のディレクトリ構成

```text
src/
├── composables/       # VueUseを使うページタイトル更新とテスト
├── plugins/           # Vuetify設定ファクトリ
├── router/            # Hash Router、トップ・404ルート
├── views/             # HomeView / NotFoundView
├── __tests__/         # アプリ結合テスト、テスト環境
├── App.vue            # 共通レイアウトとルーティング
├── main.ts            # Vue / Pinia / Router / Vuetifyの組み立て
└── styles.css
e2e/                  # PC・スマホの基本テスト
.github/workflows/     # PRとmain更新時のCI（デプロイなし）
```

将来の `domain/`（純粋なゲームロジック）、`network/`（WebRTC・手動接続）、`stores/`（Piniaの表示向け状態）、`application/`（対戦進行）、`components/`（共通UI）は、実際に使う段階で追加します。空ディレクトリ・ダミーStoreは作りません。Pinia自体はアプリに登録済みです。

VueUseは `usePageTitle` 内の `useTitle` で使用し、画面遷移に追従するタイトルをテストします。今後の `useClipboard` / `useDocumentVisibility` もUI補助として用い、ゲームドメイン・通信プロトコルの純粋ロジックには依存させません。

## GitHub PagesとCI

Viteの `base` は `/speed-card-game/`、RouterはHash Historyです。未知のHashルート（例：`/speed-card-game/#/missing`）はアプリ内404を表示します。Hash前の未知パスはGitHub Pages側の404となります。

```sh
npm run build
npm run preview
```

`http://localhost:4173/speed-card-game/` で本番成果物を確認できます。
PRとmain更新時のCIは型チェック・Oxlint・ESLint・整形・Vitest・ビルド・Playwrightを実行します。CIのNode.jsは `package.json` のVolta設定から取得し、npmも同じ固定バージョンを使用します。`.npmrc` の `engine-strict` により、異なる実行環境ではインストールを失敗させます。

今回はGitHub Pages向けビルド設定までです。デプロイ設定・公開作業はフェーズ0.5で行います。Cloudflareや独自バックエンドは構築しません。

## 開発計画

- **フェーズ0**：今回の開発基盤。受け入れ条件・検証記録は [docs/phase-0-validation.md](docs/phase-0-validation.md)。
- **フェーズ0.5**：GitHub Pages公開、2台のスマートフォンで手動Offer / Answer交換、DataChannelのREQUEST / RESPONSEのRTTと操作感、擬似カードアニメーションを検証。
- **以降**：ゲームエンジン、ローカル対戦UI、操作演出、ホスト仲裁・状態同期・時計差推定、実機対戦を段階導入。

詳細は [実装計画](docs/implementation-plan.md) と [アーキテクチャ](docs/architecture.md) を参照してください。

## 参考にしたプロジェクト

- [brain-training](https://github.com/tatsuya0903/brain-training) — Vueでの状態管理、反応時間計測、操作フィードバック
- [daily-heatmap](https://github.com/tatsuya0903/daily-heatmap) — ドメイン分離、テスト、レスポンシブUI、CI/CD

---

このREADMEは現在の開発基盤と今後の計画を記載しています。実装の進捗に合わせて、仕様・技術構成・起動手順・公開URLを更新します。
