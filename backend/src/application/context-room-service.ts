import { initializeGame } from "../domain/game/initialize-game";
import type { PlayerId } from "../domain/game/types";
import {
  isJoinAttemptBlocked,
  recordJoinFailure,
} from "../domain/room/join-guard";
import {
  createGameEventItem,
  createRequestItem,
} from "../infrastructure/dynamodb/item-builders";
import type {
  ActiveContextItem,
  GameState,
  JoinGuardItem,
  RequestItem,
  RoomItem,
} from "../infrastructure/dynamodb/items";
import {
  activeContextKey,
  roomKey,
} from "../infrastructure/dynamodb/keys";
import {
  decideIdempotency,
  type IdempotencyDecision,
  type RequestScope,
} from "../infrastructure/dynamodb/request-repository";
import type {
  CreateRoomInput,
  ExpireRoomInput,
  JoinRoomInput,
  LeaveRoomInput,
  StartRoomGameInput,
} from "../infrastructure/dynamodb/room-repository";
import { ApplicationError } from "./errors";

const ROOM_ID_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_ID_LENGTH = 6;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MILLISECONDS = 30 * DAY_MILLISECONDS;

export interface AuthenticatedUser {
  readonly userId: string;
  readonly displayName: string;
}

export interface ContextRoomRepositoryPort {
  getRoom(
    roomId: string,
    consistency: "strong" | "eventual",
  ): Promise<RoomItem | null>;
  getActiveContext(userId: string): Promise<ActiveContextItem | null>;
  getJoinGuard(userId: string): Promise<JoinGuardItem | null>;
  createRoom(input: CreateRoomInput): Promise<void>;
  joinRoom(input: JoinRoomInput): Promise<void>;
  startGame(input: StartRoomGameInput): Promise<void>;
  leaveRoom(input: LeaveRoomInput): Promise<void>;
  expireRoom(input: ExpireRoomInput): Promise<void>;
}

export interface RequestRepositoryPort {
  get(scope: RequestScope, requestId: string): Promise<RequestItem | null>;
}

export interface JoinGuardRepositoryPort {
  saveFailure(
    userId: string,
    next: ReturnType<typeof recordJoinFailure>,
    current: JoinGuardItem | null,
  ): Promise<void>;
}

export interface GameQueryRepositoryPort {
  get(
    gameId: string,
    consistency: "strong" | "eventual",
  ): Promise<GameState | null>;
}

export interface ContextRoomDependencies {
  readonly rooms: ContextRoomRepositoryPort;
  readonly requests: RequestRepositoryPort;
  readonly joinGuards: JoinGuardRepositoryPort;
  readonly games: GameQueryRepositoryPort;
  readonly now: () => Date;
  readonly createId: () => string;
  readonly random: () => number;
}

export type StartMethod = "RANDOM" | "OWNER_FIRST" | "GUEST_FIRST";

function addMilliseconds(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}

