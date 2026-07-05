# aws-stella-quest-duel

「ステラクエスト」を二人対戦用Webアプリとして実装するプロジェクトです。

AWSの学習を兼ねて、小さく理解しやすいサーバーレスアプリケーションを段階的に作ることを目的としています。

## 目的

- 二人対戦用のWebアプリとして「ステラクエスト」を実装する
- AWSサーバーレス構成の学習を進める
- 最初はMVPに絞り、設計と仕様整理を優先する

## 基本方針

- いきなり大規模な構成にしない
- まずは設計・仕様・データ構造を整理する
- MVP完成前に機能を広げすぎない
- ゲームルール判定はサーバー側で行う
- クライアント側は表示と操作入力を主な責務とする

## 想定する初期構成

- フロントエンド: React または Next.js
- ホスティング: AWS Amplify Hosting
- 認証: Amazon Cognito
- API: Amazon API Gateway HTTP API
- バックエンド: AWS Lambda
- データベース: Amazon DynamoDB
- ログ: Amazon CloudWatch Logs

## MVPの初期スコープ

- 二人固定のオンライン対戦
- ゲームルール上のダミープレイヤー
- ターン制ゲーム
- HTTP API + ポーリング
- 管理者が招待した知人だけが利用できる限定公開
- 認証済みユーザーによる6桁ルームIDでの参加
- 現在のゲーム状態の保存
- 操作履歴またはイベントログの保存

## 初期公開方針

- Amazon Cognitoの自己登録を無効化する
- 管理者が利用者アカウントを手動作成する
- 認証済みユーザーであれば誰でもルームを作成できる
- 公開ルーム一覧や匿名利用は提供しない
- 限定試験中はAmplify Hostingを共有パスワードで保護する
- 月額5 USDのAWS Budgetを設定し、利用料金を監視する
- 実AWSリソースは明示的な確認なしに作成・変更しない

実装対象外:

- CPU対戦

後回しにするもの:

- 観戦
- ランキング
- チャット
- 課金
- WebSocketやAppSync Subscriptionの導入

## 現在の開発順序

1. `workspace/plans/` に全体 plan と個別 plan を追加する
2. ゲームルールを文章化する
3. MVP要件を整理する
4. DynamoDBのテーブル設計を整理する
5. API一覧を整理する
6. フロントエンドの画面構成を整理する
7. 実装に入る

## 現在の進捗

- ゲームルール整理: 完了
- MVP要件整理: 完了
- データ設計整理: 完了
- API設計整理: 完了
- 画面構成整理: 完了
- 実装準備: 完了
- 実装開始: 進行中

React + Viteのフロントエンド土台と、TypeScript Lambdaのバックエンド土台を作成しました。

ゲームドメインは初期化から終了・公開状態まで実装済みです。DynamoDBアクセスでは、ゲーム状態とRoom系の取得、楽観的ロック、ルーム作成・参加・ゲーム開始のトランザクションまで実装しています。次は参加失敗回数・ブロック期限の更新、冪等性リクエストの再実行判定、退出・期限切れ処理を実装します。

## ローカル開発

前提:

- Node.js 24
- npm

フロントエンドの確認:

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

開発サーバー:

```bash
cd frontend
npm run dev
```

バックエンドの確認:

```bash
cd backend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

AWS CLI、SAM CLI、Dockerは導入済みですが、現時点ではAWS認証設定、SAMテンプレート、デプロイを使用しません。

## ドキュメント

- [AGENTS.md](./AGENTS.md)
- `workspace/plans/01-roadmap.md`
- `workspace/plans/02-rules-discovery.md`
- `workspace/plans/03-mvp-requirements.md`
- `workspace/plans/04-data-model.md`
- `workspace/plans/05-api-design.md`
- `workspace/plans/06-screen-flow.md`
- `workspace/plans/07-implementation-readiness.md`
- `docs/architecture.md`（必要に応じて作成）
- `docs/rules.md`（必要に応じて作成）

## 開発ルール

- 実装前に方針を確認する
- 不要な依存ライブラリは追加しない
- APIキー、トークン、認証情報、個人情報をコミットしない
- AWSリソースの作成・変更・削除、デプロイは明示的な確認なしに行わない

詳細な開発フローやコミット規約は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
