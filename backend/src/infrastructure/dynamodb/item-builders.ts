import type {
  GameEventActionType,
  GameEventItem,
  GameEventPayload,
  RequestItem,
} from "./items";
import {
  gameEventKey,
  gameRequestKey,
  roomRequestKey,
  userRequestKey,
} from "./keys";

function assertEpochSeconds(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label}は0以上のUnix epoch秒にしてください。`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label}は空文字にできません。`);
  }
}

export interface CreateGameEventItemInput {
  readonly gameId: string;
  readonly eventId: string;
  readonly seq: number;
  readonly actorUserId: string | "SYSTEM";
  readonly actionType: GameEventActionType;
  readonly payload: GameEventPayload;
  readonly createdAt: string;
  readonly purgeAt: number;
}

export function createGameEventItem(
  input: CreateGameEventItemInput,
): GameEventItem {
  assertNonEmpty(input.actorUserId, "actorUserId");
  assertEpochSeconds(input.purgeAt, "purgeAt");

  return {
    ...gameEventKey(input.gameId, input.seq, input.eventId),
    entityType: "GAME_EVENT",
    gameId: input.gameId,
    eventId: input.eventId,
    seq: input.seq,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    payload: input.payload,
    createdAt: input.createdAt,
    purgeAt: input.purgeAt,
  };
}

export interface CreateRequestItemInput {
  readonly scope: "USER" | "ROOM" | "GAME";
  readonly scopeId: string;
  readonly requestId: string;
  readonly requestHash: string;
  readonly actorUserId: string;
  readonly resultStatus: "SUCCEEDED" | "FAILED";
  readonly resultVersion?: number;
  readonly createdAt: string;
  readonly purgeAt: number;
}

function requestKeyFor(input: CreateRequestItemInput) {
  switch (input.scope) {
    case "USER":
      return userRequestKey(input.scopeId, input.requestId);
    case "ROOM":
      return roomRequestKey(input.scopeId, input.requestId);
    case "GAME":
      return gameRequestKey(input.scopeId, input.requestId);
  }
}

export function createRequestItem(
  input: CreateRequestItemInput,
): RequestItem {
  assertNonEmpty(input.requestHash, "requestHash");
  assertNonEmpty(input.actorUserId, "actorUserId");
  assertEpochSeconds(input.purgeAt, "purgeAt");

  if (input.requestId.length > 36) {
    throw new RangeError("requestIdは36文字以下にしてください。");
  }

  return {
    ...requestKeyFor(input),
    entityType: "REQUEST",
    requestId: input.requestId,
    requestHash: input.requestHash,
    actorUserId: input.actorUserId,
    scope: input.scope,
    resultStatus: input.resultStatus,
    ...(input.resultVersion === undefined
      ? {}
      : {
          resultVersion: input.resultVersion,
        }),
    createdAt: input.createdAt,
    purgeAt: input.purgeAt,
  };
}
