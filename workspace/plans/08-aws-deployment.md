# 08-aws-deployment

## 目的

このドキュメントは、ステラクエスト Duelの限定ベータ環境をAWSへ構築するときに、SAMテンプレートの設定とAWS上のリソースを対応付けて理解するための資料です。

IaCを設定の正本とし、CloudFormation変更セットと各サービスのコンソールを使って、実際に生成された設定を確認します。コンソールからSAM管理リソースを直接変更すると設定差分が生じるため、修正は原則として `infrastructure/template.yaml` へ反映します。

## 現在の状態

- 対象リージョン: `ap-northeast-1`
- 環境名: `dev`
- CloudFormationスタック名: `stella-quest-duel-dev`
- SAM管理用S3バケット: 作成済み
- Lambda成果物: アップロード済み
- CloudFormation変更セット: 作成済み、未実行
- アプリケーションリソース: 未作成

変更セットは23件すべて新規追加で、状態は `CREATE_COMPLETE`、実行状態は `AVAILABLE` です。

## IaCを優先する理由

- 同じ設定を再現できる
- 変更前に差分を確認できる
- IAM権限をコードレビューできる
- 作成順序と依存関係をCloudFormationへ任せられる
- 手作業による設定漏れを減らせる
- 不要になった環境をスタック単位で管理できる

Budget、通知先、Amplify HostingのGit接続、Cognito利用者作成など、外部情報や管理者操作を伴う項目はSAM外で管理します。

## 作成予定リソース

### CloudFormation

CloudFormationスタックが、以下のAWSリソースをまとめて管理します。

コンソール確認場所:

- CloudFormation
- スタック
- `stella-quest-duel-dev`

変更時は、リソースをコンソールで直接編集せず、SAMテンプレートを変更して新しい変更セットを作成します。

### SAM管理用S3バケット

SAM CLIが、ビルド済みLambdaコードと変換済みテンプレートをアップロードするために使用します。

このバケットはアプリケーションの公開ファイル置き場ではありません。通常のゲーム処理からアクセスしません。

### DynamoDB

用途:

- ルーム
- ユーザーのアクティブコンテキスト
- 参加試行制限
- ゲーム状態
- イベントログ
- 冪等性リクエスト

主な設定:

| 項目 | 設定 |
| --- | --- |
| 課金モード | `PAY_PER_REQUEST` |
| パーティションキー | `PK` |
| ソートキー | `SK` |
| TTL属性 | `purgeAt` |
| サーバー側暗号化 | 有効 |
| スタック削除時 | テーブルを保持 |

オンデマンド課金により、事前にキャパシティを予約しません。アクセスが少ない限定ベータに合わせた設定です。

コンソールでは、テーブルの「概要」「項目を探索」「追加設定」からキー、TTL、暗号化、タグを確認します。

### Cognito User Pool

用途:

- 招待ユーザーの認証
- API Gatewayへ渡すJWTの発行

主な設定:

| 項目 | 設定 |
| --- | --- |
| 自己登録 | 無効 |
| 利用者作成 | 管理者のみ |
| ユーザー名 | 大文字・小文字を区別しない |
| メール確認 | 有効 |
| 最小パスワード長 | 12文字 |
| 必須文字種 | 英大文字、英小文字、数字、記号 |
| スタック削除時 | User Poolを保持 |

User Pool Clientはブラウザ向けの公開クライアントとして作成し、クライアントシークレットを持ちません。認証フローにはSRPとリフレッシュトークンを使用します。

コンソールでは「ユーザープール」「アプリケーションクライアント」「サインアップエクスペリエンス」「サインインエクスペリエンス」を確認します。

### API Gateway HTTP API

用途:

- フロントエンドからLambdaへのHTTP入口
- Cognito JWTの検証
- CORS
- リクエスト流量制御

主な設定:

| 項目 | 設定 |
| --- | --- |
| API種別 | HTTP API |
| ステージ | `dev` |
| 認証 | Cognito JWT Authorizer |
| 初期CORS許可元 | `http://localhost:5173` |
| Cookie認証 | 使用しない |
| 通常スロットリング | 5 requests/second、burst 10 |
| ルーム参加 | 2 requests/second、burst 5 |
| ルーム取得 | 10 requests/second、burst 20 |
| ゲーム取得 | 20 requests/second、burst 40 |

初回はローカルフロントエンドだけをCORS許可します。Amplify HostingのURL確定後、`AllowedOrigin`を更新して再デプロイします。

### Lambda

3つのLambdaへ責務を分けます。

| Lambda | 主な責務 |
| --- | --- |
| Context/Room | コンテキスト、ルーム作成・参加・退出・開始 |
| Game Query | 閲覧者向けゲーム状態取得、放棄期限判定 |
| Game Command | ゲーム操作、投了 |

共通設定:

| 項目 | 設定 |
| --- | --- |
| Runtime | `nodejs24.x` |
| Architecture | `x86_64` |
| Memory | 256 MB |
| Timeout | 10秒 |
| Build | esbuild、ESM、minify |
| `TABLE_NAME` | DynamoDBテーブル名 |
| `LOG_LEVEL` | `INFO` |
| `ALLOWED_ORIGIN` | CORS許可元 |

Lambdaはアクセスがあるときだけ実行され、常駐サーバーは作りません。

### IAM Role

各Lambdaに専用の実行ロールを作成します。

信頼ポリシー:

- `lambda.amazonaws.com` だけがロールを引き受けられる

共通管理ポリシー:

- `AWSLambdaBasicExecutionRole`
- CloudWatch Logsへのログ出力に使用

DynamoDB権限:

- 対象はこのスタックのゲームテーブルだけ
- `GetItem`
- `TransactWriteItems`
- Context/Room Lambdaだけ、参加試行制限の単独保存に使う `PutItem` も許可

アカウント内の全DynamoDBテーブルを操作できる権限は付与しません。

### CloudWatch Logs

各Lambdaに専用Log Groupを作成し、保持期間を14日にします。

スタック削除時はLog Groupを削除します。DynamoDBテーブルとCognito User Poolは保持するため、スタック削除だけではすべてのデータが消えない点に注意します。

## タグ

SAM管理リソースには、対応するリソースタイプがタグをサポートする範囲で以下を付与します。

| Key | Value |
| --- | --- |
| `Project` | `stella-quest-duel` |
| `Environment` | `dev` |
| `ManagedBy` | `aws-sam` |

デプロイ後、Billing and Cost Managementの「コスト配分タグ」で `Project` と `Environment` を有効化します。

## 変更セットの読み方

変更セットのOperationが `Add` の場合は新規作成です。今回の初回変更セットには更新や置換はありません。

今後の更新では、`Replacement=True` の変更に特に注意します。置換は既存リソースを作り直す可能性があり、DynamoDBやCognitoではデータ・認証への影響を確認してから実行します。

## ロールバック

デプロイ中に作成失敗が発生した場合、CloudFormationのロールバックを有効にしています。

ただし、`DeletionPolicy: Retain` を指定したDynamoDBテーブルとCognito User Poolは、ロールバックやスタック削除後も保持される場合があります。意図しない課金や孤立リソースがないか、失敗後にも確認します。

## 次の確認

変更セット実行前に、以下を確認します。

- 作成予定が23件の新規追加だけである
- リージョンが `ap-northeast-1` である
- 環境名が `dev` である
- CORS許可元が `http://localhost:5173` である
- IAMロールが対象DynamoDBテーブルだけを操作する
- DynamoDBとCognitoがスタック削除時に保持される
- Amplify Hostingは今回作成されない
