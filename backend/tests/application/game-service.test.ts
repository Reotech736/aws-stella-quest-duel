import { describe, expect, it } from "vitest";

import { GameService } from "../../src/application/game-service";
import { initializeGame } from "../../src/domain/game/initialize-game";
import type { GameState } from "../../src/domain/game/types";
import type { SaveGameActionInput } from "../../src/infrastructure/dynamodb/game-state-repository";
import type {
  RequestItem,
  RoomItem,
} from "../../src/infrastructure/dynamodb/items";
import type { RequestScope } from "../../src/infrastructure/dynamodb/request-repository";

class MemoryGameStore {
  state: GameState;
  room: RoomItem;
  readonly requests = new Map<string, RequestItem>();
  readonly writes: SaveGameActionInput[] = [];

  constructor() {
    this.state = initializeGame({
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
    this.state = {
      ...this.state,
      nextEventSeq: 2,
    };
    this.room = {
      PK: "ROOM#A2B3C4",
      SK: "META",
      entityType: "ROOM",
      roomId: "A2B3C4",
      status: "IN_GAME",
      ownerUserId: "owner-user",
      ownerDisplayName: "Owner",
      guestUserId: "guest-user",
      guestDisplayName: "Guest",
      gameId: "game-1",
      version: 3,
      createdAt: "2026-07-05T11:00:00.000Z",
      waitingExpiresAt: "2026-07-06T11:00:00.000Z",
    };
  }

  async getGame(): Promise<GameState> {
    return this.state;
  }

  async saveAction(input: SaveGameActionInput): Promise<void> {
    this.state = input.state;
    this.writes.push(input);
    if (input.request) {
      this.requests.set(input.request.requestId, input.request);
    }
    if (input.completion) {
      this.room = input.completion.room;
    }
  }

  async getRoom(): Promise<RoomItem> {
    return this.room;
  }

  async getRequest(
    _scope: RequestScope,
    requestId: string,
  ): Promise<RequestItem | null> {
    return this.requests.get(requestId) ?? null;
  }
}

function service(store: MemoryGameStore, now = "2026-07-05T12:01:00.000Z") {
  let id = 0;
  return new GameService({
    games: {
      get: () => store.getGame(),
      saveAction: (input) => store.saveAction(input),
    },
    rooms: {
      getRoom: () => store.getRoom(),
    },
    requests: {
      get: (scope, requestId) => store.getRequest(scope, requestId),
    },
    now: () => new Date(now),
    createId: () => `event-${++id}`,
    random: () => 0,
  });
}

const owner = {
  userId: "owner-user",
  displayName: "Owner",
};

describe("GameService", () => {
  it("ゲームコマンドを適用してイベント・冪等性記録と保存する", async () => {
    const store = new MemoryGameStore();
    const gameService = service(store);

    const result = await gameService.executeCommand(
      owner,
      "game-1",
      1,
      { type: "DRAW_CARDS" },
      "request-1",
      "hash:draw",
    );

    expect(result.state).toMatchObject({
      version: 2,
      nextEventSeq: 3,
    });
    expect(result.state.hands.OWNER).toHaveLength(8);
    expect(store.writes[0]?.event).toMatchObject({
      seq: 2,
      actionType: "DRAW_CARDS",
      payload: {
        version: 2,
        drawCount: 3,
      },
    });
    expect(store.writes[0]?.request?.requestHash).toBe("hash:draw");
  });

  it("同じコマンドの再送では状態を二重更新しない", async () => {
    const store = new MemoryGameStore();
    const gameService = service(store);
    await gameService.executeCommand(
      owner,
      "game-1",
      1,
      { type: "DRAW_CARDS" },
      "request-1",
      "hash:draw",
    );

    const replay = await gameService.executeCommand(
      owner,
      "game-1",
      1,
      { type: "DRAW_CARDS" },
      "request-1",
      "hash:draw",
    );

    expect(replay.replay).toBe(true);
    expect(store.writes).toHaveLength(1);
  });

  it("投了時にゲームとルームを終了して所属削除情報を渡す", async () => {
    const store = new MemoryGameStore();
    const gameService = service(store);

    const result = await gameService.resign(
      owner,
      "game-1",
      1,
      "request-resign",
      "hash:resign",
    );

    expect(result.state).toMatchObject({
      status: "COMPLETED",
      result: {
        endReason: "RESIGNATION",
        winner: "GUEST",
        loser: "OWNER",
      },
    });
    expect(store.writes[0]?.completion).toMatchObject({
      room: {
        status: "CLOSED",
        closeReason: "GAME_COMPLETED",
      },
      ownerUserId: "owner-user",
      guestUserId: "guest-user",
    });
  });

  it("期限超過したゲーム取得時に放棄終了を保存する", async () => {
    const store = new MemoryGameStore();
    const gameService = service(store, "2026-07-06T12:00:00.000Z");

    const result = await gameService.getGame(owner, "game-1");

    expect(result.state.status).toBe("ABANDONED");
    expect(store.writes[0]?.request).toBeUndefined();
    expect(store.writes[0]?.event.actionType).toBe("GAME_ABANDONED");
  });
});
