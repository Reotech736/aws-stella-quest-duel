import { describe, expect, it } from "vitest";

import {
  activeContextKey,
  gameEventKey,
  gameRequestKey,
  gameStateKey,
  joinGuardKey,
  roomKey,
  roomRequestKey,
  userRequestKey,
} from "../../../src/infrastructure/dynamodb/keys";

describe("DynamoDB keys", () => {
  it("ルームキーを生成する", () => {
    expect(roomKey("A2B3C4")).toEqual({
      PK: "ROOM#A2B3C4",
      SK: "META",
    });
  });

  it("ユーザー単位のキーを生成する", () => {
    expect(activeContextKey("user-1")).toEqual({
      PK: "USER#user-1",
      SK: "ACTIVE_CONTEXT",
    });
    expect(joinGuardKey("user-1")).toEqual({
      PK: "USER#user-1",
      SK: "JOIN_GUARD",
    });
  });

  it("ゲーム状態キーを生成する", () => {
    expect(gameStateKey("game-1")).toEqual({
      PK: "GAME#game-1",
      SK: "STATE",
    });
  });

  it("イベント連番をゼロ埋めして文字列順を時系列順にする", () => {
    const second = gameEventKey("game-1", 2, "event-2");
    const tenth = gameEventKey("game-1", 10, "event-10");

    expect(second).toEqual({
      PK: "GAME#game-1",
      SK: "EVENT#000000000002#event-2",
    });
    expect(second.SK < tenth.SK).toBe(true);
  });

  it("不正なイベント連番を拒否する", () => {
    expect(() => gameEventKey("game-1", 0, "event-1")).toThrow(RangeError);
    expect(() => gameEventKey("game-1", 1.5, "event-1")).toThrow(RangeError);
  });

  it("スコープごとの冪等性キーを生成する", () => {
    expect(userRequestKey("user-1", "request-1")).toEqual({
      PK: "USER#user-1",
      SK: "REQUEST#request-1",
    });
    expect(roomRequestKey("A2B3C4", "request-1")).toEqual({
      PK: "ROOM#A2B3C4",
      SK: "REQUEST#request-1",
    });
    expect(gameRequestKey("game-1", "request-1")).toEqual({
      PK: "GAME#game-1",
      SK: "REQUEST#request-1",
    });
  });

  it("空の識別子を拒否する", () => {
    expect(() => roomKey(" ")).toThrow("roomIdは空文字にできません。");
    expect(() => activeContextKey("")).toThrow(
      "userIdは空文字にできません。",
    );
  });
});
