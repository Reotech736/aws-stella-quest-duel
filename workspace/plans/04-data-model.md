# 04-data-model

## 概要

このドキュメントは、「ステラクエスト Duel」MVPのDynamoDBデータ設計を整理するための一次計画です。

`workspace/plans/02-rules-discovery.md` と `workspace/plans/03-mvp-requirements.md` を前提に、まずアクセスパターンを固定し、その後にテーブル・キー・アイテム構造を定義します。

## 設計方針

状態: 詳細化済み

- DynamoDBは単一テーブルで始める
- テーブルはオンデマンドキャパシティを使用する
- 初期案ではGSIを作らない
- すべての読み書きを既知のキーによる `GetItem` / `Query` / 条件付き書き込みで行う
- `Scan` を通常処理に使わない
- ゲーム状態は1つの状態アイテムへ集約する
- ゲーム状態の更新は `version` による楽観的ロックで保護する
- 複数アイテムを同時に変更する操作は `TransactWriteItems` でまとめる
- TTLは物理削除用に使い、ルームやゲームの期限判定そのものには使わない
- クライアントはDynamoDBへ直接アクセスせず、Lambdaが閲覧者ごとの公開状態を組み立てる

この方針により、MVPではテーブル数とインデックス数を増やさず、アクセスパターンを明示した小さな構成に保ちます。

## テーブル案

状態: 詳細化済み

テーブル名は環境ごとに決めますが、この文書では `StellaQuestDuelTable` と呼びます。

| 項目 | 内容 |
| --- | --- |
| パーティションキー | `PK` |
| ソートキー | `SK` |
| キャパシティ | オンデマンド |
| TTL属性 | `purgeAt` |
| GSI | 初期案ではなし |
| DynamoDB Streams | 初期案ではなし |
| Global Tables | 使用しない |
| DAX | 使用しない |

TTLの `purgeAt` はUnix epoch秒で保存します。

## 主要ID

状態: 詳細化済み

| ID | 用途 | 形式 |
| --- | --- | --- |
| `userId` | Cognitoユーザー識別子 | Cognito `sub` |
| `roomId` | 口頭共有するルームID | 紛らわしい文字を除外した6桁大文字英数字 |
| `gameId` | ゲーム内部識別子 | サーバー生成のUUID v7系 |
| `eventId` | イベント識別子 | サーバー生成のUUID v7系 |
| `requestId` | 冪等性キー | クライアント生成のUUID v7系 |

`roomId` は `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` から生成します。

`gameId` / `eventId` / `requestId` はユーザーに見せる共有キーではなく、APIとログ追跡で使う不透明IDとして扱います。`requestId` はリトライや二重クリックを同一操作として扱うため、クライアントが操作ごとに生成してAPIへ送ります。

## カードID表現

状態: 詳細化済み

カードは短い文字列IDで保存します。ゲーム状態アイテムのサイズを抑えつつ、デバッグ時にカード種別を読める形式にします。

| カード種別 | 形式 | 例 |
| --- | --- | --- |
| 赤の感情カード | `R<数字><複製>` | `R1a`, `R1b`, `R6a` |
| 黄の感情カード | `Y<数字><複製>` | `Y2a`, `Y2b`, `Y6b` |
| 青の感情カード | `B<数字><複製>` | `B3a`, `B3b`, `B5a` |
| 緑の感情カード | `G<数字><複製>` | `G4a`, `G4b`, `G6b` |
| 休憩カード | `X<連番>` | `X1` から `X6` |

- 感情カードの数字は `1` から `6` とする
- 同色同数字の2枚は `a` / `b` で区別する
- 休憩カードは数字を持たないため、`X` と連番だけで区別する
- `deck` と `discardPile` は配列の末尾をトップとして扱う
- クライアントへ公開する山札情報は、トップカードの色または休憩カードであることだけに限定する
- 山札の2枚目以降のカードIDや色は、どのプレイヤーにも返さない

