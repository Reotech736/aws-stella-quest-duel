import {
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { initializeGame } from "../../../src/domain/game/initialize-game";
import type {
  DocumentClientPort,
  SupportedDocumentCommand,
} from "../../../src/infrastructure/dynamodb/client";
import {
  createGameEventItem,
  createRequestItem,
} from "../../../src/infrastructure/dynamodb/item-builders";
import type {
  ActiveContextItem,
  JoinGuardItem,
  RoomItem,
} from "../../../src/infrastructure/dynamodb/items";
import {
  RoomPersistenceConflictError,
  RoomRepository,
} from "../../../src/infrastructure/dynamodb/room-repository";

class FakeDocumentClient implements DocumentClientPort {
  readonly commands: SupportedDocumentCommand[] = [];
  response: unknown = {};
  error: unknown;

  async send(command: SupportedDocumentCommand): Promise<unknown> {
    this.commands.push(command);

    if (this.error !== undefined) {
      throw this.error;
    }

    return this.response;
  }
}

const createdAt = "2026-07-05T12:00:00.000Z";
const updatedAt = "2026-07-05T12:01:00.000Z";
const waitingExpiresAt = "2026-07-06T12:00:00.000Z";

function createWaitingRoom(): RoomItem {
  return {
    PK: "ROOM#A2B3C4",
    SK: "META",
    entityType: "ROOM",
    roomId: "A2B3C4",
    status: "WAITING",
    ownerUserId: "owner-user",
    version: 1,
    createdAt,
    waitingExpiresAt,
  };
}

function createOwnerContext(): ActiveContextItem {
  return {
    PK: "USER#owner-user",
    SK: "ACTIVE_CONTEXT",
    entityType: "ACTIVE_CONTEXT",
    userId: "owner-user",
    roomId: "A2B3C4",
    role: "OWNER",
    contextStatus: "WAITING",
    createdAt,
    updatedAt: createdAt,
  };
}

function createGuestContext(): ActiveContextItem {
  return {
    PK: "USER#guest-user",
    SK: "ACTIVE_CONTEXT",
    entityType: "ACTIVE_CONTEXT",
    userId: "guest-user",
    roomId: "A2B3C4",
    role: "GUEST",
    contextStatus: "READY",
    createdAt: updatedAt,
    updatedAt,
  };
}

function createRoomRequest(
  requestId: string,
  resultVersion: number,
) {
  return createRequestItem({
    scope: "ROOM",
    scopeId: "A2B3C4",
    requestId,
    requestHash: "sha256:example",
    actorUserId: "owner-user",
    resultStatus: "SUCCEEDED",
    resultVersion,
    createdAt: updatedAt,
    purgeAt: 1_780_000_000,
  });
}

describe("RoomRepository", () => {
  it.each([
    ["strong", true],
    ["eventual", false],
  ] as const)("ルームを%s整合で取得する", async (consistency, expected) => {
    const client = new FakeDocumentClient();
    const room = createWaitingRoom();
    client.response = {
      Item: room,
    };
    const repository = new RoomRepository(client, "TestTable");

    await expect(
      repository.getRoom(room.roomId, consistency),
    ).resolves.toEqual(room);

    const command = client.commands[0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: "TestTable",
      Key: {
        PK: "ROOM#A2B3C4",
        SK: "META",
      },
      ConsistentRead: expected,
    });
  });

  it("アクティブコンテキストと参加制限を強整合で取得する", async () => {
    const client = new FakeDocumentClient();
    const repository = new RoomRepository(client, "TestTable");
    const context = createOwnerContext();
    const guard: JoinGuardItem = {
      PK: "USER#owner-user",
      SK: "JOIN_GUARD",
      entityType: "JOIN_GUARD",
      windowStartedAt: createdAt,
      failedCount: 2,
      updatedAt,
      purgeAt: 1_780_000_000,
    };
    client.response = {
      Item: context,
    };

    await expect(
      repository.getActiveContext("owner-user"),
    ).resolves.toEqual(context);
    client.response = {
      Item: guard,
    };
    await expect(repository.getJoinGuard("owner-user")).resolves.toEqual(
      guard,
    );

    for (const command of client.commands as GetCommand[]) {
      expect(command.input.ConsistentRead).toBe(true);
    }
  });

  it("ルーム・作成者コンテキスト・冪等性記録を同時に作成する", async () => {
    const client = new FakeDocumentClient();
    const repository = new RoomRepository(client, "TestTable");
    const request = createRequestItem({
      scope: "USER",
      scopeId: "owner-user",
      requestId: "01970000-0000-7000-8000-000000000001",
      requestHash: "sha256:example",
      actorUserId: "owner-user",
      resultStatus: "SUCCEEDED",
      resultVersion: 1,
      createdAt,
      purgeAt: 1_780_000_000,
    });

    await repository.createRoom({
      room: createWaitingRoom(),
      ownerContext: createOwnerContext(),
      request,
    });

    const command = client.commands[0] as TransactWriteCommand;
    expect(command).toBeInstanceOf(TransactWriteCommand);
    expect(command.input.ClientRequestToken).toBe(request.requestId);
    expect(command.input.TransactItems).toHaveLength(3);
    for (const item of command.input.TransactItems ?? []) {
      expect(item.Put?.ConditionExpression).toBe(
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      );
    }
  });

  it("ルーム参加と参加制限解除を同じトランザクションで行う", async () => {
    const client = new FakeDocumentClient();
    const repository = new RoomRepository(client, "TestTable");
    const room: RoomItem = {
      ...createWaitingRoom(),
      status: "READY",
      guestUserId: "guest-user",
      version: 2,
    };
    const request = createRoomRequest(
      "01970000-0000-7000-8000-000000000002",
      2,
    );

    await repository.joinRoom({
      room,
      expectedVersion: 1,
      guestContext: createGuestContext(),
      request,
      guestUserId: "guest-user",
    });

    const command = client.commands[0] as TransactWriteCommand;
    expect(command.input.TransactItems).toHaveLength(4);
    expect(command.input.TransactItems?.[0]?.Put).toMatchObject({
      ConditionExpression:
        "#version = :expectedVersion AND #status = :waiting AND attribute_not_exists(guestUserId)",
      ExpressionAttributeValues: {
        ":expectedVersion": 1,
        ":waiting": "WAITING",
      },
    });
    expect(command.input.TransactItems?.[3]?.Delete).toEqual({
      TableName: "TestTable",
      Key: {
        PK: "USER#guest-user",
        SK: "JOIN_GUARD",
      },
    });
  });

  it("ゲーム開始時にルーム・所属・ゲームを原子的に更新する", async () => {
    const client = new FakeDocumentClient();
    const repository = new RoomRepository(client, "TestTable");
    const game = initializeGame({
      gameId: "game-1",
      roomId: "A2B3C4",
      players: {
        OWNER: {
          userId: "owner-user",
          displayName: "Owner",
        },
        GUEST: {
          userId: "guest-user",
          displayName: "Guest",
        },
      },
      startPlayer: "OWNER",
      lastActionAt: updatedAt,
      abandonAt: "2026-07-06T12:01:00.000Z",
      random: () => 0,
    });
    const room: RoomItem = {
      ...createWaitingRoom(),
      status: "IN_GAME",
      guestUserId: "guest-user",
      gameId: game.gameId,
      version: 3,
    };
    const ownerContext: ActiveContextItem = {
      ...createOwnerContext(),
      gameId: game.gameId,
      contextStatus: "IN_GAME",
      updatedAt,
    };
    const guestContext: ActiveContextItem = {
      ...createGuestContext(),
      gameId: game.gameId,
      contextStatus: "IN_GAME",
    };
    const gameEvent = createGameEventItem({
      gameId: game.gameId,
      eventId: "event-1",
      seq: 1,
      actorUserId: "owner-user",
      actionType: "GAME_STARTED",
      payload: {
        version: game.version,
      },
      createdAt: updatedAt,
      purgeAt: 1_783_256_400,
    });
    const request = createRoomRequest(
      "01970000-0000-7000-8000-000000000003",
      3,
    );

    await repository.startGame({
      room,
      expectedVersion: 2,
      ownerContext,
      guestContext,
      gameState: game,
      gameEvent,
      request,
    });

    const command = client.commands[0] as TransactWriteCommand;
    expect(command.input.TransactItems).toHaveLength(6);
    expect(command.input.TransactItems?.[0]?.Put).toMatchObject({
      ConditionExpression:
        "#version = :expectedVersion AND #status = :ready",
      ExpressionAttributeValues: {
        ":expectedVersion": 2,
        ":ready": "READY",
      },
    });
    expect(command.input.TransactItems?.[1]?.Put).toMatchObject({
      ConditionExpression: "roomId = :roomId AND #role = :role",
      ExpressionAttributeValues: {
        ":roomId": "A2B3C4",
        ":role": "OWNER",
      },
    });
    expect(command.input.TransactItems?.[3]?.Put?.Item).toMatchObject({
      entityType: "GAME_STATE",
      gameId: "game-1",
    });
    expect(command.input.TransactItems?.[4]?.Put?.Item).toMatchObject({
      entityType: "GAME_EVENT",
      actionType: "GAME_STARTED",
    });
  });

  it("条件競合をルーム永続化エラーへ変換する", async () => {
    const client = new FakeDocumentClient();
    client.error = {
      name: "TransactionCanceledException",
    };
    const repository = new RoomRepository(client, "TestTable");
    const request = createRequestItem({
      scope: "USER",
      scopeId: "owner-user",
      requestId: "01970000-0000-7000-8000-000000000004",
      requestHash: "sha256:example",
      actorUserId: "owner-user",
      resultStatus: "SUCCEEDED",
      resultVersion: 1,
      createdAt,
      purgeAt: 1_780_000_000,
    });

    await expect(
      repository.createRoom({
        room: createWaitingRoom(),
        ownerContext: createOwnerContext(),
        request,
      }),
    ).rejects.toThrow(RoomPersistenceConflictError);
  });

  it("不整合な参加後状態をDynamoDB送信前に拒否する", async () => {
    const client = new FakeDocumentClient();
    const repository = new RoomRepository(client, "TestTable");

    await expect(
      repository.joinRoom({
        room: {
          ...createWaitingRoom(),
          status: "READY",
          guestUserId: "other-user",
          version: 2,
        },
        expectedVersion: 1,
        guestContext: createGuestContext(),
        request: createRoomRequest(
          "01970000-0000-7000-8000-000000000005",
          2,
        ),
        guestUserId: "guest-user",
      }),
    ).rejects.toThrow("参加後のルーム状態が不正です。");
    expect(client.commands).toHaveLength(0);
  });
});
