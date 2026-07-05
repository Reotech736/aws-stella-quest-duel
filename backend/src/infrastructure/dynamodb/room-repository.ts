import {
  GetCommand,
  type GetCommandOutput,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import type { DocumentClientPort } from "./client";
import { toGameStateItem } from "./game-state-mapper";
import type {
  ActiveContextItem,
  GameEventItem,
  GameState,
  JoinGuardItem,
  RequestItem,
  RoomItem,
} from "./items";
import {
  activeContextKey,
  joinGuardKey,
  roomKey,
} from "./keys";

export type RoomReadConsistency = "strong" | "eventual";

export interface CreateRoomInput {
  readonly room: RoomItem;
  readonly ownerContext: ActiveContextItem;
  readonly request: RequestItem;
}

export interface JoinRoomInput {
  readonly room: RoomItem;
  readonly expectedVersion: number;
  readonly guestContext: ActiveContextItem;
  readonly request: RequestItem;
  readonly guestUserId: string;
}

export interface StartRoomGameInput {
  readonly room: RoomItem;
  readonly expectedVersion: number;
  readonly ownerContext: ActiveContextItem;
  readonly guestContext: ActiveContextItem;
  readonly gameState: GameState;
  readonly gameEvent: GameEventItem;
  readonly request: RequestItem;
}

export interface LeaveRoomInput {
  readonly room: RoomItem;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly actorRole: "OWNER" | "GUEST";
  readonly request: RequestItem;
}

export interface ExpireRoomInput {
  readonly room: RoomItem;
  readonly expectedVersion: number;
}

export class RoomPersistenceConflictError extends Error {
  constructor(cause: unknown) {
    super("ルームの条件付き書き込みが競合しました。", {
      cause,
    });
    this.name = "RoomPersistenceConflictError";
  }
}

function assertTableName(tableName: string): void {
  if (tableName.trim().length === 0) {
    throw new Error("DynamoDBテーブル名は空文字にできません。");
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

function assertItemType<T extends { readonly entityType: string }>(
  item: Record<string, unknown>,
  entityType: T["entityType"],
): asserts item is Record<string, unknown> & T {
  if (item.entityType !== entityType) {
    throw new Error(`取得したアイテムは${entityType}ではありません。`);
  }
}

function assertCreateRoomInput(input: CreateRoomInput): void {
  if (
    input.room.status !== "WAITING" ||
    input.room.version !== 1 ||
    input.room.guestUserId !== undefined ||
    input.room.gameId !== undefined
  ) {
    throw new Error("作成するルームの初期状態が不正です。");
  }

  if (
    input.ownerContext.userId !== input.room.ownerUserId ||
    input.ownerContext.roomId !== input.room.roomId ||
    input.ownerContext.role !== "OWNER" ||
    input.ownerContext.contextStatus !== "WAITING"
  ) {
    throw new Error("作成者のアクティブコンテキストがルームと一致しません。");
  }

  if (
    input.request.scope !== "USER" ||
    input.request.PK !== `USER#${input.room.ownerUserId}`
  ) {
    throw new Error("ルーム作成リクエストのスコープが作成者と一致しません。");
  }
}

function assertJoinRoomInput(input: JoinRoomInput): void {
  if (
    input.room.status !== "READY" ||
    input.room.guestUserId !== input.guestUserId ||
    input.room.version !== input.expectedVersion + 1
  ) {
    throw new Error("参加後のルーム状態が不正です。");
  }

  if (
    input.guestContext.userId !== input.guestUserId ||
    input.guestContext.roomId !== input.room.roomId ||
    input.guestContext.role !== "GUEST" ||
    input.guestContext.contextStatus !== "READY"
  ) {
    throw new Error("参加者のアクティブコンテキストがルームと一致しません。");
  }

  if (
    input.request.scope !== "ROOM" ||
    input.request.PK !== `ROOM#${input.room.roomId}`
  ) {
    throw new Error("ルーム参加リクエストのスコープがルームと一致しません。");
  }
}

function assertStartRoomGameInput(input: StartRoomGameInput): void {
  if (
    input.room.status !== "IN_GAME" ||
    input.room.gameId !== input.gameState.gameId ||
    input.room.roomId !== input.gameState.roomId ||
    input.room.version !== input.expectedVersion + 1
  ) {
    throw new Error("開始後のルーム状態がゲームと一致しません。");
  }

  for (const [role, context] of [
    ["OWNER", input.ownerContext],
    ["GUEST", input.guestContext],
  ] as const) {
    const expectedUserId =
      input.gameState.players[role].userId;
    if (
      context.userId !== expectedUserId ||
      context.roomId !== input.room.roomId ||
      context.gameId !== input.gameState.gameId ||
      context.role !== role ||
      context.contextStatus !== "IN_GAME"
    ) {
      throw new Error(`${role}のアクティブコンテキストがゲームと一致しません。`);
    }
  }

  if (
    input.gameEvent.gameId !== input.gameState.gameId ||
    input.gameEvent.actionType !== "GAME_STARTED"
  ) {
    throw new Error("ゲーム開始イベントがゲーム状態と一致しません。");
  }

  if (
    input.request.scope !== "ROOM" ||
    input.request.PK !== `ROOM#${input.room.roomId}` ||
    (input.request.resultVersion !== undefined &&
      input.request.resultVersion !== input.room.version)
  ) {
    throw new Error("ゲーム開始リクエストがルーム状態と一致しません。");
  }
}

function assertLeaveRoomInput(input: LeaveRoomInput): "OWNER" | "GUEST" {
  const role = input.actorRole;
  if (
    (role === "OWNER" &&
      input.actorUserId !== input.room.ownerUserId) ||
    (role === "GUEST" &&
      input.actorUserId === input.room.ownerUserId)
  ) {
    throw new Error("退出者のロールがルームと一致しません。");
  }
  if (input.room.version !== input.expectedVersion + 1) {
    throw new Error("退出後のルームversionが不正です。");
  }
  if (
    role === "OWNER" &&
    (input.room.status !== "CLOSED" ||
      input.room.closeReason !== "OWNER_LEFT")
  ) {
    throw new Error("作成者退出後のルーム状態が不正です。");
  }
  if (
    role === "GUEST" &&
    (input.room.status !== "WAITING" ||
      input.room.guestUserId !== undefined ||
      input.room.gameId !== undefined)
  ) {
    throw new Error("参加者退出後のルーム状態が不正です。");
  }
  if (
    input.request.scope !== "ROOM" ||
    input.request.PK !== `ROOM#${input.room.roomId}` ||
    input.request.actorUserId !== input.actorUserId
  ) {
    throw new Error("退出リクエストのスコープがルームと一致しません。");
  }
  return role;
}

function assertExpireRoomInput(input: ExpireRoomInput): void {
  if (
    input.room.status !== "EXPIRED" ||
    input.room.closeReason !== "EXPIRED" ||
    input.room.version !== input.expectedVersion + 1
  ) {
    throw new Error("期限切れ後のルーム状態が不正です。");
  }
}

export class RoomRepository {
  readonly #client: DocumentClientPort;
  readonly #tableName: string;

  constructor(client: DocumentClientPort, tableName: string) {
    assertTableName(tableName);
    this.#client = client;
    this.#tableName = tableName;
  }

  async getRoom(
    roomId: string,
    consistency: RoomReadConsistency,
  ): Promise<RoomItem | null> {
    return this.#getItem(
      roomKey(roomId),
      "ROOM",
      consistency === "strong",
    );
  }

  async getActiveContext(
    userId: string,
  ): Promise<ActiveContextItem | null> {
    return this.#getItem(
      activeContextKey(userId),
      "ACTIVE_CONTEXT",
      true,
    );
  }

  async getJoinGuard(userId: string): Promise<JoinGuardItem | null> {
    return this.#getItem(joinGuardKey(userId), "JOIN_GUARD", true);
  }

  async createRoom(input: CreateRoomInput): Promise<void> {
    assertCreateRoomInput(input);
    const itemDoesNotExist =
      "attribute_not_exists(PK) AND attribute_not_exists(SK)";

    await this.#transact(
      input.request.requestId,
      [
        input.room,
        input.ownerContext,
        input.request,
      ].map((item) => ({
        Put: {
          TableName: this.#tableName,
          Item: item,
          ConditionExpression: itemDoesNotExist,
        },
      })),
    );
  }

  async joinRoom(input: JoinRoomInput): Promise<void> {
    assertJoinRoomInput(input);
    const itemDoesNotExist =
      "attribute_not_exists(PK) AND attribute_not_exists(SK)";

    await this.#transact(input.request.requestId, [
      {
        Put: {
          TableName: this.#tableName,
          Item: input.room,
          ConditionExpression:
            "#version = :expectedVersion AND #status = :waiting AND attribute_not_exists(guestUserId)",
          ExpressionAttributeNames: {
            "#version": "version",
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":expectedVersion": input.expectedVersion,
            ":waiting": "WAITING",
          },
        },
      },
      {
        Put: {
          TableName: this.#tableName,
          Item: input.guestContext,
          ConditionExpression: itemDoesNotExist,
        },
      },
      {
        Put: {
          TableName: this.#tableName,
          Item: input.request,
          ConditionExpression: itemDoesNotExist,
        },
      },
      {
        Delete: {
          TableName: this.#tableName,
          Key: joinGuardKey(input.guestUserId),
        },
      },
    ]);
  }

  async startGame(input: StartRoomGameInput): Promise<void> {
    assertStartRoomGameInput(input);
    const itemDoesNotExist =
      "attribute_not_exists(PK) AND attribute_not_exists(SK)";
    const contextMatchesRoom =
      "roomId = :roomId AND #role = :role";

    await this.#transact(input.request.requestId, [
      {
        Put: {
          TableName: this.#tableName,
          Item: input.room,
          ConditionExpression:
            "#version = :expectedVersion AND #status = :ready",
          ExpressionAttributeNames: {
            "#version": "version",
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":expectedVersion": input.expectedVersion,
            ":ready": "READY",
          },
        },
      },
      {
        Put: {
          TableName: this.#tableName,
          Item: input.ownerContext,
          ConditionExpression: contextMatchesRoom,
          ExpressionAttributeNames: {
            "#role": "role",
          },
          ExpressionAttributeValues: {
            ":roomId": input.room.roomId,
            ":role": "OWNER",
          },
        },
      },
      {
        Put: {
          TableName: this.#tableName,
          Item: input.guestContext,
          ConditionExpression: contextMatchesRoom,
          ExpressionAttributeNames: {
            "#role": "role",
          },
          ExpressionAttributeValues: {
            ":roomId": input.room.roomId,
            ":role": "GUEST",
          },
        },
      },
      ...[toGameStateItem(input.gameState), input.gameEvent, input.request].map(
        (item) => ({
          Put: {
            TableName: this.#tableName,
            Item: item,
            ConditionExpression: itemDoesNotExist,
          },
        }),
      ),
    ]);
  }

  async leaveRoom(input: LeaveRoomInput): Promise<void> {
    const role = assertLeaveRoomInput(input);
    const itemDoesNotExist =
      "attribute_not_exists(PK) AND attribute_not_exists(SK)";
    const contextDeletes = [
      {
        userId: input.actorUserId,
        role,
      },
      ...(role === "OWNER" && input.room.guestUserId !== undefined
        ? [
            {
              userId: input.room.guestUserId,
              role: "GUEST" as const,
            },
          ]
        : []),
    ].map(({ userId, role: contextRole }) => ({
      Delete: {
        TableName: this.#tableName,
        Key: activeContextKey(userId),
        ConditionExpression: "roomId = :roomId AND #role = :role",
        ExpressionAttributeNames: {
          "#role": "role",
        },
        ExpressionAttributeValues: {
          ":roomId": input.room.roomId,
          ":role": contextRole,
        },
      },
    }));

    await this.#transact(input.request.requestId, [
      {
        Put: {
          TableName: this.#tableName,
          Item: input.room,
          ConditionExpression:
            "#version = :expectedVersion AND #status IN (:waiting, :ready)",
          ExpressionAttributeNames: {
            "#version": "version",
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":expectedVersion": input.expectedVersion,
            ":waiting": "WAITING",
            ":ready": "READY",
          },
        },
      },
      ...contextDeletes,
      {
        Put: {
          TableName: this.#tableName,
          Item: input.request,
          ConditionExpression: itemDoesNotExist,
        },
      },
    ]);
  }

  async expireRoom(input: ExpireRoomInput): Promise<void> {
    assertExpireRoomInput(input);
    const userIds = [
      input.room.ownerUserId,
      ...(input.room.guestUserId === undefined
        ? []
        : [input.room.guestUserId]),
    ];

    await this.#transact(undefined, [
      {
        Put: {
          TableName: this.#tableName,
          Item: input.room,
          ConditionExpression:
            "#version = :expectedVersion AND #status IN (:waiting, :ready)",
          ExpressionAttributeNames: {
            "#version": "version",
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":expectedVersion": input.expectedVersion,
            ":waiting": "WAITING",
            ":ready": "READY",
          },
        },
      },
      ...userIds.map((userId) => ({
        Delete: {
          TableName: this.#tableName,
          Key: activeContextKey(userId),
          ConditionExpression: "roomId = :roomId",
          ExpressionAttributeValues: {
            ":roomId": input.room.roomId,
          },
        },
      })),
    ]);
  }

  async #getItem<T extends { readonly entityType: string }>(
    key: { readonly PK: string; readonly SK: string },
    entityType: T["entityType"],
    consistentRead: boolean,
  ): Promise<T | null> {
    const response = (await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: key,
        ConsistentRead: consistentRead,
      }),
    )) as GetCommandOutput;

    if (response.Item === undefined) {
      return null;
    }

    assertItemType<T>(response.Item, entityType);
    return response.Item;
  }

  async #transact(
    requestId: string | undefined,
    transactItems: NonNullable<
      ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]
    >,
  ): Promise<void> {
    try {
      await this.#client.send(
        new TransactWriteCommand({
          ...(requestId === undefined
            ? {}
            : {
                ClientRequestToken: requestId,
              }),
          TransactItems: transactItems,
        }),
      );
    } catch (error) {
      if (isConflictError(error)) {
        throw new RoomPersistenceConflictError(error);
      }

      throw error;
    }
  }
}
