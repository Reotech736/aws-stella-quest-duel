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

## 採用構成

- フロントエンド: React + TypeScript + Vite
- ホスティング: AWS Amplify Hosting
- 認証: Amazon Cognito
- API: Amazon API Gateway HTTP API
- バックエンド: AWS Lambda
- データベース: Amazon DynamoDB
- ログ: Amazon CloudWatch Logs
- IaC: AWS SAM

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

## 開発ロードマップ

1. ゲームルールを文章化する
2. MVP要件を整理する
3. DynamoDBのテーブル設計を整理する
4. API一覧を整理する
5. フロントエンドの画面構成を整理する
6. 実装準備を行う
7. ローカルMVPを実装する
8. 実AWSバックエンドを構築して基本動作を確認する
9. 限定ベータ公開前のUIを改善する
10. Amplify Hostingで限定ベータ版を公開する

## 現在の進捗

- ゲームルール整理: 完了
- MVP要件整理: 完了
- データ設計整理: 完了
- API設計整理: 完了
- 画面構成整理: 完了
- 実装準備: 完了
- ローカルMVP実装: 完了
- 実AWSバックエンド構築・基本動作確認: 完了
- UI改善: 主要実装完了・手動回帰確認待ち
- Amplify限定ベータ公開: 計画作成済み・未着手

ゲームドメイン、DynamoDB永続化、Context/Room API、Game Query / Command API、Cognito認証クライアント、主要画面を実装済みです。SAMで`dev`環境をAWSへデプロイし、Cognitoの2ユーザーを使ってローカルフロントエンドからゲーム終了までの基本動作を確認しました。

カードや盤面の視認性、用語、操作フィードバック、ルール導線、ピクセルアート、短い演出、効果音設定まで実装済みです。次はPC・スマートフォン相当の実表示と2ユーザー対戦を回帰確認します。その後、Amplify Hostingの共有パスワード付き環境へ公開し、確定したURLをAPIのCORSへ反映します。アカウント全体のBudgetは設定済みで、プロジェクトタグに絞ったBudgetのIaCは未デプロイです。

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

SAMテンプレートのローカル検証:

```bash
cd backend
npm ci
cd ../infrastructure
SAM_CLI_TELEMETRY=0 sam validate --lint --template-file template.yaml
PATH="$(pwd)/../backend/node_modules/.bin:$PATH" \
  SAM_CLI_TELEMETRY=0 sam build --template-file template.yaml --parallel
```

SAMビルドは既存のバックエンド開発依存に含まれるesbuildを使用します。上記コマンドはテンプレート変換とLambdaバンドルだけを行い、AWSリソースを作成しません。

SAM管理リソースには、`Project=stella-quest-duel`、`Environment=dev`、`ManagedBy=aws-sam`を基本タグとして付与します。デプロイ後、`Project`と`Environment`をコスト配分タグとして有効化します。

フロントエンドを実APIへ接続する場合は、`frontend/.env.example` のキーを参照してローカルの `.env` へ公開設定を入力します。認証情報や秘密鍵は保存しません。

## ドキュメント

- [AGENTS.md](./AGENTS.md)
- `workspace/plans/01-roadmap.md`
- `workspace/plans/02-rules-discovery.md`
- `workspace/plans/03-mvp-requirements.md`
- `workspace/plans/04-data-model.md`
- `workspace/plans/05-api-design.md`
- `workspace/plans/06-screen-flow.md`
- `workspace/plans/07-implementation-readiness.md`
- `workspace/plans/08-aws-deployment.md`
- `workspace/plans/09-ui-improvement.md`
- `workspace/plans/10-amplify-beta-release.md`
- `docs/cost-management.md`
- `docs/architecture.md`（必要に応じて作成）
- `docs/rules.md`（必要に応じて作成）

## 開発ルール

- 実装前に方針を確認する
- 不要な依存ライブラリは追加しない
- APIキー、トークン、認証情報、個人情報をコミットしない
- AWSリソースの作成・変更・削除、デプロイは明示的な確認なしに行わない

詳細な開発フローやコミット規約は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
