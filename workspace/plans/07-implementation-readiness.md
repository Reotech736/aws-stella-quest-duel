# 07-implementation-readiness

## 概要

このドキュメントは、「ステラクエスト Duel」MVPの実装開始前に、技術構成、ディレクトリ構成、依存関係、ローカル確認方法、実装順序を決定するための初期案です。

ゲームルール、MVP要件、データ設計、API設計、画面構成は `workspace/plans/02-rules-discovery.md` から `workspace/plans/06-screen-flow.md` を正とします。

## 整理状態

状態: 完了

## 技術選定

### フロントエンド

| 項目 | 選定 |
| --- | --- |
| UI | React |
| 言語 | TypeScript |
| ビルド | Vite |
| ルーティング | React Router |
| 認証クライアント | AWS Amplify LibraryのAuth機能 |
| ホスティング | AWS Amplify Hosting |
| レンダリング | クライアントサイドSPA |

#### React + Viteを選ぶ理由

- SEO、サーバーサイドレンダリング、静的ページ生成をMVPで必要としない
- ゲーム画面は認証後のクライアント操作が中心である
- Next.jsのサーバー機能を使わず、構成を小さく保てる
- フロントエンドとAPI Gateway/Lambdaの責務を分けて学びやすい
- Amplify HostingでSPAとして配信できる

Amplify Hostingでは、`/rooms/...` や `/games/...` を直接開いても `index.html` へ到達するSPA向けリライトルールを設定します。

#### 認証画面

画面構成を `06-screen-flow.md` に合わせるため、完成済みのAuthenticator UIをそのまま使用せず、Amplify Authの関数を利用して画面を実装します。

クライアントで扱う主な認証処理:

- サインイン
- 初回パスワード変更
- 現在セッション取得
- アクセストークン取得
- サインアウト

自己登録、SNSログイン、利用者管理画面は実装しません。

### バックエンド

| 項目 | 選定 |
| --- | --- |
| 言語 | TypeScript |
| Lambdaランタイム | Node.js 24 (`nodejs24.x`) |
| デプロイ形式 | Zip |
| ビルド | AWS SAM + esbuild |
| API | API Gateway HTTP API |
| データアクセス | AWS SDK for JavaScript v3 |
| データベース | DynamoDB |

#### TypeScriptを選ぶ理由

- フロントエンドと同じ言語で学習範囲を絞れる
- APIのリクエスト、レスポンス、ゲーム状態を型で表現できる
- ゲームルールをAWSから独立した通常の関数としてテストしやすい
- AWS SAMがesbuildによるTypeScript Lambdaのビルドをサポートしている

#### Lambda設定の初期値

| 項目 | 初期値 |
| --- | --- |
| Architecture | `x86_64` |
| Memory | 256 MB |
| Timeout | 10秒 |
| Runtime | `nodejs24.x` |
| PackageType | `Zip` |
| Source map | ローカル・開発環境のみ有効 |

`arm64` は料金面で有利になる可能性がありますが、MVPの小規模利用では差額が小さく、ローカル環境との互換性を優先して `x86_64` から始めます。

### IaC

| 項目 | 選定 |
| --- | --- |
| IaC | AWS SAM |
| 基盤 | AWS CloudFormation |
| テンプレート | `infrastructure/template.yaml` |
| ローカル実行 | SAM CLI + Docker |

#### AWS SAMを選ぶ理由

- Lambda、API Gateway、権限を小さい記述量で管理できる
- 通常のCloudFormationリソースも同じテンプレートへ記述できる
- `sam build`、`sam local invoke`、`sam local start-api` を利用できる
- CDKのプログラム構造やConstructを先に学ぶ必要がなく、生成されるAWSリソースを追いやすい

#### SAMで管理するリソース

- API Gateway HTTP API
- Lambda 3系統
- DynamoDBテーブル
- Cognito User Pool
- Cognito User Pool Client
- CloudWatch LogsのLog Groupと14日保持
- Lambda実行ロールと最小権限
- API GatewayのCORSとスロットリング

#### SAMの外で管理するもの

- Amplify HostingとGitリポジトリ接続
- Amplify Hostingの共有パスワード
- Cognito利用者の手動作成
- AWS Budgetの通知先

これらは外部接続情報、管理者操作、通知先を伴うため、初回はAWSコンソールで明示的に作成します。操作手順は実AWS作業前に別途整理し、ユーザー確認後に実施します。

### パッケージ管理

- パッケージマネージャはnpmを使用する
- Node.jsのメジャーバージョンは24へ固定する
- `frontend/` と `backend/` は独立した `package.json` と `package-lock.json` を持つ
- ルートのnpm workspaceはMVPでは導入しない
- 依存追加時は用途を説明し、ロックファイルをコミットする

