import {
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { initializeGame } from "../../../src/domain/game/initialize-game";
import { resignGame } from "../../../src/domain/game/game-end";
import type {
  DocumentClientPort,
  SupportedDocumentCommand,
} from "../../../src/infrastructure/dynamodb/client";
import {
  DynamoPersistenceConflictError,
  GameStateRepository,
} from "../../../src/infrastructure/dynamodb/game-state-repository";
import { toGameStateItem } from "../../../src/infrastructure/dynamodb/game-state-mapper";
import {
  createGameEventItem,
  createRequestItem,
} from "../../../src/infrastructure/dynamodb/item-builders";

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

function createGame() {
  return initializeGame({
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
    lastActionAt: "2026-07-05T12:00:00.000Z",
    abandonAt: "2026-07-06T12:00:00.000Z",
    random: () => 0,
  });
}

function createSaveInput() {
  const state = {
    ...createGame(),
    version: 2,
  };
  const requestId = "01970000-0000-7000-8000-000000000001";

  return {
    state,
    expectedVersion: 1,
    event: createGameEventItem({
      gameId: state.gameId,
      eventId: "event-1",
      seq: 1,
      actorUserId: "owner-user",
      actionType: "PLAY_CARD" as const,
      payload: {
        version: state.version,
        playedCardId: "R1a",
      },
      createdAt: "2026-07-05T12:01:00.000Z",
      purgeAt: 1_783_256_400,
    }),
    request: createRequestItem({
      scope: "GAME" as const,
      scopeId: state.gameId,
      requestId,
      requestHash: "sha256:example",
      actorUserId: "owner-user",
      resultStatus: "SUCCEEDED" as const,
      resultVersion: state.version,
      createdAt: "2026-07-05T12:01:00.000Z",
      purgeAt: 1_780_000_000,
    }),
  };
}

describe("GameStateRepository", () => {
  it.each([
    ["strong", true],
    ["eventual", false],
  ] as const)("%s整合でゲーム状態を取得する", async (consistency, expected) => {
    const client = new FakeDocumentClient();
    const game = createGame();
    client.response = {
      Item: toGameStateItem(game),
    };
    const repository = new GameStateRepository(client, "TestTable");

    const result = await repository.get(game.gameId, consistency);

    expect(result).toEqual(game);
    expect(client.commands).toHaveLength(1);
    const command = client.commands[0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command?.input).toEqual({
      TableName: "TestTable",
      Key: {
        PK: "GAME#game-1",
        SK: "STATE",
      },
      ConsistentRead: expected,
    });
  });

  it("ゲーム状態が存在しない場合はnullを返す", async () => {
    const client = new FakeDocumentClient();
    client.response = {};
    const repository = new GameStateRepository(client, "TestTable");

    await expect(repository.get("game-1", "strong")).resolves.toBeNull();
  });

  it("ゲーム状態・イベント・冪等性記録を同じトランザクションへ入れる", async () => {
    const client = new FakeDocumentClient();
    const repository = new GameStateRepository(client, "TestTable");
    const input = createSaveInput();

    await repository.saveAction(input);

    expect(client.commands).toHaveLength(1);
    const command = client.commands[0] as TransactWriteCommand;
    expect(command).toBeInstanceOf(TransactWriteCommand);
    expect(command?.input.ClientRequestToken).toBe(input.request.requestId);
    expect(command?.input.TransactItems).toHaveLength(3);
    expect(command?.input.TransactItems?.[0]?.Put).toMatchObject({
      TableName: "TestTable",
      ConditionExpression: "#version = :expectedVersion",
      ExpressionAttributeNames: {
        "#version": "version",
      },
      ExpressionAttributeValues: {
        ":expectedVersion": 1,
      },
      Item: {
        PK: "GAME#game-1",
        SK: "STATE",
        entityType: "GAME_STATE",
        version: 2,
      },
    });
    expect(command?.input.TransactItems?.[1]?.Put).toMatchObject({
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      Item: {
        entityType: "GAME_EVENT",
      },
    });
    expect(command?.input.TransactItems?.[2]?.Put).toMatchObject({
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      Item: {
        entityType: "REQUEST",
      },
    });
  });

  it("DynamoDBの条件競合を専用エラーへ変換する", async () => {
    const client = new FakeDocumentClient();
    client.error = {
      name: "TransactionCanceledException",
    };
    const repository = new GameStateRepository(client, "TestTable");

    await expect(repository.saveAction(createSaveInput())).rejects.toThrow(
      DynamoPersistenceConflictError,
    );
  });

  it("イベントのgameId不一致を送信前に拒否する", async () => {
    const client = new FakeDocumentClient();
    const repository = new GameStateRepository(client, "TestTable");
    const input = createSaveInput();

    await expect(
      repository.saveAction({
        ...input,
        event: {
          ...input.event,
          gameId: "other-game",
        },
      }),
    ).rejects.toThrow("イベントのgameIdがゲーム状態と一致しません。");
    expect(client.commands).toHaveLength(0);
  });

  it("ゲーム終了時にルームを閉じて両プレイヤーの所属を削除する", async () => {
    const client = new FakeDocumentClient();
    const repository = new GameStateRepository(client, "TestTable");
    const input = createSaveInput();
    const ended = resignGame({
      state: {
        ...input.state,
        version: 1,
      },
      actor: "OWNER",
      actionAt: "2026-07-05T12:02:00.000Z",
    });

    await repository.saveAction({
      ...input,
      state: ended,
      event: createGameEventItem({
        gameId: ended.gameId,
        eventId: "event-ended",
        seq: 1,
        actorUserId: "owner-user",
        actionType: "GAME_ENDED",
        payload: {
          version: ended.version,
          endReason: "RESIGNATION",
        },
        createdAt: "2026-07-05T12:02:00.000Z",
        purgeAt: 1_783_256_400,
      }),
      request: createRequestItem({
        scope: "GAME",
        scopeId: ended.gameId,
        requestId: "01970000-0000-7000-8000-000000000009",
        requestHash: "sha256:end",
        actorUserId: "owner-user",
        resultStatus: "SUCCEEDED",
        resultVersion: ended.version,
        createdAt: "2026-07-05T12:02:00.000Z",
        purgeAt: 1_780_000_000,
      }),
      completion: {
        room: {
          PK: "ROOM#A2B3C4",
          SK: "META",
          entityType: "ROOM",
          roomId: "A2B3C4",
          status: "CLOSED",
          ownerUserId: "owner-user",
          ownerDisplayName: "Owner",
          guestUserId: "guest-user",
          guestDisplayName: "Guest",
          gameId: ended.gameId,
          version: 3,
          createdAt: "2026-07-05T11:00:00.000Z",
          waitingExpiresAt: "2026-07-06T11:00:00.000Z",
          closedAt: "2026-07-05T12:02:00.000Z",
          closeReason: "GAME_COMPLETED",
        },
        expectedRoomVersion: 2,
        ownerUserId: "owner-user",
        guestUserId: "guest-user",
      },
    });

    const command = client.commands[0] as TransactWriteCommand;
    expect(command.input.TransactItems).toHaveLength(6);
    expect(command.input.TransactItems?.[3]?.Put).toMatchObject({
      ConditionExpression:
        "#version = :expectedVersion AND #status = :inGame AND gameId = :gameId",
      Item: {
        entityType: "ROOM",
        status: "CLOSED",
      },
    });
    expect(
      command.input.TransactItems?.slice(4).map((item) => item.Delete?.Key),
    ).toEqual([
      {
        PK: "USER#owner-user",
        SK: "ACTIVE_CONTEXT",
      },
      {
        PK: "USER#guest-user",
        SK: "ACTIVE_CONTEXT",
      },
    ]);
  });
});
