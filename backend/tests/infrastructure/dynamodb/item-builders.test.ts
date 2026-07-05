import { describe, expect, it } from "vitest";

import {
  createGameEventItem,
  createRequestItem,
} from "../../../src/infrastructure/dynamodb/item-builders";

describe("item builders", () => {
  it("ゲームイベントアイテムを生成する", () => {
    const item = createGameEventItem({
      gameId: "game-1",
      eventId: "event-1",
      seq: 2,
      actorUserId: "user-1",
      actionType: "DRAW_CARDS",
      payload: {
        version: 3,
        drawCount: 2,
      },
      createdAt: "2026-07-05T12:00:00.000Z",
      purgeAt: 1_783_256_400,
    });

    expect(item).toEqual({
      PK: "GAME#game-1",
      SK: "EVENT#000000000002#event-1",
      entityType: "GAME_EVENT",
      gameId: "game-1",
      eventId: "event-1",
      seq: 2,
      actorUserId: "user-1",
      actionType: "DRAW_CARDS",
      payload: {
        version: 3,
        drawCount: 2,
      },
      createdAt: "2026-07-05T12:00:00.000Z",
      purgeAt: 1_783_256_400,
    });
  });

  it("ゲームスコープの冪等性アイテムを生成する", () => {
    const item = createRequestItem({
      scope: "GAME",
      scopeId: "game-1",
      requestId: "01970000-0000-7000-8000-000000000001",
      requestHash: "sha256:example",
      actorUserId: "user-1",
      resultStatus: "SUCCEEDED",
      resultVersion: 3,
      createdAt: "2026-07-05T12:00:00.000Z",
      purgeAt: 1_780_000_000,
    });

    expect(item.PK).toBe("GAME#game-1");
    expect(item.SK).toBe(
      "REQUEST#01970000-0000-7000-8000-000000000001",
    );
    expect(item.resultVersion).toBe(3);
  });

  it("resultVersion未設定時は属性自体を省略する", () => {
    const item = createRequestItem({
      scope: "USER",
      scopeId: "user-1",
      requestId: "request-1",
      requestHash: "sha256:example",
      actorUserId: "user-1",
      resultStatus: "FAILED",
      createdAt: "2026-07-05T12:00:00.000Z",
      purgeAt: 1_780_000_000,
    });

    expect("resultVersion" in item).toBe(false);
  });

  it("不正なTTLと長すぎるrequestIdを拒否する", () => {
    expect(() =>
      createGameEventItem({
        gameId: "game-1",
        eventId: "event-1",
        seq: 1,
        actorUserId: "SYSTEM",
        actionType: "GAME_STARTED",
        payload: {
          version: 1,
        },
        createdAt: "2026-07-05T12:00:00.000Z",
        purgeAt: -1,
      }),
    ).toThrow(RangeError);

    expect(() =>
      createRequestItem({
        scope: "GAME",
        scopeId: "game-1",
        requestId: "x".repeat(37),
        requestHash: "sha256:example",
        actorUserId: "user-1",
        resultStatus: "SUCCEEDED",
        createdAt: "2026-07-05T12:00:00.000Z",
        purgeAt: 1_780_000_000,
      }),
    ).toThrow(RangeError);
  });
});