独立したパッケージにすることで、SAMがバックエンドの依存関係を解決しやすくし、フロントエンドとLambdaのデプロイ単位を明確にします。

## 初期ディレクトリ構成

```text
.
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── auth/
│   │   ├── api/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── home/
│   │   │   ├── room/
│   │   │   └── game/
│   │   ├── routes/
│   │   ├── styles/
│   │   └── main.tsx
│   ├── public/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── context-room.ts
│   │   │   ├── game-query.ts
│   │   │   └── game-command.ts
│   │   ├── application/
│   │   ├── domain/
│   │   │   ├── game/
│   │   │   └── room/
│   │   ├── infrastructure/
│   │   │   └── dynamodb/
│   │   ├── presentation/
│   │   └── shared/
│   ├── tests/
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
├── infrastructure/
│   ├── template.yaml
│   └── samconfig.toml.example
├── workspace/
│   └── plans/
├── AGENTS.md
├── CONTRIBUTING.md
└── README.md
```

### フロントエンドの責務

- `app/`: アプリ起動、認証状態、ルーター、共通プロバイダー
- `auth/`: Cognitoとの認証処理
- `api/`: HTTPクライアント、API DTO、エラー変換、冪等性キー
- `components/`: 特定画面へ依存しないUI
- `features/`: ホーム、待機ルーム、ゲームの画面機能
- `routes/`: URL単位の画面とルートガード
- `styles/`: 色、余白、カード、レスポンシブ表示

### バックエンドの責務

- `handlers/`: API Gateway/Lambdaイベントの入口とレスポンス変換
- `application/`: ユースケース、認可、トランザクション境界
- `domain/`: AWSへ依存しないゲームルールと状態遷移
- `infrastructure/`: DynamoDBや時刻・ID生成の実装
- `presentation/`: 閲覧者ごとの公開レスポンス生成
- `shared/`: エラー、共通型、検証補助

ドメイン層からAWS SDKを直接呼びません。Lambdaハンドラーへゲームルールを直接書かず、ユニットテスト可能な関数へ分離します。

## Lambdaの分割

`05-api-design.md` の方針どおり、3つのLambdaから始めます。

| Lambda | API |
| --- | --- |
| Context/Room | コンテキスト取得、ルーム作成・参加・取得・退出・開始 |
| Game Query | ゲーム状態取得、放棄期限判定 |
| Game Command | ゲームコマンド、投了 |

- ルートごとにLambdaを増やさない
- 3つのエントリーポイントは同じバックエンドソースを共有する
- esbuildが各エントリーポイントと必要な依存だけをバンドルする
- ゲームルールとDynamoDBアクセスはハンドラー間で共有する

## 依存関係

実装開始時に追加する依存関係を、用途ごとに限定します。正確なバージョンは導入時点の安定版を確認し、`package-lock.json` で固定します。

### フロントエンド

実行時:

- `react`: UI
- `react-dom`: ブラウザ描画
- `react-router-dom`: 4系統の画面ルーティング
- `aws-amplify`: Cognito認証クライアント

開発時:

- `typescript`: 型チェック
- `vite`: 開発サーバーとビルド
- `@vitejs/plugin-react`: React変換
- `vitest`: ユニットテスト
- `@testing-library/react`: コンポーネントテスト
- `@testing-library/user-event`: ユーザー操作テスト
- `eslint`: 静的解析

MVP開始時点では、UIコンポーネントライブラリ、CSSフレームワーク、状態管理ライブラリ、データフェッチライブラリを追加しません。

- CSSは通常のCSSから始める
- アプリ全体の状態はReact Contextと画面単位の状態で管理する
- ポーリングとAPI呼び出しは小さな専用フックで実装する
- 状態管理が複雑になった場合だけ追加ライブラリを再検討する

### バックエンド

実行時:

- `@aws-sdk/client-dynamodb`: DynamoDBクライアント
- `@aws-sdk/lib-dynamodb`: DocumentClientとコマンド
- `zod`: API入力の実行時バリデーション
- `uuid`: UUID v7系IDの生成

開発時:

- `typescript`: 型チェック
- `esbuild`: Lambdaバンドル
- `vitest`: ドメイン・アプリケーション・ハンドラーテスト
- `@types/aws-lambda`: Lambdaイベント型
- `eslint`: 静的解析

AWS Lambdaに同梱されるAWS SDKへ暗黙に依存せず、使用するSDKモジュールをバックエンドの依存関係として固定します。

初期段階では次を追加しません。

- ORM
- DynamoDBの高水準モデリングライブラリ
- Lambda Layer
- AWS Lambda Powertools
- DIコンテナ
- Webフレームワーク

## 設定と環境変数

### フロントエンド

`frontend/.env.example` には値を入れず、必要なキーだけを記載します。

