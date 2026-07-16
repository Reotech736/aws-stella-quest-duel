# 10-amplify-beta-release

## 目的

UI改善後のReact SPAをAWS Amplify Hostingへ配置し、管理者が招待した利用者だけがアクセスできる限定ベータ環境を構築します。

Amplifyの共有パスワードはアプリ入口、Cognitoは利用者本人の認証、6桁のルームIDは対戦相手との合流に使用します。それぞれを別の防御層として扱います。

## 現在の前提

- Gitリポジトリには`frontend`、`backend`、`infrastructure`が同居している
- Amplifyでビルドする対象は`frontend`だけ
- フロントエンドはReact + TypeScript + ViteのSPA
- AWSバックエンドの`dev`スタックはデプロイ済み
- APIのCORSは`http://localhost:5173`だけを許可している
- Amplifyアプリと公開ブランチは未作成
- Amplify URL確定後にSAMの`AllowedOrigin`を更新する必要がある

## 開始条件

- `workspace/plans/09-ui-improvement.md`の完了条件を満たしている
- フロントエンドのlint、typecheck、test、buildが成功している
- 公開対象のGitブランチが確定している
- 対象AWSアカウントと`ap-northeast-1`を再確認している
- Amplifyリソース作成についてユーザーの明示的な承認がある

## 公開方針

- 初期公開はAmplifyのデフォルトドメインを使用する
- カスタムドメインは使用しない
- 公開ブランチへ共有ユーザー名と共有パスワードを設定する
- Amplifyの共有認証情報はGitや`.env`へ保存しない
- Cognitoの自己登録は引き続き無効とする
- 自動ビルドの有効・無効は、公開対象ブランチを決めるときに確認する

## ビルド設定

このリポジトリは複数のプロジェクトを含むため、Amplifyでは`frontend`をアプリルートとして指定します。設定を再現できるように、実装時にはリポジトリルートの`amplify.yml`で管理する案を優先します。

想定する処理:

1. `frontend`で`npm ci`を実行する。
2. `npm run build`を実行する。
3. `frontend/dist`を成果物として配信する。

Amplifyのmonorepo設定では、`appRoot`と`AMPLIFY_MONOREPO_APP_ROOT`を同じ`frontend`にします。実際の初回設定時はAmplifyが生成したbuild specificationとの差分を確認してから`amplify.yml`を追加します。

参考: [Configuring monorepo build settings](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html)

## 環境変数

次の公開設定をAmplifyのビルド環境へ登録します。

- `VITE_AWS_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_USER_POOL_CLIENT_ID`
- `VITE_API_BASE_URL`

これらはブラウザへ配信される設定であり、秘密情報として扱う値ではありません。ただし、AWSアクセスキー、Cognito利用者のパスワード、共有パスワード、トークンは登録しません。

参考: [Using environment variables in an Amplify application](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)

## SPAリライト

React Routerの`/rooms/...`や`/games/...`を直接開いても404にならないように、静的ファイルを除くパスを`/index.html`へ返す200 rewriteを設定します。

設定後は、トップページからの画面遷移だけでなく、待機ルームとゲームURLの直接読込、再読込を確認します。

参考: [Redirects for single page web apps](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html#redirects-for-single-page-web-apps-spa)

## 共有パスワード

公開ブランチのAccess controlを有効にし、共有ユーザー名と共有パスワードを設定します。共有情報は招待した利用者だけへ別経路で連絡し、リポジトリ、Issue、ログへ残しません。

参考: [Restricting access to an Amplify app's branches](https://docs.aws.amazon.com/amplify/latest/userguide/access-control.html)

## 実施順序

AWSリソースを作成・変更する各段階では、事前にユーザー確認を取ります。

1. Gitの公開対象ブランチと最新コミットを確認する。
2. Amplifyアプリを作成し、リポジトリと`frontend`を接続する。
3. build specificationと公開環境変数を確認する。
4. 初回ビルドを実行し、生成されたAmplify URLを確認する。
5. 公開ブランチへ共有パスワードを設定する。
6. SPA rewriteを設定し、直接URLを確認する。
7. Amplify URLをSAMの`AllowedOrigin`へ指定して変更セットを作成する。
8. CORS変更だけであることを確認し、変更セットを実行する。
9. 公開URLから2ユーザーのスモークテストを実施する。
10. CloudWatch Logs、Amplifyのビルドログ、Budgetを確認する。

Amplify URLが確定するまでCORSを推測値で変更しません。CORSをAmplify URLへ切り替えた後、ローカルの`http://localhost:5173`から実APIへ接続できなくなることは限定ベータ環境の方針として許容します。ローカル接続も維持する必要が生じた場合は、複数オリジン対応を別途設計します。

## スモークテスト

### アクセス制御

- 共有パスワードなしではアプリへ入れない
- 共有パスワード通過後もCognitoログインが必要
- 未登録ユーザーが自己登録できない

### 認証と画面遷移

- 2ユーザーがそれぞれログインできる
- `/rooms/{roomId}`と`/games/{gameId}`を再読込できる
- ログアウト後に認証済み画面へ戻れない

### 対戦

- ルーム作成、参加、退出、再作成ができる
- 開始方法を選択してゲームを開始できる
- 2ユーザーで通常操作、追加ドロー、自動補充、カード獲得を確認できる
- 投了と通常の勝敗でゲームが終了する
- 終了後にホームへ戻れる

### 運用確認

- API GatewayでCORSエラーが発生しない
- Lambdaに予期しない`INTERNAL_ERROR`ログがない
- Amplifyのビルドログへ秘密情報が出ていない
- 想定外のAWSリソースや高額サービスが作成されていない

## ロールバック

- フロントエンドだけに問題がある場合は、Amplifyで直前の成功デプロイへ戻すか、公開を停止する
- CORS変更に問題がある場合は、直前の`AllowedOrigin`でSAM変更セットを作成して戻す
- バックエンドのDynamoDBとCognitoはAmplifyから独立しているため、Amplifyアプリ削除の対象にしない
- 共有パスワードが漏れた場合はAccess controlで直ちに変更する

削除や公開停止を行う場合も、対象と影響を確認してから実行します。

## Budgetとの関係

プロジェクト専用BudgetはAmplify公開の技術的な前提ではありません。ただし、限定ベータ開始までにコスト配分タグの反映を確認し、`infrastructure/cost-budget.yaml`をデプロイすることを推奨します。

## 完了条件

- Amplifyの公開ブランチが共有パスワードで保護されている
- SPAの直接URLと再読込が動作する
- Amplify URLだけが実APIのCORSで許可されている
- 2ユーザーでゲーム終了までスモークテストが成功する
- CloudWatch Logsに未解決のサーバー内部エラーがない
- 秘密情報がGit、Amplifyビルドログ、配信成果物へ含まれていない
- 実施したAWS設定と確認結果がドキュメントへ反映されている
