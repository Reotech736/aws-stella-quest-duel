import { describe, expect, it } from "vitest";

import {
  ContextRoomService,
  type ContextRoomRepositoryPort,
  type JoinGuardRepositoryPort,
  type RequestRepositoryPort,
} from "../../src/application/context-room-service";
import type { JoinGuardState } from "../../src/domain/room/join-guard";
import type {
  ActiveContextItem,
  JoinGuardItem,
  RequestItem,
  RoomItem,
} from "../../src/infrastructure/dynamodb/items";
import type { RequestScope } from "../../src/infrastructure/dynamodb/request-repository";
import type {
  CreateRoomInput,
  ExpireRoomInput,
  JoinRoomInput,
  LeaveRoomInput,
  StartRoomGameInput,
} from "../../src/infrastructure/dynamodb/room-repository";

function requestMapKey(scope: RequestScope, requestId: string): string {
  return `${scope.type}#${scope.id}#${requestId}`;
}

class MemoryContextRoomStore
  implements
    ContextRoomRepositoryPort,
    RequestRepositoryPort,
    JoinGuardRepositoryPort
{
  readonly rooms = new Map<string, RoomItem>();
  readonly contexts = new Map<string, ActiveContextItem>();
  readonly guards = new Map<string, JoinGuardItem>();
  readonly requests = new Map<string, RequestItem>();
  readonly games = new Map<string, StartRoomGameInput["gameState"]>();
  startedGame: StartRoomGameInput | null = null;

  async getRoom(roomId: string): Promise<RoomItem | null> {
    return this.rooms.get(roomId) ?? null;
  }

  async getActiveContext(
    userId: string,
  ): Promise<ActiveContextItem | null> {
    return this.contexts.get(userId) ?? null;
  }

  async getJoinGuard(userId: string): Promise<JoinGuardItem | null> {
    return this.guards.get(userId) ?? null;
  }

  async get(
    scope: RequestScope,
    requestId: string,
  ): Promise<RequestItem | null> {
    return this.requests.get(requestMapKey(scope, requestId)) ?? null;
  }

  async createRoom(input: CreateRoomInput): Promise<void> {
    this.rooms.set(input.room.roomId, input.room);
    this.contexts.set(input.ownerContext.userId, input.ownerContext);
    this.saveRequest(input.request);
  }

  async joinRoom(input: JoinRoomInput): Promise<void> {
    this.rooms.set(input.room.roomId, input.room);
    this.contexts.set(input.guestContext.userId, input.guestContext);
    this.guards.delete(input.guestUserId);
    this.saveRequest(input.request);
  }

  async startGame(input: StartRoomGameInput): Promise<void> {
    this.rooms.set(input.room.roomId, input.room);
    this.contexts.set(input.ownerContext.userId, input.ownerContext);
    this.contexts.set(input.guestContext.userId, input.guestContext);
    this.saveRequest(input.request);
    this.games.set(input.gameState.gameId, input.gameState);
    this.startedGame = input;
  }

  async leaveRoom(input: LeaveRoomInput): Promise<void> {
    this.rooms.set(input.room.roomId, input.room);
    this.contexts.delete(input.actorUserId);
    if (input.actorRole === "OWNER" && input.room.guestUserId) {
      this.contexts.delete(input.room.guestUserId);
    }
    this.saveRequest(input.request);
  }

  async expireRoom(input: ExpireRoomInput): Promise<void> {
    this.rooms.set(input.room.roomId, input.room);
    this.contexts.delete(input.room.ownerUserId);
    if (input.room.guestUserId) {
      this.contexts.delete(input.room.guestUserId);
    }
  }

  async saveFailure(
    userId: string,
    next: JoinGuardState,
  ): Promise<void> {
    this.guards.set(userId, {
      PK: `USER#${userId}`,
      SK: "JOIN_GUARD",
      entityType: "JOIN_GUARD",
      ...next,
    });
  }

  private saveRequest(request: RequestItem): void {
    const partitionId = request.PK.slice(request.PK.indexOf("#") + 1);
    this.requests.set(
      requestMapKey(
        {
          type: request.scope,
          id: partitionId,
        },
        request.requestId,
      ),
      request,
    );
  }
}

function createService(store: MemoryContextRoomStore) {
  let idSequence = 0;
  return new ContextRoomService({
    rooms: store,
    requests: store,
    joinGuards: store,
    games: {
      get: async (gameId) => store.games.get(gameId) ?? null,
    },
    now: () => new Date("2026-07-05T12:00:00.000Z"),
    createId: () => `generated-${++idSequence}`,
    random: () => 0,
  });
}

const owner = {
  userId: "owner-user",
  displayName: "Owner",
};
const guest = {
  userId: "guest-user",
  displayName: "Guest",
};

describe("ContextRoomService", () => {
  it("作成・参加・開始を通してゲームと所属状態を作る", async () => {
    const store = new MemoryContextRoomStore();
    const service = createService(store);

    const created = await service.createRoom(
      owner,
      "request-create",
      "hash:create",
    );
    expect(created.room).toMatchObject({
      roomId: "AAAAAA",
      status: "WAITING",
      ownerDisplayName: "Owner",
    });

    const joined = await service.joinRoom(
      guest,
      created.room.roomId,
      "request-join",
      "hash:join",
    );
    expect(joined.room).toMatchObject({
      status: "READY",
      guestDisplayName: "Guest",
      version: 2,
    });

    const started = await service.startRoom(
      owner,
      created.room.roomId,
      2,
      "OWNER_FIRST",
      "request-start",
      "hash:start",
    );
    expect(started).toMatchObject({
      gameId: "generated-1",
      replay: false,
    });
    expect(store.startedGame?.gameState).toMatchObject({
      gameId: "generated-1",
      currentActor: "OWNER",
      nextEventSeq: 2,
    });
    expect(store.contexts.get(owner.userId)).toMatchObject({
      contextStatus: "IN_GAME",
      gameId: "generated-1",
    });
    expect(store.contexts.get(guest.userId)).toMatchObject({
      contextStatus: "IN_GAME",
      gameId: "generated-1",
    });
  });

  it("同じルーム作成リクエストを再送して既存ルームを返す", async () => {
    const store = new MemoryContextRoomStore();
    const service = createService(store);

    const first = await service.createRoom(
      owner,
      "request-create",
      "hash:create",
    );
    const replay = await service.createRoom(
      owner,
      "request-create",
      "hash:create",
    );

    expect(replay).toEqual({
      room: first.room,
      replay: true,
    });
    expect(store.rooms).toHaveLength(1);
  });

  it("参加できないルームへの試行をJoin Guardへ記録する", async () => {
    const store = new MemoryContextRoomStore();
    const service = createService(store);

    await expect(
      service.joinRoom(
        guest,
        "ZZZZZZ",
        "request-join",
        "hash:join",
      ),
    ).rejects.toMatchObject({
      code: "ROOM_NOT_JOINABLE",
      statusCode: 404,
    });
    expect(store.guards.get(guest.userId)).toMatchObject({
      failedCount: 1,
      windowStartedAt: "2026-07-05T12:00:00.000Z",
    });
  });

  it("異なる内容で冪等性キーを再利用すると拒否する", async () => {
    const store = new MemoryContextRoomStore();
    const service = createService(store);
    await service.createRoom(owner, "request-create", "hash:first");

    await expect(
      service.createRoom(owner, "request-create", "hash:other"),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409,
    });
  });
});
