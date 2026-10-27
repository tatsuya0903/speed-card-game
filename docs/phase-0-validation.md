# フェーズ0 検証記録 — Issue #1

検証日: 2026-10-27（Asia/Tokyo）

ブランチ: `codex/1-project-foundation`

## 実装結果

Vue 3 / Vite 8 / TypeScript strict / Vuetify 4 / Pinia 4 / Hash Routerによる開発基盤を追加した。
トップ画面・404画面とホームへの復帰、VueUseによるページタイトル更新を実装し、GitHub Pagesの `/speed-card-game/` 配下で本番ビルドを確認した。

ゲームドメイン、WebRTC、Offer / Answer交換、RTT、カードアニメーション、時刻同期・競合判定は未実装で、次フェーズの範囲を維持している。Piniaはエントリーポイントに登録し、用途のないStoreや空ディレクトリは追加していない。

README・アーキテクチャ・実装計画を、GitHub Pagesと正式版まで継続する手動シグナリング方針へ更新した。Cloudflare・自前バックエンド・DBは構築しない。

## バージョンと互換性

直接依存はすべて完全なバージョンで指定し、推移依存はpackage-lock.jsonで固定した。

| 分類                   | 採用バージョン                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| 実行環境               | Node.js 24.21.0 / npm 11.19.0                                              |
| アプリ                 | Vue 3.5.42 / Vite 8.2.4 / TypeScript 6.0.3                                 |
| UI・状態・ルーティング | Vuetify 4.2.1 / Pinia 4.0.3 / Vue Router 5.3.1                             |
| Piniaの必須peer        | @vue/devtools-api 8.1.5                                                    |
| VueUse                 | @vueuse/core 15.0.0                                                        |
| Vueビルド・型検査      | @vitejs/plugin-vue 6.0.8 / vite-plugin-vuetify 2.1.3 / vue-tsc 3.3.11      |
| テスト                 | Vitest 4.1.12 / Vue Test Utils 2.5.0 / jsdom 30.0.1 / Playwright 1.63.0    |
| 品質管理               | ESLint 10.10.0 / Oxlint 1.82.0 / Prettier 3.9.6 / typescript-eslint 8.71.2 |

確認したnpm公式レジストリの要件:

- npm 11.19.0: Node `^20.17.0 || >=22.9.0`。
- Vite 8.2.4: Node `^20.19.0 || >=22.12.0`。
- Vuetify 4.2.1: Vue `^3.5.0 || ^3.6.0-0`、TypeScript `>=4.7`、vite-plugin-vuetify `>=2.1.0`。
- Pinia 4.0.3: Vue `^3.5.11`、TypeScript `>=5.6.0`、@vue/devtools-api `^8.1.5`。
- @vueuse/core 15.0.0: Node `>=22`、Vue `^3.5.0`。
- Vitest 4系: Vite 8をpeerとしてサポート。採用環境でインストール・型検査・テスト・本番ビルドが成功。
- `npm ls --all` が成功し、必須peerの欠落やバージョン不整合はない。

Node.js 24.21.0同梱のnpm 11.19.0を選定。Voltaのプロジェクト設定、engines、lockfileのルートengines、ローカルの実行バージョンを照合した。lockfileVersionは3。CIはsetup-nodeの `node-version-file: package.json` でVoltaのNode指定を読み、同じファイルの `volta.npm` をインストールする。`.npmrc` の `engine-strict=true` によって異なる実行環境を拒否する。

公式資料:

