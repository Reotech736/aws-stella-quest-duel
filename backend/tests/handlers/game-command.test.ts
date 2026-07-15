import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameService } from "../../src/application/game-service";
import { resignGame } from "../../src/domain/game/game-end";
import { initializeGame } from "../../src/domain/game/initialize-game";
import { createGameCommandHandler } from "../../src/handlers/game-command";

function event(
  routeKey: string,
  body: unknown,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: "2.0",
    routeKey,
    rawPath: routeKey.split(" ")[1] ?? "/",
    rawQueryString: "",
    headers: { "idempotency-key": "request-1" },
    requestContext: {
      accountId: "test",
      apiId: "test",
      domainName: "test",
      domainPrefix: "test",
      http: {
        method: "POST",
        path: "/v1/games/game-1",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "trace-1",
      routeKey,
      stage: "$default",
      time: "16/Jul/2026:02:00:00 +0900",
      timeEpoch: 1_784_138_400_000,
      authorizer: {
        principalId: "owner-user",
        integrationLatency: 0,
        jwt: {
          claims: {
            sub: "owner-user",
            username: "Owner",
          },
          scopes: [],
        },
      },
    },
    pathParameters: { gameId: "game-1" },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

const state = initializeGame({
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
  lastActionAt: "2026-07-16T02:00:00.000Z",
  abandonAt: "2026-07-17T02:00:00.000Z",
  random: () => 0.5,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("game-command handler", () => {
  it("カード操作をサービスへ渡して公開ゲーム状態を返す", async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      state,
      viewer: "OWNER",
      replay: false,
    });
    const handler = createGameCommandHandler({
      executeCommand,
    } as unknown as GameService);

    const response = await handler(
      event("POST /v1/games/{gameId}/commands", {
        expectedVersion: state.version,
        command: { type: "PLAY_CARD", cardId: "R1a" },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(executeCommand).toHaveBeenCalledWith(
      { userId: "owner-user", displayName: "Owner" },
      "game-1",
      state.version,
      { type: "PLAY_CARD", cardId: "R1a" },
      "request-1",
      expect.any(String),
    );
    expect(JSON.parse(response.body ?? "{}").data.acceptedCommand).toBe(
      "PLAY_CARD",
    );
  });

  it("投了をサービスへ渡して終了状態を返す", async () => {
    const ended = resignGame({
      state,
      actor: "OWNER",
      actionAt: "2026-07-16T02:01:00.000Z",
    });
    const resign = vi.fn().mockResolvedValue({
      state: ended,
      viewer: "OWNER",
      replay: false,
    });
    const handler = createGameCommandHandler({
      resign,
    } as unknown as GameService);

    const response = await handler(
      event("POST /v1/games/{gameId}/resign", {
        expectedVersion: state.version,
        confirmed: true,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(resign).toHaveBeenCalledWith(
      { userId: "owner-user", displayName: "Owner" },
      "game-1",
      state.version,
      "request-1",
      expect.any(String),
    );
    expect(JSON.parse(response.body ?? "{}").data.game.status).toBe(
      "COMPLETED",
    );
  });

  it("未知の例外は入力を含めずtraceIdと例外概要を記録する", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createGameCommandHandler({
      executeCommand: vi.fn().mockRejectedValue(new Error("DynamoDB failure")),
    } as unknown as GameService);

    const response = await handler(
      event("POST /v1/games/{gameId}/commands", {
        expectedVersion: state.version,
        command: { type: "PLAY_CARD", cardId: "R1a" },
      }),
    );

    expect(response.statusCode).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected game-command error",
      {
        traceId: "trace-1",
        routeKey: "POST /v1/games/{gameId}/commands",
        error: {
          name: "Error",
          message: "DynamoDB failure",
        },
      },
    );
  });
});