```dotenv
VITE_AWS_REGION=
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_USER_POOL_CLIENT_ID=
VITE_API_BASE_URL=
```

これらはブラウザへ配布される公開設定であり、秘密鍵として扱いません。ただし、実環境の値を `.env` としてコミットしません。

### バックエンド

Lambda環境変数:

- `TABLE_NAME`
- `LOG_LEVEL`
- `ALLOWED_ORIGIN`

Lambdaは実行ロールからAWS権限を取得します。アクセスキー、シークレットキー、JWT秘密鍵を環境変数へ保存しません。

### SAMパラメータ

- `EnvironmentName`
- `AllowedOrigin`
- `LogLevel`
- `BudgetNotificationEmail` はSAMテンプレートへ含めず、Budget作成時に別途指定する

実値を含む `samconfig.toml` はコミットせず、プレースホルダーだけの `samconfig.toml.example` を用意します。

## ローカル開発環境

### 現在確認できているもの

- Node.js `v24.13.0`
- npm `11.18.0`
- Docker `29.6.1`
- Git `2.43.0`

### 実装前に追加で必要なもの

- AWS CLI v2
- AWS SAM CLI

AWS CLIとSAM CLIの導入はローカルツールの変更になるため、実装着手時に導入方法を提示して確認後に行います。

AWS認証情報はリポジトリへ保存しません。AWS CLIプロファイルを作成する場合も、実AWS操作へ進む前に対象アカウントとリージョンを確認します。

## 開発コマンド方針

実装後に次のコマンドを用意します。

### フロントエンド

