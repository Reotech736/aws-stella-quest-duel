import { createHash } from "node:crypto";

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { v7 as uuidv7 } from "uuid";
import { z, ZodError } from "zod";

import {
  ContextRoomService,
  type AuthenticatedUser,
} from "../application/context-room-service";
import { ApplicationError } from "../application/errors";
import { createDocumentClient } from "../infrastructure/dynamodb/client";
import { GameStateRepository } from "../infrastructure/dynamodb/game-state-repository";
import {
  JoinGuardPersistenceConflictError,
  JoinGuardRepository,
} from "../infrastructure/dynamodb/join-guard-repository";
import type { RoomItem } from "../infrastructure/dynamodb/items";
import { RequestRepository } from "../infrastructure/dynamodb/request-repository";
import {
  RoomPersistenceConflictError,
  RoomRepository,
} from "../infrastructure/dynamodb/room-repository";
import { createGameView } from "../presentation/game-view";
import { jsonResponse } from "../shared/http-response";

const joinSchema = z.object({
  roomId: z.string().trim().toUpperCase().min(1).max(64),
});
const leaveSchema = z.object({
  expectedVersion: z.number().int().positive(),
});
const startSchema = z.object({
  expectedVersion: z.number().int().positive(),
  startMethod: z.enum(["RANDOM", "OWNER_FIRST", "GUEST_FIRST"]),
});

type ContextRoomEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
type ContextRoomHandler = (
  event: ContextRoomEvent,
) => Promise<APIGatewayProxyStructuredResultV2>;

function parseBody(event: ContextRoomEvent): unknown {
  if (event.body === undefined || event.body === "") {
    return {};
  }
  return JSON.parse(event.body);
}

function authenticatedUser(event: ContextRoomEvent): AuthenticatedUser {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = claims.sub;
  const displayName =
    claims.username ?? claims["cognito:username"];
  if (typeof userId !== "string" || typeof displayName !== "string") {
    throw new ApplicationError(
      "UNAUTHORIZED",
      "認証ユーザーを特定できません。",
      401,
    );
  }
  return { userId, displayName };
}

function idempotencyKey(event: ContextRoomEvent): string {
  const key = event.headers["idempotency-key"];
  if (
    key === undefined ||
    key.length < 1 ||
    key.length > 36
  ) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Idempotency-Keyが不正です。",
      400,
    );
  }
  return key;
}

function requestHash(routeKey: string, value: unknown): string {
  return createHash("sha256")
    .update(`${routeKey}\n${JSON.stringify(value)}`)
    .digest("hex");
}

function roomView(room: RoomItem, userId: string) {
  return {
    roomId: room.roomId,
    status: room.status,
    version: room.version,
    viewerRole: room.ownerUserId === userId ? "OWNER" : "GUEST",
    owner: {
      displayName: room.ownerDisplayName,
    },
    guest:
      room.guestDisplayName === undefined
        ? null
        : {
            displayName: room.guestDisplayName,
          },
    gameId: room.gameId ?? null,
    createdAt: room.createdAt,
    waitingExpiresAt: room.waitingExpiresAt,
  };
}

function success(
  event: ContextRoomEvent,
  statusCode: number,
  data: unknown,
  replay?: boolean,
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(statusCode, {
    data,
    meta: {
      traceId: event.requestContext.requestId,
      serverTime: new Date().toISOString(),
      ...(replay === undefined
        ? {}
        : {
            idempotentReplay: replay,
          }),
    },
  });
}

function errorResponse(
  event: ContextRoomEvent,
  error: unknown,
): APIGatewayProxyStructuredResultV2 {
  const applicationError =
    error instanceof ApplicationError
      ? error
      : error instanceof RoomPersistenceConflictError
        ? new ApplicationError(
            "VERSION_CONFLICT",
            "ルーム状態が更新されています。",
            409,
          )
        : error instanceof JoinGuardPersistenceConflictError
          ? new ApplicationError(
              "SERVICE_UNAVAILABLE",
              "参加試行状態が更新されました。再度お試しください。",
              503,
            )
      : error instanceof ZodError ||
          error instanceof SyntaxError
        ? new ApplicationError(
            "VALIDATION_ERROR",
            "リクエスト内容が不正です。",
            400,
          )
          : new ApplicationError(
            "INTERNAL_ERROR",
            "サーバー内部でエラーが発生しました。",
            500,
          );
  return jsonResponse(applicationError.statusCode, {
    error: {
      code: applicationError.code,
      message: applicationError.message,
    },
    meta: {
      traceId: event.requestContext.requestId,
      serverTime: new Date().toISOString(),
    },
  });
}

