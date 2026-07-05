import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { v7 as uuidv7 } from "uuid";

import type { AuthenticatedUser } from "../application/context-room-service";
import { ApplicationError } from "../application/errors";
import { GameService } from "../application/game-service";
import { createDocumentClient } from "../infrastructure/dynamodb/client";
import { GameStateRepository } from "../infrastructure/dynamodb/game-state-repository";
import { RequestRepository } from "../infrastructure/dynamodb/request-repository";
import { RoomRepository } from "../infrastructure/dynamodb/room-repository";
import { createGameView } from "../presentation/game-view";
import { jsonResponse } from "../shared/http-response";

type GameEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
type GameQueryHandler = (
  event: GameEvent,
) => Promise<APIGatewayProxyStructuredResultV2>;

function userFrom(event: GameEvent): AuthenticatedUser {
  const claims = event.requestContext.authorizer.jwt.claims;
  if (typeof claims.sub !== "string") {
    throw new ApplicationError("UNAUTHORIZED", "認証が必要です。", 401);
  }
  return {
    userId: claims.sub,
    displayName:
      typeof claims.username === "string"
        ? claims.username
        : String(claims["cognito:username"] ?? ""),
  };
}

export function createGameQueryHandler(
  service: GameService,
): GameQueryHandler {
  return async (event) => {
    try {
      const gameId = event.pathParameters?.gameId;
      if (event.routeKey !== "GET /v1/games/{gameId}" || !gameId) {
        throw new ApplicationError(
          "NOT_FOUND",
          "APIルートが見つかりません。",
          404,
        );
      }
      const result = await service.getGame(userFrom(event), gameId);
      return jsonResponse(200, {
        data: {
          game: createGameView(result.state, result.viewer),
        },
        meta: {
          traceId: event.requestContext.requestId,
          serverTime: new Date().toISOString(),
        },
      });
    } catch (error) {
      const known =
        error instanceof ApplicationError
          ? error
          : new ApplicationError(
              "INTERNAL_ERROR",
              "サーバー内部でエラーが発生しました。",
              500,
            );
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

export const handler: GameQueryHandler = async (event) =>
  createGameQueryHandler(runtimeService())(event);
