WebRTCを使ったトランプ「スピード」オンライン2人対戦アプリの新規開発を始めます。

参照する既存の2プロジェクト（mainブランチ）:
- https://github.com/tatsuya0903/brain-training
- https://github.com/tatsuya0903/daily-heatmap

同梱の Speed_Existing_Projects_Architecture_Guide_v1.md を読んでください。既存2リポジトリは参照専用で変更しないこと。

設計方針:
- daily-heatmap のレイヤー分離（domain / stores / components / composables）、Hash Router、CI、VitestとPlaywright、GitHub Pages配信方式を参照。
- brain-training の注入可能な Clock と performance.now()、DOM描画タイミング考慮、効果音/触覚フィードバックを参考。
- 新アプリ固有のドメインゲーム処理、WebRTC/DataChannel、シグナリング、ホスト仲裁、時計差推定、カードアニメーションは互いに独立させる。
- 場札の自動補充、手詰まり時の双方READY、操作時刻と反応時間の記録、競合時のホスト判定、通信応答を移動演出中に受ける方式は既存仕様として維持。

今回の作業はフェーズ0だけです:
1. package.json / Node・npm固定 / TS strict / Vue 3 / Vite / Vuetify / Pinia / Hash Router の基盤構築。
2. ディレクトリ構成、トップ画面、NotFound表示、GitHub Pagesのbase設定。
3. Vitest・Playwrightの基本テスト、Lint（検査のみ）・Prettier・GitHub Actions CI。
4. npm ci / type-check / lint / format:check / test:unit / build の実行と報告。
5. フェーズ1以降のIssue案と未決事項を報告。

ゲームルール本体、シグナリング、WebRTC通信、カード移動アニメーションの実装はまだ行わない。
外部へのpush・PR作成・マージ・デプロイは明示承認がある場合だけ行う。