export function createContextRoomHandler(
  service: ContextRoomService,
): ContextRoomHandler {
  return async (event) => {
    try {
      const user = authenticatedUser(event);
      const routeKey = event.routeKey;
      const roomId = event.pathParameters?.roomId;

      if (routeKey === "GET /v1/me/context") {
        const result = await service.getContext(user);
        return success(event, 200, {
          context:
            result === null
              ? null
              : {
                  status: result.context.contextStatus,
                  role: result.context.role,
                  roomId: result.context.roomId,
                  gameId: result.context.gameId ?? null,
                },
        });
      }
      if (routeKey === "POST /v1/rooms") {
        const body = z.object({}).parse(parseBody(event));
        const key = idempotencyKey(event);
        const result = await service.createRoom(
          user,
          key,
          requestHash(routeKey, body),
        );
        return success(
          event,
          201,
          { room: roomView(result.room, user.userId) },
          result.replay,
        );
      }
      if (routeKey === "POST /v1/rooms/join") {
        const body = joinSchema.parse(parseBody(event));
        const key = idempotencyKey(event);
        const result = await service.joinRoom(
          user,
          body.roomId,
          key,
          requestHash(routeKey, body),
        );
        return success(
          event,
          200,
          { room: roomView(result.room, user.userId) },
          result.replay,
        );
      }
      if (routeKey === "GET /v1/rooms/{roomId}" && roomId) {
        const room = await service.getRoom(user, roomId);
        return success(event, 200, {
          room: roomView(room, user.userId),
        });
      }
      if (routeKey === "POST /v1/rooms/{roomId}/leave" && roomId) {
        const body = leaveSchema.parse(parseBody(event));
        const key = idempotencyKey(event);
        const result = await service.leaveRoom(
          user,
          roomId,
          body.expectedVersion,
          key,
          requestHash(routeKey, body),
        );
        return success(
          event,
          200,
          {
            left: true,
            roomClosed: result.roomClosed,
          },
          result.replay,
        );
      }
      if (routeKey === "POST /v1/rooms/{roomId}/start" && roomId) {
        const body = startSchema.parse(parseBody(event));
        const key = idempotencyKey(event);
        const result = await service.startRoom(
          user,
          roomId,
          body.expectedVersion,
          body.startMethod,
          key,
          requestHash(routeKey, body),
        );
        return success(
          event,
          201,
          {
            room: {
              roomId,
              status: "IN_GAME",
              version: body.expectedVersion + 1,
              gameId: result.gameId,
            },
            game: createGameView(result.game, "OWNER"),
          },
          result.replay,
        );
      }
      throw new ApplicationError(
        "NOT_FOUND",
        "APIルートが見つかりません。",
        404,
      );
    } catch (error) {
      return errorResponse(event, error);
    }
  };
}

let service: ContextRoomService | undefined;

function runtimeService(): ContextRoomService {
  if (service !== undefined) {
    return service;
  }
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAMEが設定されていません。");
  }
  const client = createDocumentClient();
  service = new ContextRoomService({
    rooms: new RoomRepository(client, tableName),
    requests: new RequestRepository(client, tableName),
    joinGuards: new JoinGuardRepository(client, tableName),
    games: new GameStateRepository(client, tableName),
    now: () => new Date(),
    createId: uuidv7,
    random: Math.random,
  });
  return service;
}

export const handler: ContextRoomHandler = async (event) => {
  try {
    return await createContextRoomHandler(runtimeService())(event);
  } catch (error) {
    return errorResponse(event, error);
  }
};
