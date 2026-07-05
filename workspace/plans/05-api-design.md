# 05-api-design

## 概要

このドキュメントは、「ステラクエスト Duel」MVPで使用するHTTP APIの責務、入出力、認証・認可、競合制御、エラー形式を定義します。

`workspace/plans/02-rules-discovery.md`、`workspace/plans/03-mvp-requirements.md`、`workspace/plans/04-data-model.md` を前提とし、クライアントは表示と操作入力、サーバーは認可・ゲームルール判定・状態更新を担当します。

## 設計方針

状態: 完了

- Amazon API Gateway HTTP APIとAWS Lambdaを使用する
- APIのベースパスは `/v1` とする
- Cognitoへのサインイン、初回パスワード変更、サインアウトはCognitoのクライアント機能で行い、独自認証APIは作らない
- `/v1` 配下の全アプリケーションAPIでCognito JWT認証を必須とする
- APIはJWTの `sub` を操作ユーザーの `userId` として使用する
- クライアントから任意の `userId` を受け取って操作主体を決めない
- ルーム・ゲームの状態取得は、対象へ所属するユーザーだけに許可する
- ゲーム内の状態変更は、汎用コマンドAPIへ集約する
- 投了は不可逆かつ手番外でも実行できるため、専用APIに分ける
- 状態変更APIは冪等性キーと期待する `version` を受け取る
- 状態変更成功時は、閲覧者向けの最新状態をレスポンスへ含める
- イベントログ取得APIはMVPの公開APIに含めない
- APIは完全なDynamoDBアイテムを返さず、閲覧者ごとのレスポンスへ変換する

## 共通仕様

### URLとデータ形式

- ベースパス: `/v1`
- リクエストとレスポンス: `application/json`
- 日時: UTCのISO 8601形式
- ID: 大文字・小文字を区別する不透明な文字列
- `roomId`: 入力時に前後空白を除去し、大文字へ正規化する
- JSONのプロパティ名: `camelCase`

日時の例:

```json
"2026-07-05T12:34:56.789Z"
```

### 認証

クライアントはCognitoから取得したアクセストークンを、次のヘッダーで送信します。

```http
Authorization: Bearer <JWT>
```

API GatewayのJWTオーソライザーで署名、発行者、有効期限、対象アプリクライアントを検証します。Lambdaはオーソライザーが検証したクレームから `sub` を取得し、Cognitoの `token_use` が `access` であることも確認します。IDトークンはAPI認証に使用しません。

トークンがない、無効、期限切れの場合はAPI Gatewayが `401 Unauthorized` を返します。LambdaではCognitoの認証処理を独自実装せず、検証済みクレームの用途確認だけを行います。

対戦相手へ表示する名前には、Cognitoアクセストークンの `username` を使用します。管理者はアカウント作成時に、メールアドレスや本名ではなく、対戦相手へ公開してよい一意の表示名をCognitoユーザー名として設定します。Cognitoの `sub` とメールアドレスは表示しません。MVPでは表示名変更機能を提供しません。

CORSプリフライトの `OPTIONS` はAPI Gatewayが処理し、JWT認証の対象外とします。

### 冪等性

すべての状態変更APIは、クライアントが操作ごとに生成したUUID v7系の値を次のヘッダーで受け取ります。

```http
Idempotency-Key: 0197...
```

- 同じ操作を通信リトライするときは、同じキーを再利用する
- ユーザーが新しい操作を行うときは、新しいキーを生成する
- 同じキーと同じリクエスト内容の再送は、状態を二重更新せず成功として扱う
- 同じキーを異なるリクエスト内容へ再利用した場合は `409 IDEMPOTENCY_KEY_REUSED` とする
- 冪等性情報は24時間保持する
- `GET` APIでは `Idempotency-Key` を使用しない

再送時は保存済みの更新結果を確認したうえで、現在の閲覧者向け状態を返します。そのため、最初のレスポンス以降に相手が操作していた場合、再送レスポンスの状態が最初のレスポンスより新しいことがあります。

### 楽観的ロック

ルームやゲームを更新するリクエストは、直前に取得した状態の `version` を `expectedVersion` として本文へ含めます。

```json
{
  "expectedVersion": 12
}
```