## アクセスパターン

状態: 詳細化済み

| ID | アクセスパターン | 主なキー | 読み取り |
| --- | --- | --- | --- |
| AP-01 | ユーザーの待機中・進行中コンテキストを取得する | `PK=USER#<userId>`, `SK=ACTIVE_CONTEXT` | 強整合 |
| AP-02 | ルームIDから待機ルームを取得する | `PK=ROOM#<roomId>`, `SK=META` | 強整合 |
| AP-03 | ルーム状態をポーリングする | `PK=ROOM#<roomId>`, `SK=META` | 結果整合 |
| AP-04 | ゲーム状態を取得する | `PK=GAME#<gameId>`, `SK=STATE` | 結果整合 |
| AP-05 | ゲーム操作前に最新状態を取得する | `PK=GAME#<gameId>`, `SK=STATE` | 強整合 |
| AP-06 | ゲームイベントを時系列で取得する | `PK=GAME#<gameId>`, `SK begins_with EVENT#` | 結果整合 |
| AP-07 | ユーザーの参加失敗状態を取得する | `PK=USER#<userId>`, `SK=JOIN_GUARD` | 強整合 |
| AP-08 | ルーム作成リクエストの冪等性を確認する | `PK=USER#<userId>`, `SK=REQUEST#<requestId>` | 強整合 |
| AP-09 | ルーム操作リクエストの冪等性を確認する | `PK=ROOM#<roomId>`, `SK=REQUEST#<requestId>` | 強整合 |
| AP-10 | ゲーム操作リクエストの冪等性を確認する | `PK=GAME#<gameId>`, `SK=REQUEST#<requestId>` | 強整合 |

通常の画面ポーリングは結果整合読み取りでコストを抑えます。状態変更を伴う操作では、Lambdaが強整合読み取りで最新状態を取得し、条件付き書き込みで更新します。

AP-06のイベント取得は、MVPの通常画面表示には使いません。画面はAP-03とAP-04の状態ポーリングを主軸にし、イベントログは当面デバッグ・調査用途に寄せます。

## アイテム種別

状態: 詳細化済み

### 1. ルーム

| 属性 | 内容 |
| --- | --- |
| `PK` | `ROOM#<roomId>` |
| `SK` | `META` |
| `entityType` | `ROOM` |
| `roomId` | 6桁ルームID |
| `status` | `WAITING` / `READY` / `IN_GAME` / `CLOSED` / `EXPIRED` |
| `ownerUserId` | 作成者 |
| `ownerDisplayName` | 作成者の公開表示名 |
| `guestUserId` | 参加者。未参加なら未設定 |
| `guestDisplayName` | 参加者の公開表示名。未参加なら未設定 |
| `gameId` | 開始後のゲームID |
| `version` | 楽観的ロック用の整数 |
| `createdAt` | 作成日時 |
| `waitingExpiresAt` | 作成から24時間後 |
| `closedAt` | 終了日時 |
| `closeReason` | `OWNER_LEFT` / `STARTED` / `EXPIRED` など |
| `purgeAt` | 物理削除予定時刻 |

`roomId` は口頭共有する参加キーであり、認証の代替ではありません。

### 2. ユーザーのアクティブコンテキスト

| 属性 | 内容 |
| --- | --- |
| `PK` | `USER#<userId>` |
| `SK` | `ACTIVE_CONTEXT` |
| `entityType` | `ACTIVE_CONTEXT` |
| `userId` | Cognito `sub` |
| `roomId` | 現在所属しているルーム |
| `gameId` | 進行中ゲーム。開始前は未設定 |
| `role` | `OWNER` / `GUEST` |
| `contextStatus` | `WAITING` / `READY` / `IN_GAME` |
| `createdAt` | 所属開始日時 |
| `updatedAt` | 更新日時 |

1ユーザーが同時に所属できる待機中または進行中のルームを1つに制限するためのロックとして使います。

