# フェーズ0.5：通信・操作感の検証

作業日：2026-10-28（Asia/Tokyo）／Issue：[#3](https://github.com/tatsuya0903/speed-card-game/issues/3)

ブランチ：`codex/3-webrtc-validation`。着手時にPR #2の `merged: true` をGitHubから確認し、そのマージコミット `528e02df4ff9976822a79c49493a5b68d985ace0` を起点にした。Issue #3は作成済みで、初回のローカル実装時点では外部書き込みは行っていない。

## 実装要件と受け入れ範囲

- GitHub Pagesの静的配信と、正式版も継続するLINE／コピー＆ペーストによる手動シグナリング。
- Non-Trickle ICE、ordered/reliable DataChannel、双方向REQUEST / RESPONSE、actionIdによる対応付け。
- 接続情報・メッセージの送受信時検証、ICE・接続・要求のタイムアウト、中止・終了・再生成・ページ離脱時の後始末。
- 通常RTTと人工遅延込みの測定を分離。連続測定・受信表示・候補タイプ表示。
- 100/200/300msの擬似カード、先行移動、待機、成功・拒否・結果不明・遅着応答、低減モーション。
- FakeTransportの安定したテストと、実WebRTCの統合テストを分離。
- 手動公開用ワークフローと手順まで作成。公開と実機確認は別途承認・ユーザー操作が必要。

ゲームルール、配札、山札、勝敗、競合仲裁、時計同期、バックエンド、DB、認証、TURNは実装しない。

## ファイルと責務

| ファイル                                                                                                 | 責務                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/network/protocol.ts`                                                                                | バージョン付きJSON、接続情報・通信メッセージの検証とシリアライズ             |
| `src/network/transport.ts`                                                                               | MessageTransport（state / send / onMessage / onState / close）               |
| `src/network/rtcTransport.ts`                                                                            | 標準RTC API、ICE収集、手動Offer / Answer、接続状態、候補タイプ、リソース解放 |
| `src/network/fakeTransport.ts`                                                                           | ネットワークを使用しない模擬通信のペア                                       |
| `src/diagnostics/session.ts`                                                                             | 要求対応付け、応答、重複除去、タイムアウト、連続測定、通常・人工遅延系列     |
| `src/diagnostics/statistics.ts`                                                                          | RTT統計の純粋関数                                                            |
| `src/composables/useCardAnimation.ts`                                                                    | 通信とは独立した演出状態と端末内経過時間                                     |
| `src/components/DiagnosticPanel.vue`                                                                     | 計測・カードのUI、受信表示、低減モーション、背景移行時の連続測定停止         |
| `src/views/HomeView.vue`                                                                                 | ホスト・ゲスト操作、useClipboard、useDocumentVisibility、pagehide時の終了    |
| `src/styles.css`                                                                                         | タッチ操作向け寸法、レスポンシブ表示、transformによる移動                    |
| `src/network/*.spec.ts` / `src/diagnostics/session.spec.ts` / `src/composables/useCardAnimation.spec.ts` | モックRTC・FakeTransport・時計による単体テスト                               |
| `src/__tests__/rtcFixtures.ts`                                                                           | 不完全なダミーSDPを使った検証用fixture（実接続には使用しない）               |
| `e2e/diagnostics.spec.ts`                                                                                | 安定した主要UIテスト                                                         |
| `e2e/rtc/connection.spec.ts` / `playwright.rtc.config.ts`                                                | 独立した2つのChromiumプロセスを使う実WebRTC統合テスト                        |
| `playwright.config.ts` / `package.json`                                                                  | 通常E2Eから実RTCを分離、test・test:rtcコマンドを追加                         |
| `.github/workflows/deploy.yml`                                                                           | CI成功コミットのみを対象とする手動Pages公開                                  |
| `README.md` / `docs/architecture.md` / `docs/implementation-plan.md` / 本書                              | 現在の設計・操作・検証・公開手順                                             |

既存のVue / TypeScript / Vite / Vuetify / Pinia / Router / VueUse / Volta / Vitest / Playwrightを継続し、依存パッケージは追加していない。Piniaは既存のアプリ登録を維持し、診断接続は画面のライフサイクル内で管理する。

## 接続設計

`RtcTransport` はVue・VueUse・演出に依存しない。`DiagnosticSession` は `MessageTransport` のみを受け取り、WebRTCとFakeTransportを同じ経路で利用する。将来は診断メッセージのunionへゲームの要求・応答を追加し、ゲームエンジンからこの境界を利用する。未使用の仲裁器・同期器・汎用RPCフレームワークは作成しない。

状態は `idle → gathering → awaiting-answer / connecting → connected`。切断は `disconnected`、失敗は `failed`、明示終了は `closed`。一時切断から接続が復帰する場合は状態を再確認する。90秒を超える接続待機・切断は終了して再生成を案内する。自動ICE restartは行わず、新しいOffer / Answerを交換する。

ホストがDataChannelを作成し、ゲストは `datachannel` イベントで受け取る。チャネル名は `speed-v1`、ordered=true、maxRetransmitsとmaxPacketLifeTimeは指定しない。異なる設定や2本目のチャネルは拒否する。送信バッファが64KiBを超えると追加送信を止める。

ICE収集は最大20秒で、`iceGatheringState === 'complete'` 後のlocalDescriptionだけを公開する。中止・期限超過はチャネル・PeerConnection・タイマー・イベントを解放し、未完了の情報を出力しない。古い非同期操作が再試行後の状態を書き換えないようAbortSignalと操作識別子を使う。`pagehide`・画面コンポーネントの破棄でも終了する。BFCacheからの復帰は終了状態となる。ブラウザーが強制破棄した場合も接続を復元せず、再生成が必要。

接続情報は最大65,536 UTF-8バイト、`{ version: 1, sessionId, type: 'offer' | 'answer', sdp }`。ホストが生成したsessionIdをAnswerで返し、ホストは一致を確認する。JSON構造・種別・ID・SDPのDataChannel/ICE/DTLSに必要な項目・候補の存在を検証し、SDPの最終的な妥当性はブラウザーのsetRemoteDescriptionでも検証する。接続情報は保存しない。相手との交換に限り、公開ログへ貼らない。

通信JSONは最大2,048 UTF-8バイト。version/type/actionId、厳密なフィールド集合、probe/card、遅延0〜10000ms（整数）、accept/reject/drop、acceptedの真偽値を検証する。不正・バイナリ入力は破棄する。両方向で独立したactionIdを利用し、未対応・重複応答は統計へ加算しない。要求の重複は直近2,048IDで除去し、同時保留と遅延応答タイマーは256件までに制限する。これは診断用の有限キャッシュで、将来のゲームの恒久的な冪等性保証を代用しない。

公開STUNは `stun:stun.l.google.com:19302`。TURN・独自サーバーは使用しない。getStatsから選択された候補ペアのhost / srflx / prflx等を取得し、取得できないブラウザーでは不明・取得不可と表示する。IPアドレスは画面に表示しない。

## 操作方法

1. 同じアプリを2台で開く。ホストは「接続を開始」。
2. ICE収集完了後「Offerをコピー」を押し、LINE等でJSON全文を相手へ送る。
3. ゲストは「接続に参加」。受け取ったOffer全文を貼り「Answerを生成」。
4. 「Answerをコピー」でホストへ返し、その画面のまま接続を待つ。
5. ホストはAnswer全文を貼り「Answerを適用して接続」。双方に「接続済み」と診断画面が表示される。
6. どちらからでも「1回計測」「連続測定を開始」「カードを送信」を操作できる。
7. 失敗・ページ再読み込み時は、双方「中止・接続終了」後に新しい情報を生成する。古いAnswerは流用しない。

JSONを引用符やコードブロックで包まず、そのまま全文交換する。コピーが失敗した場合はreadonly欄を選択・長押しして全文をコピーする。貼り付けはOS標準の長押しメニューを使える。クリップボードの読み取り権限はアプリから要求しない。

## 計測仕様

- 送信端末内で要求開始と対応する応答受信を `performance.now()` で測る。相手の時計値は送らず、片道遅延は算出しない。
- RTTにはブラウザーのイベント処理・応答処理の時間も含む。通信回線だけの遅延ではない。
- 通常（delayMs=0）と人工遅延込み（delayMs>0）を別系列にする。人工遅延分を単純に差し引いて実RTTとはしない。
- 最新・平均・中央値・P95・最大は、各系列の直近1,000件の期限内応答を対象とする。中央値はソートした中央値、偶数件は中央2値の平均。P95は `ceil(n × 0.95)` 番目のnearest-rank。
- 送信回数、応答回数、タイムアウト回数、遅着回数は接続セッション全体の累計。拒否も応答成功として数える。
- 要求の期限は3,000ms。期限超過サンプルはRTT統計に含めない。遅着応答はタイムアウト後60秒まで保持して結果を確定でき、応答・遅着件数へ加算する。このためタイムアウト件数と応答件数は重なる場合がある。
- 切断・終了で保留要求を結果不明として解放する。切断をタイムアウト件数や拒否件数へ加算しない。
- 連続測定は50/100回、送信間隔20〜10000ms。応答を待たず一定間隔で送信する。送信完了後も応答は計数する。停止は未送信分だけを取り消し、送信済み要求は継続して追跡する。画面非表示では停止する。
- 受信側はREQUEST受信直後に件数・actionId先頭と背景色を更新し、人工遅延より前に視覚表示する。

前進時間100/200/300msと、成功時の最後の60ms・拒否時の戻り120msは別に計測する。早い応答でも前進を継続し、遅ければ台札直前で待つ。タイムアウトは結果不明として保持し、拒否に変換しない。低減モーションでは移動時間を0として状態のみ更新する。

前進・確定/戻り・待機を含む全体の経過時間は端末内タイマーによる近似で、物理画面の描画完了を保証しない。バックグラウンドではタイマー・描画が抑制され得る。復帰後の要求期限は時計で再評価する。

## ローカル検証結果（初回実装）

最終コードで以下を記載順に実行し、すべて成功した（Node.js 24.21.0 / npm 11.19.0）。

| コマンド                 | 結果                                                    |
| ------------------------ | ------------------------------------------------------- |
| `npm ci`                 | 成功、331パッケージを再インストール、脆弱性0件          |
| `npm run type-check`     | 成功（アプリ・設定・単体・E2Eを含む）                   |
| `npm run lint`           | 成功、Oxlint / ESLintの警告0件                          |
| `npm run format`         | 成功                                                    |
| `npm run test`（1回目）  | 単体6ファイル・39件、5ブラウザー設定のUI E2E 40件が成功 |
| `npm run build`          | 成功、既存base配下の本番成果物を生成                    |
| `npm run test`（2回目）  | 単体39件・UI E2E 40件が再び成功、リトライなし           |
| `npm run test:rtc`       | 実WebRTC統合テスト1件が成功、リトライなし               |
| CI / deploy YAML構文検証 | 成功。追加する公式Pages Actionsのv4タグと固定SHAを照合  |
| `git diff --check`       | 成功                                                    |

単体ではOffer / Answerの生成・検証、ICE完了・20秒の期限超過・中止、接続・切断・復帰・終了・初期化失敗・再生成、要求・応答の対応付け、不正・重複メッセージ、統計・1,000件の保持上限、50/100回の連続測定、遅延・拒否・結果不明・遅着、低減モーションと後始末を確認した。

UI E2EはChromium / Firefox / WebKit / Pixel 7 / iPhone 13で各8件。スマホ相当の画面幅、手動接続の貼り付けエラー、モックRTCによる接続情報のコピー失敗時の案内・全文選択・Offer貼り付け・Answer生成、画面復帰、FakeTransportによるRTT・拒否・遅延・タイムアウト、連続測定、背景移行時の停止を確認した。

実RTCは独立した2つのChromiumプロセスで、実際に生成したOffer / AnswerをOSクリップボード経由で読み取り、画面へ貼り付けた。双方向REQUEST / RESPONSE、受信表示、4秒の人工遅延による結果不明から遅着成功への遷移、相手終了・新しいOfferへの再生成・ページ再読み込みを確認した。同じPC内の接続であり、異なるスマートフォンや回線の検証ではない。

初回UIテストで選択欄のラベル取得が失敗したため、明示的なaria-labelを付けて修正した。最終レビューでは疑似応答設定が文字列であることを厳密に検証し、配列等を拒否する回帰テストを加えた。sandbox内ではポート待受がEPERMになるため、ローカルサーバーとブラウザーのテストを権限付きで実行した。

初回のローカル実装時点ではリモートCIとPages公開は未実行で、push・PR作成・マージ・デプロイは行っていない。実機確認・LINEアプリとの往復・異なるネットワークでの接続性は未確認のまま管理する。

最終ビルドをPixel 7相当の画面幅でも撮影して目視確認した。横方向へのはみ出しがないことと、成功時のカードと台札の位置が一致することを確認した。確認用のブラウザーとプレビューサーバーは終了した。検証結果追記後のformat:checkも成功した。

`npm run test` は単体＋通常E2E。通常E2EはChromium / Firefox / WebKit / Pixel 7 / iPhone 13で実行する。`npm run test:rtc` は実WebRTC専用で、外部STUNや実行環境の影響を受けるため通常CIと分離した。CIは既存の品質・E2Eを維持する。

## PR前の最終レビューと再検証

2026-10-28、Issue #3・git status・変更差分・既存の検証記録・全25ファイルを照合した。今回の依頼でコミット・作業ブランチへのpush・main宛てのPR作成・CI修正が承認された。マージ・Issueのクローズ・Pages公開・タグ作成は承認されておらず、実施しない。

修正した問題:

- Offer / Answerの生成完了直後に再試行が入ると、呼び出し元のawait再開時に旧処理が状態を書き換える余地があった。各await後にPeerConnectionとAbortSignalの一致を確認し、古いSDP生成・チャネルイベント・接続期限処理が新しい接続へ影響しないようにした。
- getStatsやクリップボード操作の完了が終了・再試行後に届いても、古い候補タイプや通知を新しい画面へ反映しないようにした。
- バックグラウンドで期限タイマーが抑制された場合、遅着応答を所定の保持期限より長く受け入れる余地があった。performance.now()による経過時間で保持期限も検証し、期限を過ぎた応答は結果確定・RTT統計へ加算しないようにした。

上記の競合・期限超過を再現する回帰テスト6件を追加した。Non-Trickle ICE、ordered/reliable、入力サイズ・内容の検証、actionId、重複除去、P50・P95、通常RTTと人工遅延の分離、早着・遅着・拒否・結果不明、LINE復帰とコピー失敗の案内を再確認した。ゲームルール・時計同期・バックエンドや未使用の抽象化は追加していない。

Pagesワークフローは手動実行のみで、指定SHAのmain push CI成功とmainへの包含を検証する。公式deploy-pages v4のソース・READMEとも照合し、公開用のpages: write / id-token: writeがdeployジョブだけにあることを確認した。変更25ファイルの秘密鍵・GitHub/npmトークン・AWSアクセスキーのパターン検査は該当なし。STUNは公開ホスト名のみで、接続JSON・実アドレス・ICE資格情報を永続保存・リポジトリへ記録しない。

再検証結果は、単体45件・PC/スマホE2E 40件・実WebRTC統合1件が成功。npm ci（脆弱性0件）、type-check、lint（警告0件）、format:check、build、git diff --checkも成功した。E2EはCI同様に--fail-on-flaky-testsを付け、リトライなしで完了した。実RTC成功は同一PC内の独立した2つのChromiumプロセスによる結果で、スマートフォン実機の保証ではない。

PRはRefs #3で関連付ける。公開とスマートフォン実機検証が残るため、Issue #3はOpenを維持する。PRの最新コミットのリモートCI結果はPR Checksと作業完了報告で確認する。Pagesワークフロー自体の公開実行は行わない。

## Pages公開手順（未実行・別途承認が必要）

1. 実装レビュー後、承認を得て作業ブランチをpushしPRを作成する。mainへのマージも別途承認を得る。
2. マージ後のmainのCI（quality・e2e）が成功した40桁SHAを控える。
3. 公開の承認後、リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にする。
4. 必要なら Settings → Environments → github-pages でmainへの限定とRequired reviewersを設定する（利用可能なプランで）。
5. Actions → **Deploy Pages (manual)** → Run workflow。ブランチmainを選び、承認したSHAを `commit_sha` に指定する。
6. ワークフローが該当SHAの最新main push CI実行のcompleted/successとmainへの包含を確認し、そのSHAだけをビルドする。別のSHAのCI成功では公開できない。
7. `github-pages`環境の承認待ちがあれば承認する。Pages書き込み・OIDC権限はdeployジョブだけに付与する。
8. 成功後、`https://tatsuya0903.github.io/speed-card-game/` とHash Routerの遷移を確認する。このURLは予定URLで、現時点の公開確認結果ではない。

pushによる自動公開・workflow_runによる自動公開はない。ワークフローを作成しただけではPagesを有効化しない。Actionsのアップロード・デプロイ処理はローカルでは実行していない。公式仕様：[GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## スマートフォン実機検証（ユーザーが実施）

公開承認後、以下を2台の端末で実施する。開発PCのlocalhostは別のスマートフォンからは開けないため、実機はHTTPSのPages URLを使う。

- iPhone Safari、iPhone Chrome、Android ChromeのOS・ブラウザーバージョンを記録する。iPhoneのブラウザーをエンジン名だけで同一扱いせず、それぞれ操作する。
- iPhone同士・iPhone対Androidを組み合わせ、役割を交換する。
- Wi-Fi同士（同一・異なるWi-Fi）、Wi-Fi対モバイル回線、可能ならモバイル回線同士で接続を試す。TURNなしの接続失敗も結果として記録する。
- LINEとの往復、全文コピー・長文貼り付け、戻る・ロック画面・復帰、ページ再読み込み、終了・再生成、通信中のネットワーク切り替えを試す。
- 双方向の単発測定と50/100回測定を行い、間隔20/200/1000msで変化を見る。通常RTTと人工遅延込みを混ぜない。
- 100/200/300msの前進と成功・拒否・500ms遅延・4000ms遅延・応答なしを比べる。4000msでは一度結果不明となり、遅着で成功することを確認する。
- 「視差効果を減らす」等を有効にして移動が省略されること、縦横画面・タッチ領域・文字サイズ・ソフトキーボードで操作できることを確認する。

| 日時 / SHA | 端末A / OS / ブラウザー | 端末B / OS / ブラウザー | 回線の組合せ | 接続 / 候補タイプ | 通常RTT 最新・平均・P50・P95・最大 | 回数 / 間隔 / timeout | 演出・LINE復帰・備考 |
| ---------- | ----------------------- | ----------------------- | ------------ | ----------------- | ---------------------------------- | --------------------- | -------------------- |
| 未実施     | —                       | —                       | —            | —                 | —                                  | —                     | —                    |

## 制約と次フェーズ

- 実機・異なるネットワークでの接続性、LINE往復、バックグラウンドからの復帰、体感速度は未確認。ローカルの実RTC成功は実機完了を意味しない。
- TURNなしで接続不能なNAT・ファイアウォール・キャリア構成がある。公開STUNの可用性にも依存する。
- 認証はなく、LINE等で信頼できる相手と情報を交換する前提。sessionIdは交換取り違えの防止用で、本人認証ではない。
- 結果不明の要求をゲームの失敗や自動再提出へ変換しない。次フェーズで正式な状態照会・冪等性・再同期を設計する。
- 次フェーズは実機記録から前進時間・待機表示を評価し、ゲームドメインを独立実装する。ホスト仲裁・時計同期・勝敗判定はそれぞれ別に設計する。
