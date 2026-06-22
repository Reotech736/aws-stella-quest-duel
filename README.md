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
- 現在のゲーム状態の保存
- 操作履歴またはイベントログの保存

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

## ドキュメント

- [AGENTS.md](./AGENTS.md)
- `workspace/plans/01-roadmap.md`
- `workspace/plans/02-rules-discovery.md`
- `docs/architecture.md`（必要に応じて作成）
- `docs/rules.md`（必要に応じて作成）

## 開発ルール

- 実装前に方針を確認する
- 不要な依存ライブラリは追加しない
- APIキー、トークン、認証情報、個人情報をコミットしない
- AWSリソースの作成・変更・削除、デプロイは明示的な確認なしに行わない

詳細な開発フローやコミット規約は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