作成・参加時は、このアイテムが存在しないことを条件にします。既に存在する場合は、参照先のルームまたはゲームを確認し、期限切れや終了済みであれば条件付きで解除してから新しい所属を作ります。

### 3. 参加試行制限

| 属性 | 内容 |
| --- | --- |
| `PK` | `USER#<userId>` |
| `SK` | `JOIN_GUARD` |
| `entityType` | `JOIN_GUARD` |
| `windowStartedAt` | 失敗回数集計ウィンドウ開始 |
| `failedCount` | ウィンドウ内の失敗回数 |
| `blockedUntil` | 参加試行拒否の終了時刻 |
| `updatedAt` | 更新日時 |
| `purgeAt` | 不要になった制限情報の削除予定時刻 |

15分間に5回失敗した場合、`blockedUntil` を設定します。成功時は削除、または `failedCount=0` に戻します。

### 4. ゲーム状態

| 属性 | 内容 |
| --- | --- |
| `PK` | `GAME#<gameId>` |
| `SK` | `STATE` |
| `entityType` | `GAME_STATE` |
| `gameId` | ゲームID |
| `roomId` | ルームID |
| `status` | `IN_PROGRESS` / `COMPLETED` / `ABANDONED` |
| `version` | 楽観的ロック用の整数 |
| `players` | プレイヤーA/BのユーザーID、表示名、ロール |
| `phase` | 現在フェーズ |
| `currentActor` | 現在操作すべき主体 |
| `startPlayer` | 現在ラウンドのスタートプレイヤー |
| `blackStarHolder` | 黒い星マーカーの位置 |
| `deck` | サーバーだけが使うカードID配列 |
| `discardPile` | 捨て札カードID配列 |
| `hands` | 各プレイヤーの手札カードID配列 |
| `playedCards` | 現在ラウンドでプレイされたカード |
| `collections` | 各プレイヤーの収集カード |
| `starlightTokens` | 各プレイヤーの光面・闇面枚数 |
| `pendingChoice` | 収集カードや捨て札トップ選択待ちの情報 |
| `lastActionAt` | 最後の状態変更日時 |
| `abandonAt` | 24時間無操作による放棄期限 |
| `endedAt` | 終了日時 |
| `endReason` | `ENLIGHTENMENT` / `LIGHT_LOST` / `RESIGNATION` / `ABANDONED` |
| `winnerUserId` | 勝者。放棄時は未設定 |
| `loserUserId` | 敗者。放棄時は未設定 |
| `resignedBy` | 投了者 |
| `nextEventSeq` | 次イベント連番 |
| `purgeAt` | 終了30日後の物理削除予定時刻 |

ゲーム状態には、デッキ、手札、相手に非公開のカード数字を含む完全な状態を保存します。`deck` と `discardPile` は配列の末尾をトップとして扱います。クライアントへ返すときは、Lambdaが閲覧者ごとに公開可能な形へ変換します。

ゲーム状態アイテムは400KB制限に収まる必要があります。MVPではカードIDやフェーズ名をコンパクトに保ち、イベントログを状態アイテムへ蓄積しません。

### 5. ゲームイベント

| 属性 | 内容 |
| --- | --- |
| `PK` | `GAME#<gameId>` |
| `SK` | `EVENT#<seq>#<eventId>` |
| `entityType` | `GAME_EVENT` |
| `gameId` | ゲームID |
| `eventId` | イベントID |
| `seq` | ゲーム内連番 |
| `actorUserId` | 操作者。自動処理なら `SYSTEM` |
| `actionType` | 操作種別 |
| `payload` | 最小限のイベント情報 |
| `createdAt` | 作成日時 |
| `purgeAt` | 物理削除予定時刻 |

イベントは監査・デバッグ用であり、ゲーム状態の唯一の復元元にはしません。デッキ全体、手札全体、山札2枚目以降、ドローしたカードIDの一覧など、相手に非公開の情報をイベントpayloadへ保存しない方針とします。