function epochSeconds(date: Date, milliseconds: number): number {
  return Math.ceil((date.getTime() + milliseconds) / 1000);
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

function generateRoomId(random: () => number): string {
  return Array.from({ length: ROOM_ID_LENGTH }, () => {
    const index = Math.floor(random() * ROOM_ID_CHARACTERS.length);
    return ROOM_ID_CHARACTERS[
      Math.min(index, ROOM_ID_CHARACTERS.length - 1)
    ];
  }).join("");
}

function playerRole(room: RoomItem, userId: string): PlayerId | null {
  if (room.ownerUserId === userId) {
    return "OWNER";
  }
  if (room.guestUserId === userId) {
    return "GUEST";
  }
  return null;
}

function requestDecision(
  stored: RequestItem | null,
  user: AuthenticatedUser,
  requestHash: string,
): IdempotencyDecision {
  return decideIdempotency(stored, {
    actorUserId: user.userId,
    requestHash,
  });
}

function throwIdempotencyConflict(): never {
  throw new ApplicationError(
    "IDEMPOTENCY_KEY_REUSED",
    "同じ冪等性キーが異なる操作に使用されています。",
    409,
  );
}

export class ContextRoomService {
  constructor(private readonly dependencies: ContextRoomDependencies) {}

  async getContext(user: AuthenticatedUser) {
    const context = await this.dependencies.rooms.getActiveContext(
      user.userId,
    );
    if (context === null) {
      return null;
    }
    const room = await this.dependencies.rooms.getRoom(
      context.roomId,
      "strong",
    );
    if (room === null) {
      return null;
    }
    await this.#expireIfNeeded(room);
    return {
      context,
      room,
    };
  }

  async createRoom(
    user: AuthenticatedUser,
    requestId: string,
    requestHash: string,
  ): Promise<{ room: RoomItem; replay: boolean }> {
    const stored = await this.dependencies.requests.get(
      {
        type: "USER",
        id: user.userId,
      },
      requestId,
    );
    const decision = requestDecision(stored, user, requestHash);
    if (decision.kind === "CONFLICT") {
      throwIdempotencyConflict();
    }
    if (decision.kind === "REPLAY") {
      const roomId = decision.request.resultResourceId;
      const room =
        roomId === undefined
          ? null
          : await this.dependencies.rooms.getRoom(roomId, "strong");
      if (room === null) {
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "保存済みのルーム作成結果を復元できません。",
          500,
        );
      }
      return { room, replay: true };
    }

    if (
      (await this.dependencies.rooms.getActiveContext(user.userId)) !==
      null
    ) {
      throw new ApplicationError(
        "ACTIVE_CONTEXT_EXISTS",
        "すでに待機中または進行中の所属があります。",
        409,
      );
    }

    const now = this.dependencies.now();
    const nowIso = now.toISOString();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomId = generateRoomId(this.dependencies.random);
      const room: RoomItem = {
        ...roomKey(roomId),
        entityType: "ROOM",
        roomId,
        status: "WAITING",
        ownerUserId: user.userId,
        ownerDisplayName: user.displayName,
        version: 1,
        createdAt: nowIso,
        waitingExpiresAt: addMilliseconds(now, DAY_MILLISECONDS),
      };
      const ownerContext: ActiveContextItem = {
        ...activeContextKey(user.userId),
        entityType: "ACTIVE_CONTEXT",
        userId: user.userId,
        roomId,
        role: "OWNER",
        contextStatus: "WAITING",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const request = createRequestItem({
        scope: "USER",
        scopeId: user.userId,
        requestId,
        requestHash,
        actorUserId: user.userId,
        resultStatus: "SUCCEEDED",
        resultVersion: room.version,
        resultResourceId: roomId,
        createdAt: nowIso,
        purgeAt: epochSeconds(now, DAY_MILLISECONDS),
      });

      try {
        await this.dependencies.rooms.createRoom({
          room,
          ownerContext,
          request,
        });
        return { room, replay: false };
      } catch (error) {
        if (
          (await this.dependencies.rooms.getActiveContext(user.userId)) !==
          null
        ) {
          throw new ApplicationError(
            "ACTIVE_CONTEXT_EXISTS",
            "すでに待機中または進行中の所属があります。",
            409,
          );
        }
        if (
          (await this.dependencies.rooms.getRoom(roomId, "strong")) ===
          null
        ) {
          throw error;
        }
      }
    }
    throw new ApplicationError(
      "SERVICE_UNAVAILABLE",
      "ルームIDを確保できませんでした。",
      503,
    );
  }

  async joinRoom(
    user: AuthenticatedUser,
    rawRoomId: string,
    requestId: string,
    requestHash: string,
  ): Promise<{ room: RoomItem; replay: boolean }> {
    const roomId = normalizeRoomId(rawRoomId);
    const guard = await this.dependencies.rooms.getJoinGuard(user.userId);
    const now = this.dependencies.now();
    const nowIso = now.toISOString();
    if (isJoinAttemptBlocked(guard, nowIso)) {
      throw new ApplicationError(
        "JOIN_ATTEMPT_LIMITED",
        "ルームに参加できませんでした。",
        429,
      );
    }
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(roomId)) {
      await this.#recordJoinFailure(user.userId, guard, nowIso);
      throw new ApplicationError(
        "VALIDATION_ERROR",
        "ルームIDの形式が不正です。",
        400,
      );
    }

    const stored = await this.dependencies.requests.get(
      { type: "ROOM", id: roomId },
      requestId,
    );
    const decision = requestDecision(stored, user, requestHash);
    if (decision.kind === "CONFLICT") {
      throwIdempotencyConflict();
    }
    if (decision.kind === "REPLAY") {
      const replayRoom = await this.dependencies.rooms.getRoom(
        roomId,
        "strong",
      );
      if (replayRoom === null) {
        throw new ApplicationError(
          "ROOM_NOT_JOINABLE",
          "ルームに参加できませんでした。",
          404,
        );
      }
      return { room: replayRoom, replay: true };
    }

    if (
      (await this.dependencies.rooms.getActiveContext(user.userId)) !==
      null
    ) {
      throw new ApplicationError(
        "ACTIVE_CONTEXT_EXISTS",
        "すでに待機中または進行中の所属があります。",
        409,
      );
    }

    const room = await this.dependencies.rooms.getRoom(roomId, "strong");
    if (
      room === null ||
      room.status !== "WAITING" ||
      room.ownerUserId === user.userId ||
      Date.parse(room.waitingExpiresAt) <= now.getTime()
    ) {
      await this.#recordJoinFailure(user.userId, guard, nowIso);
      throw new ApplicationError(
        "ROOM_NOT_JOINABLE",
        "ルームに参加できませんでした。",
        404,
      );
    }

    const joinedRoom: RoomItem = {
      ...room,
      status: "READY",
      guestUserId: user.userId,
      guestDisplayName: user.displayName,
      version: room.version + 1,
    };
    const guestContext: ActiveContextItem = {
      ...activeContextKey(user.userId),
      entityType: "ACTIVE_CONTEXT",
      userId: user.userId,
      roomId,
      role: "GUEST",
      contextStatus: "READY",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const request = createRequestItem({
      scope: "ROOM",
      scopeId: roomId,
      requestId,
      requestHash,
      actorUserId: user.userId,
      resultStatus: "SUCCEEDED",
      resultVersion: joinedRoom.version,
      resultResourceId: roomId,
      createdAt: nowIso,
      purgeAt: epochSeconds(now, DAY_MILLISECONDS),
    });
    await this.dependencies.rooms.joinRoom({
      room: joinedRoom,
      expectedVersion: room.version,
      guestContext,
      request,
      guestUserId: user.userId,
    });
    return { room: joinedRoom, replay: false };
  }

  async getRoom(user: AuthenticatedUser, rawRoomId: string) {
    const room = await this.dependencies.rooms.getRoom(
      normalizeRoomId(rawRoomId),
      "eventual",
    );
    if (room === null || playerRole(room, user.userId) === null) {
      throw new ApplicationError(
        "ROOM_NOT_FOUND",
        "ルームが見つかりません。",
        404,
      );
    }
    await this.#expireIfNeeded(room);
    return room;
  }

  async leaveRoom(
    user: AuthenticatedUser,
    rawRoomId: string,
    expectedVersion: number,
    requestId: string,
    requestHash: string,
  ): Promise<{ roomClosed: boolean; replay: boolean }> {
    const roomId = normalizeRoomId(rawRoomId);
    const stored = await this.dependencies.requests.get(
      { type: "ROOM", id: roomId },
      requestId,
    );
    const decision = requestDecision(stored, user, requestHash);
    if (decision.kind === "CONFLICT") {
      throwIdempotencyConflict();
    }
    if (decision.kind === "REPLAY") {
      return {
        roomClosed: decision.request.resultResourceId === "CLOSED",
        replay: true,
      };
    }
    const room = await this.dependencies.rooms.getRoom(roomId, "strong");
    const role = room === null ? null : playerRole(room, user.userId);
    if (room === null || role === null) {
      throw new ApplicationError(
        "ROOM_NOT_FOUND",
        "ルームが見つかりません。",
        404,
      );
    }
    if (room.status === "IN_GAME") {
      throw new ApplicationError(
        "ROOM_ALREADY_STARTED",
        "ゲーム開始後は退出できません。",
        409,
      );
    }
    if (room.version !== expectedVersion) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "ルーム状態が更新されています。",
        409,
      );
    }
    const now = this.dependencies.now();
    const closed = role === "OWNER";
    const nextRoom: RoomItem =
      role === "OWNER"
        ? {
            ...room,
            status: "CLOSED",
            version: room.version + 1,
            closedAt: now.toISOString(),
            closeReason: "OWNER_LEFT",
            purgeAt: epochSeconds(now, 7 * DAY_MILLISECONDS),
          }
        : {
            ...room,
            status: "WAITING",
            version: room.version + 1,
            guestUserId: undefined,
            guestDisplayName: undefined,
          };
    const request = createRequestItem({
      scope: "ROOM",
      scopeId: roomId,
      requestId,
      requestHash,
      actorUserId: user.userId,
      resultStatus: "SUCCEEDED",
      resultVersion: nextRoom.version,
      resultResourceId: closed ? "CLOSED" : "LEFT",
      createdAt: now.toISOString(),
      purgeAt: epochSeconds(now, DAY_MILLISECONDS),
    });
    await this.dependencies.rooms.leaveRoom({
      room: nextRoom,
      expectedVersion,
      actorUserId: user.userId,
      actorRole: role,
      request,
    });
    return { roomClosed: closed, replay: false };
  }

  async startRoom(
    user: AuthenticatedUser,
    rawRoomId: string,
    expectedVersion: number,
    startMethod: StartMethod,
    requestId: string,
    requestHash: string,
  ) {
    const roomId = normalizeRoomId(rawRoomId);
    const stored = await this.dependencies.requests.get(
      { type: "ROOM", id: roomId },
      requestId,
    );
    const decision = requestDecision(stored, user, requestHash);
    if (decision.kind === "CONFLICT") {
      throwIdempotencyConflict();
    }
    if (decision.kind === "REPLAY") {
      const gameId = decision.request.resultResourceId;
      const game =
        gameId === undefined
          ? null
          : await this.dependencies.games.get(gameId, "strong");
      if (game === null) {
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "保存済みのゲーム開始結果を復元できません。",
          500,
        );
      }
      return {
        gameId,
        game,
        replay: true,
      };
    }
    const room = await this.dependencies.rooms.getRoom(roomId, "strong");
    if (room === null || room.ownerUserId !== user.userId) {
      throw new ApplicationError(
        "ROOM_NOT_FOUND",
        "ルームが見つかりません。",
        404,
      );
    }
    if (
      room.status !== "READY" ||
      room.guestUserId === undefined ||
      room.guestDisplayName === undefined
    ) {
      throw new ApplicationError(
        "ROOM_NOT_READY",
        "対戦相手が揃っていません。",
        409,
      );
    }
    if (room.version !== expectedVersion) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "ルーム状態が更新されています。",
        409,
      );
    }
    const [ownerContext, guestContext] = await Promise.all([
      this.dependencies.rooms.getActiveContext(room.ownerUserId),
      this.dependencies.rooms.getActiveContext(room.guestUserId),
    ]);
    if (ownerContext === null || guestContext === null) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "プレイヤーの所属状態を復元できません。",
        500,
      );
    }
    const now = this.dependencies.now();
    const gameId = this.dependencies.createId();
    const startPlayer: PlayerId =
      startMethod === "OWNER_FIRST"
        ? "OWNER"
        : startMethod === "GUEST_FIRST"
          ? "GUEST"
          : this.dependencies.random() < 0.5
            ? "OWNER"
            : "GUEST";
    const initialized = initializeGame({
      gameId,
      roomId,
      players: {
        OWNER: {
          userId: room.ownerUserId,
          displayName: room.ownerDisplayName,
        },
        GUEST: {
          userId: room.guestUserId,
          displayName: room.guestDisplayName,
        },
      },
      startPlayer,
      lastActionAt: now.toISOString(),
      abandonAt: addMilliseconds(now, DAY_MILLISECONDS),
      random: this.dependencies.random,
    });
    const gameState = {
      ...initialized,
      nextEventSeq: 2,
    };
    const nextRoom: RoomItem = {
      ...room,
      status: "IN_GAME",
      gameId,
      version: room.version + 1,
    };
    const toInGameContext = (
      context: ActiveContextItem,
    ): ActiveContextItem => ({
      ...context,
      gameId,
      contextStatus: "IN_GAME",
      updatedAt: now.toISOString(),
    });
    const gameEvent = createGameEventItem({
      gameId,
      eventId: this.dependencies.createId(),
      seq: 1,
      actorUserId: user.userId,
      actionType: "GAME_STARTED",
      payload: {
        version: gameState.version,
      },
      createdAt: now.toISOString(),
      purgeAt: epochSeconds(now, THIRTY_DAYS_MILLISECONDS),
    });
    const request = createRequestItem({
      scope: "ROOM",
      scopeId: roomId,
      requestId,
      requestHash,
      actorUserId: user.userId,
      resultStatus: "SUCCEEDED",
      resultVersion: nextRoom.version,
      resultResourceId: gameId,
      createdAt: now.toISOString(),
      purgeAt: epochSeconds(now, DAY_MILLISECONDS),
    });
    await this.dependencies.rooms.startGame({
      room: nextRoom,
      expectedVersion,
      ownerContext: toInGameContext(ownerContext),
      guestContext: toInGameContext(guestContext),
      gameState,
      gameEvent,
      request,
    });
    return { gameId, game: gameState, replay: false };
  }

  async #recordJoinFailure(
    userId: string,
    current: JoinGuardItem | null,
    now: string,
  ): Promise<void> {
    await this.dependencies.joinGuards.saveFailure(
      userId,
      recordJoinFailure(current, now),
      current,
    );
  }

  async #expireIfNeeded(room: RoomItem): Promise<void> {
    const now = this.dependencies.now();
    if (
      (room.status !== "WAITING" && room.status !== "READY") ||
      Date.parse(room.waitingExpiresAt) > now.getTime()
    ) {
      return;
    }
    await this.dependencies.rooms.expireRoom({
      room: {
        ...room,
        status: "EXPIRED",
        version: room.version + 1,
        closedAt: now.toISOString(),
        closeReason: "EXPIRED",
        purgeAt: epochSeconds(now, 7 * DAY_MILLISECONDS),
      },
      expectedVersion: room.version,
    });
    throw new ApplicationError(
      "ROOM_EXPIRED",
      "ルームの待機期限が切れています。",
      410,
    );
  }
}