```bash
cd frontend
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

### バックエンド

```bash
cd backend
npm ci
npm run lint
npm run typecheck
npm test
```

### SAM

```bash
sam validate --lint -t infrastructure/template.yaml
sam build -t infrastructure/template.yaml
sam local start-api -t infrastructure/template.yaml
```

`sam deploy` はAWSリソースを作成・変更するため、ユーザーの明示的な確認を得るまで実行しません。

## テスト方針

### ドメインユニットテスト

最優先でゲームルールをテストします。

- 54枚のカード生成
- シャッフル後の配札と初期状態
- リード、トランプ、スーパートランプ
- 休憩カード
- ダミー
- 追加ドロー
- 空手札補充
- デッキ再構築
- 収集と捨て札トップ選択
- 連勝・重複収集ペナルティ
- 悟り、光喪失、投了、放棄
- 公開情報への変換

乱数、時刻、ID生成は外部から渡せるようにし、テストを再現可能にします。

### アプリケーションテスト

- 認証ユーザーと対象ルーム・ゲームの認可
- `expectedVersion` の競合
- 冪等性キーの再送
- 期限切れルーム
- 参加試行制限
- 放棄終了
- DynamoDBトランザクションへ渡す条件

DynamoDBクライアントを差し替え可能にし、通常のテストで実AWSを使用しません。

### ハンドラーテスト

- API Gatewayイベントからの入力変換
- JWTクレームの取得
- HTTPステータスとエラー形式
- CORSヘッダー
- 非公開情報を含まないレスポンス

### フロントエンドテスト

- 起動時のコンテキスト遷移
- ルーム作成・参加
- 作成者と参加者で異なる待機画面
- `availableActions` による操作表示
- 自分と相手の手札表示範囲
- ポーリング間隔切り替え
- 競合、認証切れ、通信断
- 投了・退出確認
- PCとスマートフォンの主要操作

### 結合確認

初期はSAM Localとモック認証情報を使い、HTTPリクエストからLambdaハンドラーまでを確認します。

DynamoDB Localは最初から導入しません。条件付き書き込みやトランザクションを含む統合確認が必要になった時点で追加を検討します。

PlaywrightなどのE2Eテストも初期依存へ含めず、主要画面が動いた後に必要性を判断します。

## 実装順序

### 1. リポジトリの土台

状態: 完了

- `frontend/` と `backend/` のTypeScript環境
- `.nvmrc` または同等のNode.js 24指定
- npm scripts
- ESLint、Vitest、型チェック
- `.gitignore` の生成物追加
- 秘密情報を含まない `.env.example`

完了条件:

- フロントエンドとバックエンドでLint、型チェック、空のテスト、ビルドが成功する

### 2. ゲームドメイン

状態: 完了

- カード、プレイヤー、ゲーム状態の型
- 初期化
- 行動検証
- ラウンド解決
- ペナルティと終了判定
- 閲覧者向け状態変換

実装済み:

- 54枚のカード定義とカードID
- 宝石数を含むカード情報
- 乱数注入可能なシャッフル
- 人間プレイヤー2人への初期配札
- 初期捨て札、星明り、黒い星、先手の初期状態
- リードカラーへの追従と休憩カード例外
- カードプレイ前後の追加ドロー
- 空手札の即時補充
- デッキ枯渇時の捨て札再構築
- カードプレイ後の手番終了可否検証
- 手番終了時点のデッキトップによるダミープレイ
- リード、トランプ、スーパートランプの勝者判定
- 複数スーパートランプの後勝ち
- 全員休憩による勝者なし判定
- 連勝ペナルティと最後の光喪失
- 感情カードの収集選択
- 重複収集ペナルティ
- 光喪失を優先した悟り判定
- 休憩カードまたは選択カードによる捨て札トップ決定
- 人間・ダミー・全員休憩後の次ラウンド開始
- 投了と24時間無操作による放棄終了
- 閲覧者ごとの公開ゲーム状態
- 実装済みルールを通したラウンド進行シナリオテスト

完了条件:

- `02-rules-discovery.md` の検証シナリオをユニットテストで再現できる
- AWS SDKに依存せずゲームを進行できる

### 3. DynamoDBアクセス

状態: 次に着手

- 単一テーブルのキー生成
- Room、Active Context、Join Guard、Game State、Event、Request
- 条件付き書き込み
- トランザクション
- TTL

完了条件:

- `04-data-model.md` の主要更新フローをアプリケーションテストで確認できる

### 4. Context/Room API

- コンテキスト取得
- ルーム作成、参加、取得、退出、開始
- Cognitoクレーム
- 参加試行制限
- 期限切れ処理

完了条件:

- 2人がゲーム開始状態まで進める

### 5. Game Query / Command API

- 閲覧者向け状態取得
- 追加ドロー、カードプレイ、手番終了
- 収集、捨て札トップ選択
- 投了、放棄終了
- 冪等性と楽観的ロック

完了条件:

- APIだけでゲームを開始から終了まで進行できる
- 非公開情報が相手向けレスポンスへ含まれない

### 6. フロントエンド認証とホーム

- Cognito認証
- 初回パスワード変更
- コンテキスト復帰
- ルーム作成・参加

完了条件:

- 認証済みユーザーが待機ルームへ移動できる

### 7. 待機ルーム

- ルーム状態表示
- ポーリング
- 開始方法
- 退出

完了条件:

- 2つのブラウザセッションが同じゲーム画面へ移動できる

### 8. ゲーム画面

- 公開・非公開状態表示
- PC・スマートフォン縦向き
- フェーズ別操作
- ポーリング
- 競合と再接続
- 結果表示

完了条件:

- 2つのブラウザセッションで1ゲームを完了できる

### 9. SAMテンプレート

- HTTP API
- Lambda
- DynamoDB
- Cognito
- IAM
- CloudWatch Logs
- CORS、スロットリング、TTL

完了条件:

- `sam validate --lint` と `sam build` が成功する
- テンプレートの変更対象リソースを説明できる

### 10. 実AWSでの限定ベータ準備

この段階はユーザーの明示的な確認後だけ実施します。

- 対象AWSアカウントとリージョン確認
- Budget作成
- SAMデプロイ
- Amplify Hosting接続
- 共有パスワード
- Cognito利用者作成
- CORSオリジン反映
- 2ユーザーでのスモークテスト

## コミット方針

実装は前述の単位をさらに小さく分け、次のようなコミットを想定します。

- `Chore: initialize frontend toolchain`
- `Chore: initialize backend toolchain`
- `Add: define game domain model`
- `Add: implement round resolution`
- `Test: cover Duel rule scenarios`
- `Add: implement room API`
- `Add: implement game command API`
- `Add: implement Cognito authentication flow`
- `Add: implement waiting room screen`
- `Add: implement game screen`
- `Add: define SAM infrastructure`

1コミットでフロントエンド、バックエンド、IaCを一括生成しません。

## 実装開始条件

- この技術選定が確認されている
- Node.js、npmの利用バージョンが固定されている
- 初回の実装対象が「リポジトリの土台」に限定されている
- 追加する依存関係と理由が説明されている
- AWS CLIとSAM CLIの導入は別途確認する
- AWSアカウントへ影響する操作を行わないことが確認されている

## 公式資料

- [Viteガイド](https://vite.dev/guide/)
- [AWS Lambdaの対応ランタイム](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)
- [AWS SAMによるTypeScript Lambdaのビルド](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-build-typescript.html)
- [AWS SAMドキュメント](https://docs.aws.amazon.com/serverless-application-model/)
- [Amplify HostingのSPAリライト](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html#redirects-for-single-page-web-apps-spa)
- [Amplify Authのサインイン](https://docs.amplify.aws/javascript/frontend/auth/sign-in/)
- [Amplify Authのセッション管理](https://docs.amplify.aws/javascript/frontend/auth/manage-user-sessions/)
- [uuidのUUID v7対応](https://github.com/uuidjs/uuid#uuidv7options-buffer-offset)