payloadには公開寄りの最小情報だけを残します。例として、操作後の `version`、プレイされたカードID、収集されたカードID、選択された捨て札トップ、ドロー枚数、投了者、終了理由などを保存します。カードを引く操作では、引いたカードIDではなく `drawCount` だけを保存します。

### 6. 冪等性リクエスト

| 属性 | 内容 |
| --- | --- |
| `PK` | `USER#<userId>` / `ROOM#<roomId>` / `GAME#<gameId>` |
| `SK` | `REQUEST#<requestId>` |
| `entityType` | `REQUEST` |
| `requestId` | 冪等性キー |
| `requestHash` | リクエスト内容のハッシュ |
| `actorUserId` | 操作者 |
| `scope` | `USER` / `ROOM` / `GAME` |
| `resultStatus` | 成功または失敗の要約 |
| `resultVersion` | 成功時の更新後version |
| `resultResourceId` | 生成したルームやゲームを再送時に特定するID |
| `createdAt` | 作成日時 |
| `purgeAt` | 削除予定時刻 |

`TransactWriteItems` の `ClientRequestToken` も利用できますが、有効期間が短いため、アプリケーション側でも冪等性リクエストアイテムを保存します。保持期間は作成から24時間とし、`purgeAt = createdAt + 24 hours` を設定します。

## 主要更新フロー

状態: 詳細化済み

### 1. ルーム作成

1. サーバーが6桁 `roomId` を生成する
2. `ROOM#<roomId>` が存在しないことを条件にする
3. `USER#<ownerUserId> / ACTIVE_CONTEXT` が存在しないことを条件にする
4. ルーム、アクティブコンテキスト、冪等性リクエストをトランザクションで作成する
5. `roomId` が衝突した場合は再生成する

### 2. ルーム参加

1. `ROOM#<roomId>` を強整合で取得する
2. 待機期限切れなら期限切れ処理を行う
3. 参加試行制限を確認する
4. `guestUserId` が未設定であること、ルームが参加可能であることを条件にする
5. 参加者の `ACTIVE_CONTEXT` が存在しないことを条件にする
6. ルーム更新、参加者のアクティブコンテキスト作成、冪等性リクエストをトランザクションで実行する

### 3. 開始前の退出

- 作成者退出:
  - ルームを `CLOSED` にする
  - `closeReason=OWNER_LEFT` を保存する
  - 作成者と参加者のアクティブコンテキストを削除する
- 参加者退出:
  - ルームの `guestUserId` を削除し、`status=WAITING` に戻す
  - 参加者のアクティブコンテキストを削除する
  - `waitingExpiresAt` は延長しない

### 4. ゲーム開始

1. ルームが `READY` であることを確認する
2. ルーム作成者だけが開始できることを確認する
3. スタートプレイヤーを決定する
4. デッキを生成・シャッフルする
5. ゲーム状態アイテムを作成する
6. ルームを `IN_GAME` に更新する
7. 両プレイヤーのアクティブコンテキストへ `gameId` を保存する

### 5. ゲーム操作

1. ゲーム状態を強整合で取得する
2. `abandonAt` が過去なら放棄終了を試行する
3. ルール検証をサーバー側で行う
4. 新しいゲーム状態を計算する
5. `version` 一致を条件にゲーム状態を更新する
6. イベントアイテムと冪等性リクエストを同じトランザクションで作成する
7. 終了する場合は、ルーム更新と両プレイヤーのアクティブコンテキスト削除も同じトランザクションへ含める

### 6. 放棄終了

1. APIアクセス時に `status=IN_PROGRESS` かつ `abandonAt <= now` を検出する
2. `version` 一致を条件に `status=ABANDONED` へ更新する
3. `endReason=ABANDONED` を保存する
4. 勝者・敗者は保存しない
5. ルームを終了状態へ更新する
6. 両プレイヤーのアクティブコンテキストを削除する
7. イベントを作成する

### 7. 投了