サーバー上の `version` と一致しない場合は `409 VERSION_CONFLICT` を返します。クライアントは最新状態を再取得し、ユーザー操作を自動再送せず、画面を更新します。

ルーム作成とルーム参加は、対象状態を事前取得できないため `expectedVersion` を要求しません。サーバー側の条件付き書き込みで競合を防ぎます。

### 共通レスポンス

成功レスポンスは、必要なデータと追跡情報を返します。

```json
{
  "data": {},
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z",
    "idempotentReplay": false
  }
}
```

- `traceId`: APIリクエストをCloudWatch Logsで追跡するためのID
- `serverTime`: サーバーがレスポンスを生成した時刻
- `idempotentReplay`: 同一冪等性キーの再送結果なら `true`

`GET` APIでは `idempotentReplay` を省略します。

### 共通エラーレスポンス

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "状態が更新されています。最新の状態を取得してください。",
    "details": {
      "currentVersion": 13
    }
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z"
  }
}
```

- クライアントの分岐には `code` を使う
- `message` は利用者向けの短い日本語とする
- `details` は必要な場合だけ返す
- スタックトレース、DynamoDBキー、AWS内部エラー、非公開カード情報は返さない
- 想定外エラーでは共通メッセージを返し、詳細は秘密情報を除いてCloudWatch Logsへ記録する

API Gatewayが直接生成する `401` やスロットリングの `429` は、このJSON形式と異なる場合があります。クライアントはこれらをHTTPステータスでも判定します。

## API一覧

| Method | Path | 用途 | 主な成功コード |
| --- | --- | --- | --- |
| `GET` | `/v1/me/context` | 自分の待機中・進行中コンテキスト取得 | `200` |
| `POST` | `/v1/rooms` | ルーム作成 | `201` |
| `POST` | `/v1/rooms/join` | 6桁ルームIDで参加 | `200` |
| `GET` | `/v1/rooms/{roomId}` | 所属ルームの状態取得 | `200` |
| `POST` | `/v1/rooms/{roomId}/leave` | ゲーム開始前の退出 | `200` |
| `POST` | `/v1/rooms/{roomId}/start` | 開始方法を指定してゲーム開始 | `201` |
| `GET` | `/v1/games/{gameId}` | 閲覧者向けゲーム状態取得 | `200` |
| `POST` | `/v1/games/{gameId}/commands` | ゲーム内コマンド実行 | `200` |
| `POST` | `/v1/games/{gameId}/resign` | 投了 | `200` |

公開ルーム一覧、ルーム検索、イベントログ取得、管理者向けユーザー管理APIはMVPでは作りません。

## コンテキストAPI

### `GET /v1/me/context`

ログイン後やブラウザ再読み込み後に、自分が戻るべき画面を判断するためのAPIです。

参照先のルームが期限切れ、ゲームが24時間無操作の放棄期限を過ぎている、または終了済み状態に対してアクティブコンテキストだけが残っていた場合は、サーバーが条件付きで期限処理と不要なコンテキスト解除を行います。

アクティブな所属がない場合:

```json
{
  "data": {
    "context": null
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z"
  }
}
```

所属がある場合:

```json
{
  "data": {
    "context": {
      "status": "IN_GAME",
      "role": "OWNER",
      "roomId": "A2B3C4",
      "gameId": "0197..."
    }
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z"
  }
}
```

`status` は `WAITING` / `READY` / `IN_GAME` のいずれかです。

## ルームAPI

### `POST /v1/rooms`

認証済みユーザーを作成者として、参加者待ちルームを作成します。

リクエスト本文:

```json
{}
```

成功レスポンス `201 Created`:

```json
{
  "data": {
    "room": {
      "roomId": "A2B3C4",
      "status": "WAITING",
      "version": 1,
      "owner": {
        "displayName": "Player A"
      },
      "guest": null,
      "createdAt": "2026-07-05T12:34:56.789Z",
      "waitingExpiresAt": "2026-07-06T12:34:56.789Z"
    }
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z",
    "idempotentReplay": false
  }
}
```

主なエラー:

- `409 ACTIVE_CONTEXT_EXISTS`: すでに待機中または進行中の所属がある
- `409 IDEMPOTENCY_KEY_REUSED`: 冪等性キーが別の内容で使用済み

### `POST /v1/rooms/join`

6桁ルームIDを使って参加者枠へ入ります。ルームIDをパスへ含めないのは、ブラウザ・プロキシ・アクセスログへ参加試行対象を残しにくくするためです。

リクエスト本文:

```json
{
  "roomId": "a2b3c4"
}
```

成功時は正規化済みのルーム状態を返します。

存在しない、期限切れ、満員、開始済み、自分が作成者である場合は、すべて `404 ROOM_NOT_JOINABLE` とします。利用者向けメッセージは「ルームに参加できませんでした。」で統一し、個別理由を返しません。

主なエラー:

- `400 VALIDATION_ERROR`: 文字数または文字集合が不正
- `404 ROOM_NOT_JOINABLE`: 参加できないルーム
- `409 ACTIVE_CONTEXT_EXISTS`: すでに別の所属がある
- `429 JOIN_ATTEMPT_LIMITED`: ユーザー単位の参加試行制限中
- `429 TOO_MANY_REQUESTS`: API GatewayまたはAPI全体の制限

`ROOM_NOT_JOINABLE` と `JOIN_ATTEMPT_LIMITED` は、画面上ではどちらもルームの個別状態を明らかにしない表現にします。

形式不正を含む参加失敗はユーザー単位の失敗回数へ加算し、参加成功時は失敗状態をリセットします。ブロック中かどうかは、ルームの存在確認より先に判定します。

### `GET /v1/rooms/{roomId}`

作成者または参加者が、ゲーム開始前のルーム状態をポーリングします。

成功レスポンス:

```json
{
  "data": {
    "room": {
      "roomId": "A2B3C4",
      "status": "READY",
      "version": 2,
      "viewerRole": "GUEST",
      "owner": {
        "displayName": "Player A"
      },
      "guest": {
        "displayName": "Player B"
      },
      "gameId": null,
      "createdAt": "2026-07-05T12:34:56.789Z",
      "waitingExpiresAt": "2026-07-06T12:34:56.789Z"
    }
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z"
  }
}
```

- `status=IN_GAME` の場合は `gameId` を返し、クライアントはゲーム画面へ遷移する
- 待機期限切れを検出した場合は期限切れ処理を試行し、所属していたユーザーには `410 ROOM_EXPIRED` を返す
- 存在しないルーム、または所属していないユーザーには `404 ROOM_NOT_FOUND` を返す

### `POST /v1/rooms/{roomId}/leave`

ゲーム開始前の明示退出を行います。

リクエスト本文:

```json
{
  "expectedVersion": 2
}
```

成功レスポンス:

```json
{
  "data": {
    "left": true,
    "roomClosed": false
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z",
    "idempotentReplay": false
  }
}
```

- 作成者退出では `roomClosed=true` とし、参加者も所属解除する
- 参加者退出ではルームを `WAITING` に戻し、参加枠を再開放する
- 開始済みゲームからの退出には使用できない

主なエラー:

- `404 ROOM_NOT_FOUND`: 存在しない、または所属していない
- `409 ROOM_ALREADY_STARTED`: ゲーム開始済み
- `409 VERSION_CONFLICT`: 取得後にルーム状態が変わった

### `POST /v1/rooms/{roomId}/start`

作成者が開始方法を指定し、スタートプレイヤー確定後にシャッフル・配札・ゲーム作成を行います。

リクエスト本文:

```json
{
  "expectedVersion": 2,
  "startMethod": "RANDOM"
}
```

`startMethod`:

- `RANDOM`
- `OWNER_FIRST`
- `GUEST_FIRST`

成功レスポンス `201 Created`:

```json
{
  "data": {
    "room": {
      "roomId": "A2B3C4",
      "status": "IN_GAME",
      "version": 3,
      "gameId": "0197..."
    },
    "game": {}
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z",
    "idempotentReplay": false
  }
}
```

`game` には後述の閲覧者向けゲーム状態を返します。

主なエラー:

- `403 NOT_ROOM_OWNER`: 作成者以外が開始した
- `404 ROOM_NOT_FOUND`: 存在しない、または所属していない
- `409 ROOM_NOT_READY`: 人間プレイヤーが2人揃っていない
- `409 ROOM_ALREADY_STARTED`: すでに開始済み
- `409 VERSION_CONFLICT`: 取得後にルーム状態が変わった

同じ冪等性キーの再送では同じゲームを返し、再シャッフル・再配札しません。

## ゲーム状態API

### `GET /v1/games/{gameId}`

対象ゲームの参加者へ、閲覧者ごとに秘匿済みのゲーム状態を返します。ポーリングはこのAPIを使用します。

ゲームが24時間無操作の期限を過ぎている場合、取得処理内で放棄終了を条件付きで確定し、`status=ABANDONED` の最終状態を `200 OK` で返します。

ゲーム状態の基本構造:

```json
{
  "data": {
    "game": {
      "gameId": "0197...",
      "roomId": "A2B3C4",
      "status": "IN_PROGRESS",
      "version": 12,
      "phase": "PLAYER_TURN_BEFORE_PLAY",
      "viewerPlayerId": "OWNER",
      "currentActorPlayerId": "OWNER",
      "startPlayerId": "OWNER",
      "blackStarHolderPlayerId": null,
      "players": [],
      "deck": {},
      "discardTop": {},
      "playedCards": [],
      "pendingChoice": null,
      "availableActions": {},
      "lastActionAt": "2026-07-05T12:34:56.789Z",
      "abandonAt": "2026-07-06T12:34:56.789Z",
      "result": null
    }
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z"
  }
}
```

主なエラー:

- `404 GAME_NOT_FOUND`: 存在しない、または参加者ではない

### フェーズ

`phase` は次の値を使用します。

| 値 | 意味 |
| --- | --- |
| `PLAYER_TURN_BEFORE_PLAY` | `currentActorPlayerId` のカードプレイ前。追加ドローまたはカードプレイが可能 |
| `PLAYER_TURN_AFTER_PLAY` | カードプレイ後・手番終了前。追加ドローまたは手番終了が可能 |
| `AWAITING_COLLECTION_CHOICE` | ラウンド勝者による収集カード選択待ち |
| `AWAITING_DISCARD_TOP_CHOICE` | ラウンド勝者による捨て札トップ選択待ち |
| `COMPLETED` | 勝敗が確定した終了状態 |
| `ABANDONED` | 24時間無操作による勝者なしの終了状態 |

ダミーのプレイ、候補が1つしかない選択、休憩カードをトップへ置く処理など、ユーザー入力が不要な処理はAPI操作内で自動実行します。ダミー待ち専用フェーズは作りません。

### プレイヤー情報の公開範囲

閲覧者本人:

```json
{
  "playerId": "OWNER",
  "displayName": "Player A",
  "role": "OWNER",
  "isViewer": true,
  "hand": [
    {
      "cardId": "R3a",
      "type": "EMOTION",
      "color": "RED",
      "number": 3
    }
  ],
  "handCount": 1,
  "collection": [],
  "starlight": {
    "light": 5,
    "dark": 0
  }
}
```

相手プレイヤー:

```json
{
  "playerId": "GUEST",
  "displayName": "Player B",
  "role": "GUEST",
  "isViewer": false,
  "hand": [
    {
      "color": "BLUE"
    },
    {
      "color": "REST"
    }
  ],
  "handCount": 2,
  "collection": [],
  "starlight": {
    "light": 4,
    "dark": 1
  }
}
```

- 本人の手札だけ `cardId`、`type`、`color`、`number` を返す
- 相手の手札は並び順に意味を持たせず、カードごとの `color` だけを返す
- 相手の手札に `cardId`、`number`、同色同数の複製記号を返さない
- 収集カード、プレイ済みカード、捨て札トップは公開情報として完全なカード情報を返す
- Cognitoの `sub` はクライアントへ返さず、ゲーム内では `OWNER` / `GUEST` の `playerId` でプレイヤーを参照する

### デッキ情報の公開範囲

```json
{
  "deck": {
    "remainingCount": 37,
    "topColor": "GREEN"
  }
}
```

`topColor` は `RED` / `YELLOW` / `BLUE` / `GREEN` / `REST` のいずれかです。デッキトップの `cardId` と数字、2枚目以降の色・数字・並び順は誰にも返しません。

### 選択待ち

```json
{
  "pendingChoice": {
    "type": "COLLECTION",
    "actorPlayerId": "OWNER",
    "candidateCardIds": [
      "R3a",
      "B5b"
    ]
  }
}
```

`type` は `COLLECTION` または `DISCARD_TOP` です。候補は公開済みのプレイカードだけで構成します。選択権がない閲覧者にも待機理由を表示するため同じ情報を返します。

### 実行可能操作

クライアントの表示制御を簡単にするため、サーバーは閲覧者が現在実行可能な操作を返します。

```json
{
  "availableActions": {
    "canDrawCards": true,
    "canPlayCard": true,
    "playableCardIds": [
      "R3a",
      "X2"
    ],
    "canEndTurn": false,
    "collectionCandidateCardIds": [],
    "discardTopCandidateCardIds": [],
    "canResign": true
  }
}
```

`availableActions` は画面表示の補助情報です。状態がレスポンス後に変わる可能性があるため、サーバーはコマンド受信時にも同じルールを再検証します。

### 終了結果

```json
{
  "result": {
    "endReason": "ENLIGHTENMENT",
    "winnerPlayerId": "OWNER",
    "loserPlayerId": "GUEST",
    "resignedByPlayerId": null,
    "endedAt": "2026-07-05T13:45:00.000Z"
  }
}
```

`endReason`:

- `ENLIGHTENMENT`
- `LIGHT_LOST`
- `RESIGNATION`
- `ABANDONED`

`ABANDONED` では `winnerPlayerId` と `loserPlayerId` を `null` にします。

## ゲーム操作API

### `POST /v1/games/{gameId}/commands`

1回のリクエストで、1つのゲーム内行動だけを処理します。複数コマンドの一括送信は受け付けません。

共通リクエスト:

```json
{
  "expectedVersion": 12,
  "command": {
    "type": "DRAW_CARDS"
  }
}
```

コマンド一覧:

| `command.type` | 追加項目 | 用途 |
| --- | --- | --- |
| `DRAW_CARDS` | なし | 光面1枚を消費し、上限まで最大3枚引く |
| `PLAY_CARD` | `cardId` | 手札からカードを1枚プレイする |
| `END_TURN` | なし | カードプレイ後の手番を終了する |
| `SELECT_COLLECTION` | `cardId` | 収集する感情カードを選ぶ |
| `SELECT_DISCARD_TOP` | `cardId` | 次の捨て札トップを選ぶ |

`PLAY_CARD` の例:

```json
{
  "expectedVersion": 12,
  "command": {
    "type": "PLAY_CARD",
    "cardId": "R3a"
  }
}
```

成功時は、コマンドとサーバー自動処理を反映した閲覧者向けゲーム状態を返します。

```json
{
  "data": {
    "acceptedCommand": "PLAY_CARD",
    "game": {}
  },
  "meta": {
    "traceId": "0197...",
    "serverTime": "2026-07-05T12:34:56.789Z",
    "idempotentReplay": false
  }
}
```

主なエラー:

- `400 VALIDATION_ERROR`: 必須項目、型、列挙値、ID形式が不正
- `404 GAME_NOT_FOUND`: 存在しない、または参加者ではない
- `409 VERSION_CONFLICT`: 古い状態に基づく操作
- `409 GAME_ALREADY_ENDED`: 終了済みゲームへの操作
- `409 ACTION_NOT_ALLOWED`: 現在の手番・フェーズでは実行できない
- `409 CARD_NOT_IN_HAND`: 指定カードを本人が持っていない
- `409 CARD_NOT_PLAYABLE`: リードカラールール上プレイできない
- `409 DRAW_NOT_ALLOWED`: 手札10枚、光面1枚以下、または実行可能フェーズ外
- `409 INVALID_CHOICE`: 指定カードが現在の選択候補ではない

追加ドローは必ず `DRAW_CARDS` 1回につき光面1枚を消費します。クライアントが2回実行する場合は、各成功レスポンスの新しい `version` を使って2リクエストを順番に送ります。

### `POST /v1/games/{gameId}/resign`

投了確認後に、参加者本人が投了します。手番とフェーズには依存しません。

リクエスト本文:

```json
{
  "expectedVersion": 12,
  "confirmed": true
}
```

- `confirmed` が `true` でなければ `400 RESIGNATION_NOT_CONFIRMED`
- 成功時は相手を勝者、本人を敗者として即座に終了する
- 同じ冪等性キーの再送では二重に終了処理しない
- 終了済みゲームへの別の投了は `409 GAME_ALREADY_ENDED`

成功時は最終ゲーム状態を返します。

## バリデーションと認可の順序

Lambdaは原則として次の順で処理します。

1. API GatewayがJWTを検証する
2. JSON形式、必須項目、型、長さ、列挙値を検証する
3. JWTの `sub` から操作者を特定する
4. 冪等性キーの形式と再送状態を確認する
5. 対象ルームまたはゲームを取得する
6. 期限切れ・放棄期限を確認し、必要なら条件付きで終了処理する
7. 操作者の所属と権限を確認する
8. `expectedVersion` を確認する
9. ゲームルールと行動可否を検証する
10. DynamoDBトランザクションで状態、イベント、冪等性情報を更新する
11. 閲覧者向け状態へ変換して返す

存在確認より先に詳細な権限エラーを返さず、所属していないユーザーへ対象の存在を明らかにしないようにします。

## HTTPステータスとエラーコード

| HTTP | 主なコード | 意味 |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | リクエスト形式が不正 |
| `400` | `RESIGNATION_NOT_CONFIRMED` | 投了確認がない |
| `401` | API Gateway標準 | JWTがない、無効、期限切れ |
| `403` | `NOT_ROOM_OWNER` | 所属済みだが作成者権限がない |
| `404` | `ROOM_NOT_FOUND` | ルームがない、または閲覧権限がない |
| `404` | `ROOM_NOT_JOINABLE` | 参加可否の詳細を隠した共通エラー |
| `404` | `GAME_NOT_FOUND` | ゲームがない、または閲覧権限がない |
| `409` | `ACTIVE_CONTEXT_EXISTS` | 別の待機中・進行中所属がある |
| `409` | `VERSION_CONFLICT` | 楽観的ロック競合 |
| `409` | `IDEMPOTENCY_KEY_REUSED` | 同じキーが異なる内容で使用済み |
| `409` | `ROOM_NOT_READY` | 開始条件を満たしていない |
| `409` | `ROOM_ALREADY_STARTED` | ルームが開始済み |
| `409` | `GAME_ALREADY_ENDED` | ゲームが終了済み |
| `409` | `ACTION_NOT_ALLOWED` | 現在の状態では操作できない |
| `410` | `ROOM_EXPIRED` | 所属していた待機ルームが期限切れ |
| `429` | `JOIN_ATTEMPT_LIMITED` | ユーザー単位の参加試行制限 |
| `429` | `TOO_MANY_REQUESTS` | API Gatewayなどの流量制限 |
| `500` | `INTERNAL_ERROR` | 想定外のサーバーエラー |
| `503` | `SERVICE_UNAVAILABLE` | 一時的に処理できない |

クライアントは `409 VERSION_CONFLICT`、`429`、`500`、`503` を自動的な状態変更再送の根拠にしません。状態変更の再送が必要な場合は、同じ `Idempotency-Key` を使用します。

## ポーリング

ポーリング間隔はMVP要件に従います。

- 相手ターンまたは相手の選択待ち: 2秒
- 参加者待ち: 5秒
- 自分が操作可能: 10秒
- 非表示タブ: 30秒
- タブが表示状態へ戻った直後: 即時取得
- 状態変更成功後: レスポンス内の状態を反映
- ゲーム終了後: 停止

MVPでは `ETag`、条件付きGET、長時間ポーリングを導入しません。レスポンスの `version` を比較し、同じバージョンなら画面状態を再構築しないようにします。

ポーリング失敗時は、固定間隔で無制限に再試行せず、最大30秒程度まで段階的に間隔を延ばします。`401` は再認証、`404` / `410` はコンテキスト再取得、`429` / `500` / `503` は待機後の再試行対象とします。

## CORS

API Gateway HTTP APIでCORSを設定します。

- 許可オリジン: 実際に使用するAmplify Hostingの限定ベータ環境だけ
- 許可メソッド: `GET`, `POST`, `OPTIONS`
- 許可ヘッダー: `Authorization`, `Content-Type`, `Idempotency-Key`
- Cookie認証を使用しないため `allowCredentials` は無効
- `*` による全オリジン許可は使用しない

ローカル開発用オリジンは開発環境だけに追加し、本番相当環境へ含めません。

## スロットリング

API Gatewayのルート別スロットリングは、限定ベータ開始時の暫定値として次を設定します。

| 対象 | Rate | Burst |
| --- | ---: | ---: |
| `GET /v1/rooms/{roomId}` | 10 requests/second | 20 |
| `GET /v1/games/{gameId}` | 20 requests/second | 40 |
| `POST /v1/rooms/join` | 2 requests/second | 5 |
| その他の状態変更API | 5 requests/second | 10 |

API Gatewayのルート別制限はユーザー単位ではなく共有の防御層であり、保証された上限でもありません。ルーム参加の「15分間に5回失敗後、15分ブロック」はLambdaとDynamoDBで別途ユーザー単位に実施します。

利用人数とCloudWatchメトリクスを確認し、正規の2秒ポーリングを妨げる場合だけ値を調整します。

## ログと監視

通常ログへ記録する項目:

- `traceId`
- APIルート
- HTTPメソッド
- 結果コード
- Lambda処理時間
- DynamoDB操作の成否
- 対象を直接復元できない形へ配慮した `gameId` / `roomId`
- `userId` は必要な調査時に追跡できる最小限の形式

通常ログへ記録しない項目:

- JWT、パスワード、認証情報
- リクエストの `Authorization` ヘッダー
- デッキ全体
- 手札全体
- ドローしたカードID
- DynamoDBの完全なゲーム状態

CloudWatch Logsの保持期間は14日とします。

## Lambdaの責務分割

初期実装では、ルートごとに多数のLambdaを作らず、責務単位で次の3系統を基本案とします。

- Context/Room Lambda: コンテキスト取得、ルーム作成・参加・取得・退出・開始
- Game Query Lambda: ゲーム状態取得と放棄期限判定
- Game Command Lambda: ゲームコマンドと投了

ゲームルール計算と閲覧者向け状態変換は、ハンドラーから分離した通常のアプリケーションコードとして共有します。実装言語とディレクトリ構成を決める段階で、デプロイ単位を最終確定します。

## 検証シナリオ

- JWTなし、期限切れJWTでAPIを利用できない
- クライアント指定の `userId` で他人として操作できない
- 所属していないルーム・ゲームの状態を取得できない
- 無効、期限切れ、満員、開始済みルームの参加エラーから個別状態を判別できない
- 同じルーム参加失敗を繰り返すとユーザー単位で制限される
- 同じ冪等性キーと同じ本文の再送で二重更新されない
- 同じ冪等性キーと異なる本文が拒否される
- 古い `expectedVersion` の操作が `VERSION_CONFLICT` になる
- 開始APIの再送で再シャッフル・再配札されない
- 相手の手札には色だけが含まれ、数字とカードIDが含まれない
- デッキ情報には残り枚数とトップ色だけが含まれる
- 追加ドローが1リクエストずつ処理される
- カードプレイ後も、手番終了前なら追加ドローできる
- 実行可能でないカードや選択候補をサーバーが拒否する
- ダミー処理と自動選択後の最新状態が操作レスポンスに反映される
- 投了が手番外でも成立し、再送で二重終了しない
- 24時間無操作のゲーム取得時に放棄終了状態が返る
- ポーリングだけでは `lastActionAt` と `abandonAt` が延長されない
- エラーレスポンスとCloudWatch Logsへ非公開カード情報や認証情報が出ない

## 次に行うこと

このAPI設計を前提に、次は `workspace/plans/06-screen-flow.md` で画面一覧、画面遷移、各画面が利用するAPI、PCとスマートフォン縦向きの構成を整理します。

## AWS公式資料

- [Cognitoアクセストークンの構成](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html)
- [API Gateway HTTP APIのJWTオーソライザー](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [API Gateway HTTP APIのCORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)
- [API Gateway HTTP APIのスロットリング](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html)