- [Node.js 24.21.0のリリース](https://nodejs.org/en/blog/release/v24.21.0)
- [Viteの動作要件](https://vite.dev/guide/) / [GitHub Pagesのbase設定](https://vite.dev/guide/static-deploy.html#github-pages)
- [Vuetify 4の導入](https://vuetifyjs.com/en/getting-started/installation/)
- [Piniaの導入と必須peer](https://pinia.vuejs.org/getting-started.html)
- [Vue RouterのHash History](https://router.vuejs.org/guide/essentials/history-mode.html)
- [VueUse useTitle](https://vueuse.org/core/usetitle/)
- [Voltaのプロジェクト固定](https://docs.volta.sh/guide/understanding#managing-your-project)
- [Vitest](https://vitest.dev/guide/) / [Playwrightのプロジェクト設定](https://playwright.dev/docs/test-projects)
- [ESLintの設定](https://eslint.org/docs/latest/use/configure/configuration-files)
- [setup-nodeのpackage.json読み取り実装](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/src/util.ts)

参照リポジトリのmainを読み取り専用で確認した。特にdaily-heatmapのpackage.json、CI、Vitest、Playwright、Routerファクトリ、domainとstoresの分離を参考にした。brain-trainingではpackage.jsonと、Clockを注入できるtraining Storeを確認した。既存2リポジトリへの変更はない。

## 実行結果

| コマンド                                         | 最終結果                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `npm ci`                                         | 成功、lockfileから再インストール、脆弱性0件                                |
| `npm run type-check`                             | 成功（アプリ・設定・E2E・単体テストを含む）                                |
| `npm run lint`                                   | 成功（OxlintとESLint、警告0件）                                            |
| `npm run format:check`                           | 成功                                                                       |
| `npm run test:unit`                              | 成功、2ファイル・3テスト                                                   |
| `npm run build`                                  | 成功、Vite 8.2.4でdistを生成                                               |
| `npm run test:e2e`                               | 成功、5プロジェクト・計15テスト                                            |
| `npx playwright install chromium firefox webkit` | 成功（インストール済みの対応ブラウザーを確認）                             |
| `npm ls --all`                                   | 成功                                                                       |
| CI YAML静的検証                                  | 成功（構文・トリガー・権限・Node/npm参照先）                               |
| Actionsの固定SHA照合                             | checkout v7.0.1、setup-node v7.1.0、upload-artifact v7.0.2の公式タグと一致 |
| `git diff --check`                               | 成功                                                                       |

単体テストではVueUseをモックせず、タイトルの初期設定・リアクティブ更新・スコープ終了後の追従停止を確認。Vue Test Utilsでは実際のVuetifyとRouterを組み合わせ、トップ表示、未知のネストURLでの404、リンクでの復帰、遷移時のタイトル更新を確認した。

E2EはChromium / Firefox / WebKit / Pixel 7 / iPhone 13で各3件。本番アセットのプロジェクトパス、ランタイムエラー・HTTPエラーのない初期表示、404の直接アクセスと再読み込み、ホーム復帰、戻る／進む、横幅、フォーカス後のEnter操作を確認した。スマートフォンはエミュレーションで、実機検証は行っていない。

初回からの調査・修正:

- Vitest 4.1.11の開発依存にnpm auditが2件のmoderateを報告した。修正済み4.1.12へ更新し、クリーンインストールと単体テストを再実行して0件になった。
- sandbox内ではポート待受がEPERMとなった。権限を伴うローカル実行でプレビューサーバーとブラウザーを起動し、E2Eを完了した。
- macOSのWebKitでTabによるリンク選択がOS設定に依存し、初回は2件失敗した。起点のフォーカスを明示してEnterによる移動を検証する形に変更し、全15件を再実行して成功した。

## 追加・変更ファイル

変更:

- `README.md`
- `docs/architecture.md`
- `docs/implementation-plan.md`

追加:

- `package.json` / `package-lock.json` / `.npmrc`
- `.gitignore` / `.gitattributes` / `.editorconfig`
- `.prettierrc.json` / `.prettierignore` / `.oxlintrc.json` / `eslint.config.ts`
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.vitest.json` / `env.d.ts`
- `index.html` / `vite.config.ts` / `vitest.config.ts` / `playwright.config.ts`
- `src/main.ts` / `src/App.vue` / `src/styles.css`
- `src/plugins/vuetify.ts` / `src/router/index.ts`
- `src/views/HomeView.vue` / `src/views/NotFoundView.vue`
- `src/composables/usePageTitle.ts` / `src/composables/usePageTitle.spec.ts`
- `src/__tests__/setup.ts` / `src/__tests__/App.spec.ts`
- `e2e/app.spec.ts` / `.github/workflows/ci.yml`
- `docs/phase-0-validation.md`

## 残件とフェーズ0.5への引き継ぎ

初回実装時はローカルの実装・必須コマンドまで完了し、push・PR作成が未承認のためリモートCIは実行していなかった。今回はコミット・作業ブランチへのpush・Issue #1のPR作成・同PRのCI修正が明示承認された。GitHub上でのCI結果はPR作成後に確認する。

マージ、Issue #1のクローズ、タグ作成、デプロイは今回も実施しない。

## コミット前レビューと再検証

- `git status`、現在ブランチ、`git diff`、`git diff --cached` を確認。既存変更を保持し、ステージ済み変更がない状態からレビューした。
- Issue #1と全36ファイルを確認。Vue・Vuetify・Pinia・Router、VueUse、型検査・Lint・テスト・CI・Pages設定に修正必須の不具合は見つからなかった。用途のない依存・ダミー実装・通信／ゲーム機能の先行実装はない。
- Volta / engines / lockfileのNode・npm指定と直接依存が一致。ローカルはNode.js 24.21.0 / npm 11.19.0。秘密鍵・GitHubトークン・AWSアクセスキー等のパターン検査は該当なし。
- README末尾の古い「開発開始時点の計画」を現状に合わせ、アーキテクチャのフェーズ0受け入れ条件に `test:e2e` を明記した。GitHub Pages、正式版まで継続する手動シグナリング、独自バックエンドなしの方針を維持している。
- `npm ci` / `npm run type-check` / `npm run lint` / `npm run format:check` / `npm run test:unit` / `npm run build` を再実行して成功。単体・コンポーネントテストは2ファイル・3件、インストール時の脆弱性報告は0件。
- `npm run test:e2e` も再実行して成功。Chromium / Firefox / WebKit / Pixel 7 / iPhone 13の全15件がリトライなしで成功した。

フェーズ0.5では、承認後のGitHub Pages公開、2台のスマートフォンでのLINE／コピー＆ペーストによる手動接続、REQUEST / RESPONSEのRTT、擬似カードアニメーションと操作感を検証する。`useClipboard` / `useDocumentVisibility` はその時点で必要な箇所へ追加する。STUN/TURNの必要性と接続できない環境の扱いも実機で評価する。詳細は [implementation-plan.md](implementation-plan.md) を参照。