1. 操作者がゲーム参加者であることを確認する
2. ゲームが進行中であることを確認する
3. 確認済みの投了リクエストだけを受け付ける
4. 相手を勝者、投了者を敗者として保存する
5. `endReason=RESIGNATION` を保存する
6. ルームとアクティブコンテキストを終了状態へ更新する

## TTLと保持期間

状態: 詳細化済み

- 待機ルームは `waitingExpiresAt` で論理的に失効させる
- DynamoDB TTLは `purgeAt` による物理削除に使用する
- 終了済みゲーム状態は終了から30日後に削除する
- ゲームイベントはイベント作成から30日後に削除する
- 冪等性リクエストは作成から24時間後に削除する
- 参加試行制限は最終更新またはブロック解除から24時間後に削除する
- TTLによる削除は即時ではないため、APIでは必ず `status` と期限時刻を検証する

| アイテム | `purgeAt` の設定 |
| --- | --- |
| 待機期限切れまたは開始前クローズ済みルーム | `closedAt` または `waitingExpiresAt` から7日後 |
| ゲーム終了後のルーム | `endedAt` から30日後 |
| 終了済みゲーム状態 | `endedAt` から30日後 |
| ゲームイベント | `createdAt` から30日後 |
| 冪等性リクエスト | `createdAt` から24時間後 |
| 参加試行制限 | `max(updatedAt, blockedUntil)` から24時間後 |

ゲームイベントは作成時点で `purgeAt` を設定します。終了時に過去イベントへTTLを後付け更新しないため、終了処理の書き込み量を増やさずに済みます。イベントログは復元元ではないため、長期化したゲームで古いイベントが先に削除されてもゲーム進行には影響しない設計とします。

## 低コスト方針

状態: 詳細化済み

- DynamoDBはオンデマンドキャパシティで開始する
- GSIを初期作成しない
- ポーリングは結果整合読み取りを使う
- 状態変更操作だけ強整合読み取りと条件付き書き込みを使う
- Streams、DAX、Global Tablesは使わない
- TTLで終了済みデータを削除し、ストレージ増加を抑える
- CloudWatch Logsへ完全なゲーム状態や手札・デッキを出力しない

必要になった場合だけ、オンデマンドの最大スループット設定やGSIを再検討します。

## 検証シナリオ

状態: 詳細化済み

- 同じ `roomId` が生成された場合、既存ルームを上書きせず再生成する
- アクティブコンテキストがあるユーザーは新しいルームを作成できない
- 期限切れのアクティブコンテキストは、参照先の状態確認後に解除できる
- 参加失敗が15分間に5回になると、15分間参加試行を拒否する
- 作成者退出でルームと両者の所属が解除される
- 参加者退出でルームIDを維持したまま参加枠が再開放される
- 同時参加で参加者枠が二重に埋まらない
- 開始処理の再送で二重にゲームが作成されない
- 同時ゲーム操作で `version` 不一致の操作が拒否される
- 投了再送で二重に終了処理されない
- 放棄終了を複数APIが同時検出しても1回だけ成立する
- ポーリングレスポンスに相手の手札数字やデッキ2枚目以降が含まれない
- ドローイベントに引いたカードIDが保存されない
- 終了済みゲーム状態に `purgeAt` が設定される
- ゲームイベントに `createdAt + 30 days` の `purgeAt` が設定される
- 冪等性リクエストに `createdAt + 24 hours` の `purgeAt` が設定される

## 次に行うこと

このデータ設計を前提に、次は `workspace/plans/05-api-design.md` でHTTP API一覧、入出力、エラー条件、冪等性キーの渡し方を整理します。

## AWS公式資料

- [Data Modeling foundations in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling-foundations.html)
- [DynamoDB on-demand capacity mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode.html)
- [DynamoDB read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
- [Optimistic locking with version number](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_OptimisticLocking.html)
- [Amazon DynamoDB Transactions: How it works](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)
- [Using time to live in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
