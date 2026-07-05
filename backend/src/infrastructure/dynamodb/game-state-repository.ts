import {
  GetCommand,
  type GetCommandOutput,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import type { GameState } from "../../domain/game/types";
import type { DocumentClientPort } from "./client";
import {
  fromGameStateItem,
  toGameStateItem,
} from "./game-state-mapper";
import type {
  GameEventItem,
  GameStateItem,
  RequestItem,
  RoomItem,
} from "./items";
import { activeContextKey, gameStateKey } from "./keys";

export type ReadConsistency = "strong" | "eventual";

export interface SaveGameActionInput {
  readonly state: GameState;
  readonly expectedVersion: number;
  readonly event: GameEventItem;
  readonly request?: RequestItem;
  readonly completion?: {
    readonly room: RoomItem;
    readonly expectedRoomVersion: number;
    readonly ownerUserId: string;
    readonly guestUserId: string;
  };
  readonly purgeAt?: number;
}

export class DynamoPersistenceConflictError extends Error {
  constructor(cause: unknown) {
    super("DynamoDBの条件付き書き込みが競合しました。", {
      cause,
    });
    this.name = "DynamoPersistenceConflictError";
  }
}

function isConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return (
    error.name === "TransactionCanceledException" ||
    error.name === "ConditionalCheckFailedException"
  );
}

function assertTableName(tableName: string): void {
  if (tableName.trim().length === 0) {
    throw new Error("DynamoDBテーブル名は空文字にできません。");
  }
}

function assertGameActionItems(input: SaveGameActionInput): void {
  if (input.event.gameId !== input.state.gameId) {
    throw new Error("イベントのgameIdがゲーム状態と一致しません。");
  }

  if (
    input.request !== undefined &&
    (input.request.scope !== "GAME" ||
      input.request.PK !== `GAME#${input.state.gameId}`)
  ) {
    throw new Error("冪等性リクエストのスコープが対象ゲームと一致しません。");
  }

  if (
    input.request?.resultVersion !== undefined &&
    input.request.resultVersion !== input.state.version
  ) {
    throw new Error("冪等性リクエストの結果versionがゲーム状態と一致しません。");
  }

  if (input.completion !== undefined) {
    const { room, ownerUserId, guestUserId } = input.completion;
    const expectedCloseReason =
      input.state.status === "ABANDONED"
        ? "GAME_ABANDONED"
        : "GAME_COMPLETED";
    if (
      input.state.status === "IN_PROGRESS" ||
      room.status !== "CLOSED" ||
      room.closeReason !== expectedCloseReason ||
      room.gameId !== input.state.gameId ||
      room.roomId !== input.state.roomId ||
      room.version !== input.completion.expectedRoomVersion + 1 ||
      input.state.players.OWNER.userId !== ownerUserId ||
      input.state.players.GUEST.userId !== guestUserId
    ) {
      throw new Error("ゲーム終了時のルーム・参加者情報が不正です。");
    }
  }
}

export class GameStateRepository {
  readonly #client: DocumentClientPort;
  readonly #tableName: string;

  constructor(client: DocumentClientPort, tableName: string) {
    assertTableName(tableName);
    this.#client = client;
    this.#tableName = tableName;
  }

  async get(
    gameId: string,
    consistency: ReadConsistency,
  ): Promise<GameState | null> {
    const response = (await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: gameStateKey(gameId),
        ConsistentRead: consistency === "strong",
      }),
    )) as GetCommandOutput;

    if (response.Item === undefined) {
      return null;
    }

    if (response.Item.entityType !== "GAME_STATE") {
      throw new Error("取得したアイテムはゲーム状態ではありません。");
    }

    return fromGameStateItem(response.Item as GameStateItem);
  }

  async saveAction(input: SaveGameActionInput): Promise<void> {
    assertGameActionItems(input);

    const gameStateItem = toGameStateItem(input.state, input.purgeAt);
    const itemDoesNotExist =
      "attribute_not_exists(PK) AND attribute_not_exists(SK)";
    const completionItems =
      input.completion === undefined
        ? []
        : [
            {
              Put: {
                TableName: this.#tableName,
                Item: input.completion.room,
                ConditionExpression:
                  "#version = :expectedVersion AND #status = :inGame AND gameId = :gameId",
                ExpressionAttributeNames: {
                  "#version": "version",
                  "#status": "status",
                },
                ExpressionAttributeValues: {
                  ":expectedVersion":
                    input.completion.expectedRoomVersion,
                  ":inGame": "IN_GAME",
                  ":gameId": input.state.gameId,
                },
              },
            },
            ...[
              input.completion.ownerUserId,
              input.completion.guestUserId,
            ].map((userId) => ({
              Delete: {
                TableName: this.#tableName,
                Key: activeContextKey(userId),
                ConditionExpression: "gameId = :gameId",
                ExpressionAttributeValues: {
                  ":gameId": input.state.gameId,
                },
              },
            })),
          ];

    try {
      await this.#client.send(
        new TransactWriteCommand({
          ...(input.request === undefined
            ? {}
            : {
                ClientRequestToken: input.request.requestId,
              }),
          TransactItems: [
            {
              Put: {
                TableName: this.#tableName,
                Item: gameStateItem,
                ConditionExpression: "#version = :expectedVersion",
                ExpressionAttributeNames: {
                  "#version": "version",
                },
                ExpressionAttributeValues: {
                  ":expectedVersion": input.expectedVersion,
                },
              },
            },
            {
              Put: {
                TableName: this.#tableName,
                Item: input.event,
                ConditionExpression: itemDoesNotExist,
              },
            },
            ...(input.request === undefined
              ? []
              : [
                  {
                    Put: {
                      TableName: this.#tableName,
                      Item: input.request,
                      ConditionExpression: itemDoesNotExist,
                    },
                  },
                ]),
            ...completionItems,
          ],
        }),
      );
    } catch (error) {
      if (isConflictError(error)) {
        throw new DynamoPersistenceConflictError(error);
      }

      throw error;
    }
  }
}
