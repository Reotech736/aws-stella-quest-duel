import { createHash } from "node:crypto";

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { v7 as uuidv7 } from "uuid";
import { z, ZodError } from "zod";

import type { AuthenticatedUser } from "../application/context-room-service";
import { ApplicationError } from "../application/errors";
import {
  GameService,
  type GameCommand,
} from "../application/game-service";
import type { CardId } from "../domain/game/card";
import { createDocumentClient } from "../infrastructure/dynamodb/client";
import {
  DynamoPersistenceConflictError,
  GameStateRepository,
} from "../infrastructure/dynamodb/game-state-repository";
import { RequestRepository } from "../infrastructure/dynamodb/request-repository";
import { RoomRepository } from "../infrastructure/dynamodb/room-repository";
import { createGameView } from "../presentation/game-view";
import { jsonResponse } from "../shared/http-response";

const cardId = z
  .string()
  .regex(/^(?:[RYBG][1-6][ab]|X[1-6])$/)
  .transform((value) => value as CardId);
const commandSchema = z.object({
  expectedVersion: z.number().int().positive(),
  command: z.discriminatedUnion("type", [
    z.object({ type: z.literal("DRAW_CARDS") }),
    z.object({ type: z.literal("PLAY_CARD"), cardId }),
    z.object({ type: z.literal("END_TURN") }),
    z.object({ type: z.literal("SELECT_COLLECTION"), cardId }),
    z.object({ type: z.literal("SELECT_DISCARD_TOP"), cardId }),
  ]),
});
const resignSchema = z.object({
  expectedVersion: z.number().int().positive(),
  confirmed: z.literal(true),
});

type GameEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
type GameCommandHandler = (
  event: GameEvent,
) => Promise<APIGatewayProxyStructuredResultV2>;

function userFrom(event: GameEvent): AuthenticatedUser {
  const claims = event.requestContext.authorizer.jwt.claims;
  if (typeof claims.sub !== "string") {
    throw new ApplicationError("UNAUTHORIZED", "認証が必要です。", 401);
  }
  return {
    userId: claims.sub,
    displayName: String(
      claims.username ?? claims["cognito:username"] ?? "",
    ),
  };
}

function parseBody(event: GameEvent): unknown {
  return JSON.parse(event.body ?? "{}");
}

function keyFrom(event: GameEvent): string {
  const key = event.headers["idempotency-key"];
  if (!key || key.length > 36) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Idempotency-Keyが不正です。",
      400,
    );
  }
  return key;
}

function hash(routeKey: string, body: unknown): string {
  return createHash("sha256")
    .update(`${routeKey}\n${JSON.stringify(body)}`)
    .digest("hex");
}

function response(
  event: GameEvent,
  game: ReturnType<typeof createGameView>,
  replay: boolean,
  acceptedCommand?: string,
) {
  return jsonResponse(200, {
    data: {
      ...(acceptedCommand ? { acceptedCommand } : {}),
      game,
    },
    meta: {
      traceId: event.requestContext.requestId,
      serverTime: new Date().toISOString(),
      idempotentReplay: replay,
    },
  });
}

export function createGameCommandHandler(
  service: GameService,
): GameCommandHandler {
  return async (event) => {
    try {
      const gameId = event.pathParameters?.gameId;
      if (!gameId) {
        throw new ApplicationError(
          "NOT_FOUND",
          "ゲームが見つかりません。",
          404,
        );
      }
      const user = userFrom(event);
      const requestId = keyFrom(event);
      if (event.routeKey === "POST /v1/games/{gameId}/commands") {
        const body = commandSchema.parse(parseBody(event));
        const result = await service.executeCommand(
          user,
          gameId,
          body.expectedVersion,
          body.command as GameCommand,
          requestId,
          hash(event.routeKey, body),
        );
        return response(
          event,
          createGameView(result.state, result.viewer),
          result.replay,
          body.command.type,
        );
      }
      if (event.routeKey === "POST /v1/games/{gameId}/resign") {
        const body = resignSchema.parse(parseBody(event));
        const result = await service.resign(
          user,
          gameId,
          body.expectedVersion,
          requestId,
          hash(event.routeKey, body),
        );
        return response(
          event,
          createGameView(result.state, result.viewer),
          result.replay,
        );
      }
      throw new ApplicationError(
        "NOT_FOUND",
        "APIルートが見つかりません。",
        404,
      );
    } catch (error) {
      const known =
        error instanceof ApplicationError
          ? error
          : error instanceof DynamoPersistenceConflictError
            ? new ApplicationError(
                "VERSION_CONFLICT",
                "ゲーム状態が更新されています。",
                409,
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
      if (known.code === "INTERNAL_ERROR") {
        const unexpectedError =
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : {
                name: typeof error,
                message: String(error),
              };
        console.error("Unexpected game-command error", {
          traceId: event.requestContext.requestId,
          routeKey: event.routeKey,
          error: unexpectedError,
        });
      }
      return jsonResponse(known.statusCode, {
        error: {
          code: known.code,
          message: known.message,
        },
        meta: {
          traceId: event.requestContext.requestId,
          serverTime: new Date().toISOString(),
        },
      });
    }
  };
}

let service: GameService | undefined;

function runtimeService(): GameService {
  if (service) {
    return service;
  }
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAMEが設定されていません。");
  }
  const client = createDocumentClient();
  service = new GameService({
    games: new GameStateRepository(client, tableName),
    rooms: new RoomRepository(client, tableName),
    requests: new RequestRepository(client, tableName),
    now: () => new Date(),
    createId: uuidv7,
    random: Math.random,
  });
  return service;
}

export const handler: GameCommandHandler = async (event) =>
  createGameCommandHandler(runtimeService())(event);
